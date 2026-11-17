import { api, ApiError } from './api';
import type { Attempt, Language, RunResult } from '../types/sdk';

// The operation is stored with the local draft, never with authentication/AI keys.
// A manual retry must replay the frozen evidence, not rerun the program.
export type Delivery = {
  attemptId:string;
  payload:{challenge_id:string;version:number;action:'submit';code:string;language:Language;results?:RunResult[];_request_id:string};
};
export function deliveryFor(a:Attempt,code:string,language:Language,results?:RunResult[]):Delivery {
  return {attemptId:a.id,payload:{challenge_id:a.data.challenge_id,version:a.version,action:'submit',code,language,...(results?{results}:{}),_request_id:`delivery-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`}};
}
export function validDelivery(value:unknown):value is Delivery {
  const d=value as Delivery|undefined,p=d?.payload;
  return !!d && typeof d.attemptId==='string' && !!p && p.action==='submit' && typeof p.challenge_id==='string' && Number.isInteger(p.version) && p.version>0 && typeof p.code==='string' && p.code.length<=60000 && ['python','c','cpp','java','javascript'].includes(p.language) && /^[a-zA-Z0-9-]{16,100}$/.test(p._request_id) && (p.results===undefined || Array.isArray(p.results));
}
export function deliveryConfirmed(d:Delivery,a:Attempt):boolean {
  return !!a?.data && a.id===d.attemptId && a.data.challenge_id===d.payload.challenge_id && a.version>d.payload.version && ['submitted','validated','rejected','revise'].includes(a.data.status) && !!a.data.submitted_at && a.data.code===d.payload.code && a.data.language===d.payload.language;
}
export class DeliveryUnconfirmed extends Error {
  constructor(){super('Ainda não foi possível confirmar sua entrega. O código e os testes estão preservados neste navegador. Use Verificar entrega antes de editar ou enviar novamente.');}
}
export async function sendDelivery(token:string|null|undefined,d:Delivery,request:typeof api=api):Promise<Attempt> {
  try{const result=await request<Attempt>('attempt',token,d.payload);if(deliveryConfirmed(d,result))return result;throw new ApiError('Recibo de entrega inválido.',502);}
  catch(e){
    if(!(e instanceof ApiError))throw e;
    const outsideSDK=[403,404].includes(e.status) && e.code!=='sc_code_error';
    if(!outsideSDK && ![0,408,409,429].includes(e.status) && e.status<500)throw e;
    // Receipts may have committed even when ALL HTTP responses were lost.
    // Only a canonical, exact frozen submission can resolve that ambiguity.
    try{const fresh=await request<Attempt>(`attempt/read?id=${encodeURIComponent(d.attemptId)}`,token);if(deliveryConfirmed(d,fresh))return fresh;}
    catch{/* Preserve the same operation for recovery, including after refresh. */}
    if(e.status===409)throw e;
    throw new DeliveryUnconfirmed();
  }
}
