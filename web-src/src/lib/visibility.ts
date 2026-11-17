import { storageKey } from './site';
export type FocusEdge={seq:number;action:'hidden'|'visible';source?:'page_visibility_client_reported'|'fullscreen_client_reported'|'window_focus_client_reported'};
export type FocusJournal={client_id:string;session_id?:string;fullscreen_armed?:boolean;focus_armed?:boolean;seq:number;queue:FocusEdge[]};
// Explicit web exception: only occurrence metadata; never code or credentials.
export function loadJournal(scope:string):FocusJournal{const key=storageKey(`focus.${scope}`);const raw=sessionStorage.getItem(key);if(raw){const j=JSON.parse(raw);if(typeof j.client_id==='string' && Array.isArray(j.queue))return j;}const j={client_id:crypto.randomUUID(),seq:0,queue:[]};sessionStorage.setItem(key,JSON.stringify(j));return j;}
export function saveJournal(scope:string,j:FocusJournal){sessionStorage.setItem(storageKey(`focus.${scope}`),JSON.stringify(j));}
export function subscribeVisibility(fn:(hidden:boolean)=>void){const update=()=>fn(document.hidden);const hide=()=>fn(true);document.addEventListener('visibilitychange',update);window.addEventListener('pagehide',hide);window.addEventListener('pageshow',update);window.addEventListener('online',update);return()=>{document.removeEventListener('visibilitychange',update);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',update);window.removeEventListener('online',update);};}
export function pageHidden(){return document.hidden;}
// Independent window signal; EventSession applies the accepted policy and deduplicates it.
export function pageFocused(){return typeof document.hasFocus==='function'?document.hasFocus():true;}
export function subscribeWindowFocus(fn:()=>void){
 let pending:ReturnType<typeof setTimeout>|undefined;
 const update=()=>{if(pending!==undefined)clearTimeout(pending);pending=setTimeout(()=>{pending=undefined;fn();},0);};
 window.addEventListener('blur',update);window.addEventListener('focus',update);window.addEventListener('pageshow',update);
 const timer=setInterval(fn,1000);
 return()=>{clearInterval(timer);if(pending!==undefined)clearTimeout(pending);window.removeEventListener('blur',update);window.removeEventListener('focus',update);window.removeEventListener('pageshow',update);};
}
export function timeNoticeSeen(key:string){try{const k=storageKey(`time.${key}`);const seen=sessionStorage.getItem(k)==='1';sessionStorage.setItem(k,'1');return seen;}catch{return true;}}
