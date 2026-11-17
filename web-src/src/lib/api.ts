import { site } from './site';
import { beginRequest, endRequest, deferRefresh } from './poll';
import { requestUrl } from './request-url';
import { receiptRoutes, readRoutes, transient, retryDelay, waitRetry, retryWaiting } from './retry';
export function endpoint(base: string, path: string) {
  const url = new URL(base);
  const [route, query] = path.split('?', 2);
  const restRoute = url.searchParams.get('rest_route');
  if (restRoute !== null) url.searchParams.set('rest_route', restRoute.replace(/\/$/, '') + '/' + route);
  else url.pathname = url.pathname.replace(/\/$/, '') + '/' + route;
  for (const [key, value] of new URLSearchParams(query)) url.searchParams.append(key, value);
  return url;
}
export class ApiError extends Error { constructor(message: string, public status: number, public retryAfter:string|null=null, public code:string='') { super(message); } }
const expired = new Set<() => void>();
export function onSessionExpired(fn: () => void) { expired.add(fn); return () => { expired.delete(fn); }; }
let capabilityToken:string|null=null, capability:Promise<boolean>|null=null;
async function receiptsSupported(token:string){
  if(token!==capabilityToken || !capability){
    capabilityToken=token;
    capability=api<{retry_receipts?:number}>('health',token).then(x=>x.retry_receipts===1).catch(e=>{capability=null;throw e;});
  }
  return capability;
}
async function request<T>(path:string,headers:Record<string,string>,body:string|undefined,verb:string,signal?:AbortSignal,keepalive=false):Promise<T>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),65000);
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
  try{
    const url = endpoint(site().restUrl, path);
    if (url.origin !== window.location.origin) throw new ApiError('A API do WordPress precisa usar o mesmo endereço do aplicativo.',400);
    if (headers['X-WP-Nonce']) headers['X-WP-Nonce'] = site().nonce;
    const res=await fetch(requestUrl(url.href,verb),{method:verb,headers,credentials:'same-origin',body,signal:controller.signal,cache:'no-store',keepalive,redirect:'error'});
    const nonce = res.headers.get('X-WP-Nonce');
    if (nonce) site().nonce = nonce;
    deferRefresh(res.status);
    const text=await res.text();let data:any;
    try{data=JSON.parse(text);}catch{throw new ApiError('O site respondeu em um formato inesperado.',res.ok?502:res.status,res.headers.get('Retry-After'));}
    if(!res.ok){
      if(headers['X-WP-Nonce'] && (res.status===401 || data.code==='rest_cookie_invalid_nonce')){capability=null;expired.forEach(fn=>fn());}
      throw new ApiError(res.status>=500?'O site está temporariamente indisponível. Não foi possível confirmar esta ação.':data.message || `Não foi possível concluir (${res.status}).`,res.status,res.headers.get('Retry-After'),data.code || '');
    }
    return data as T;
  }catch(e){
    if(e instanceof ApiError)throw e;
    if(!signal?.aborted)deferRefresh(0);
    throw new ApiError(signal?.aborted?'Solicitação cancelada.':'Não foi possível conectar ao site. Não foi possível confirmar esta ação.',0);
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function api<T>(path:string,token?:string|null,body?:unknown,method?:string,signal?:AbortSignal,keepalive=false):Promise<T>{
  const headers:Record<string,string>={Accept:'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(token)headers['X-WP-Nonce']=site().nonce;
  const verb=method || (body===undefined?'GET':'POST');const route=path.split('?')[0];
  let safe=verb==='GET' || readRoutes.has(route);
  const values=body as Record<string,unknown>|undefined;
  if ((route==='ai/settings' && values?.key || route==='account/delete' && values?.password)
      && new URL(site().restUrl).protocol!=='https:') {
    throw new ApiError('Abra o site por HTTPS antes de enviar sua chave ou senha.',400);
  }
  if(route==='ai/request')safe=true; // The server journals each provider call by ticket and round.
  if(!keepalive && token && verb==='POST' && receiptRoutes.has(route) && await receiptsSupported(token)){
    if(signal?.aborted)throw new ApiError('Solicitação cancelada.',0);
    body={...values,_request_id:values?._request_id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`};safe=true;
  }
  const payload=body===undefined?undefined:JSON.stringify(body);let notifying=false;
  beginRequest();
  try{
    for(let attempt=0;;attempt++){
      if(signal?.aborted)throw new ApiError('Solicitação cancelada.',0);
      try{return await request<T>(path,headers,payload,verb,signal,keepalive);}
      catch(e){
        const err=e as ApiError;
        if(!safe || keepalive || signal?.aborted || attempt>=3 || !transient(err.status))throw e;
        const delay=retryDelay(attempt,err.retryAfter);if(delay===null)throw e;
        if(!notifying){notifying=true;retryWaiting(1);}
        await waitRetry(delay,signal);
      }
    }
  }finally{endRequest();if(notifying)retryWaiting(-1);}
}
