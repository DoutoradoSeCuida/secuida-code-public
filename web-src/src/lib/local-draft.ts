import { validDelivery } from './delivery';
import type { Delivery } from './delivery';
import type { RunResult } from '../types/sdk';
export type LocalDraft = {code:string;language:string;baseCode:string;baseLanguage:string;practice?:{challengeVersion:number;results:RunResult[]};delivery?:Delivery};
type Store = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key=(user:number,event:string,challenge:string)=>`secuida-code-draft:${user}:${event}:${challenge}`;
export function draftStore(storage:Store|null) {
  return {
    read(user:number,event:string,challenge:string):LocalDraft|undefined {
      try {
        const value=storage?.getItem(key(user,event,challenge));
        if(!value)return;
        const d=JSON.parse(value);
        if(!d || !['code','language','baseCode','baseLanguage'].every(k=>typeof d[k]==='string'))return;
        if(d.delivery && (!validDelivery(d.delivery) || d.delivery.payload.challenge_id!==challenge || d.delivery.payload.code!==d.code || d.delivery.payload.language!==d.language))delete d.delivery;
        if(d.practice && (!Number.isInteger(d.practice.challengeVersion) || !Array.isArray(d.practice.results) ||
          !d.practice.results.every((r:RunResult)=>typeof r?.output==='string' && typeof r.engine==='string')))delete d.practice;
        return d;
      } catch { return; }
    },
    write(user:number,event:string,challenge:string,draft:LocalDraft):boolean {
      try { if(!storage)return false;storage.setItem(key(user,event,challenge),JSON.stringify(draft));return true; } catch {return false;}
    },
    clear(user:number,event:string,challenge:string):boolean {
      try {if(!storage)return false;storage.removeItem(key(user,event,challenge));return true;} catch{return false;}
    }
  };
}
export function draftRelation(d:LocalDraft,server:{code:string;language:string}):'synced'|'recover'|'conflict' {
  if(d.code===server.code && d.language===server.language)return 'synced';
  if(d.baseCode===server.code && d.baseLanguage===server.language)return 'recover';
  return 'conflict';
}
