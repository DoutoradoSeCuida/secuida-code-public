// Transport retries never infer whether a write committed: the SDK receipt does.
export const receiptRoutes = new Set(['events/archive','evaluation/prepare','evaluation/release','attempt','assessment','ai/complete','hint/hide','teams','teams/invite','teams/join','claims/release','team/ops','focus/begin','focus/end']);
// Focus updates already deduplicate by session/sequence; ping only refreshes presence.
export const readRoutes = new Set(['evaluation/list','events/read','event/read','event/sync','monitor/read','monitor/attempt','focus/read','collab/list','focus/update']);
export function transient(status:number){return status===0 || status===408 || status===429 || (status>=500 && status<=599);}
export function retryDelay(attempt:number, retryAfter:string|null, now=Date.now(), random=Math.random()) {
  const seconds=retryAfter===null ? NaN : Number(retryAfter);
  const server=retryAfter===null?0:Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(retryAfter)-now)||0;
  // Do not silently keep a foreground action waiting for minutes.
  return server>60000 ? null : Math.max(server,2000*2**attempt*(1+random));
}
export function waitRetry(ms:number,signal?:AbortSignal){return new Promise<void>((resolve,reject)=>{
  const stop=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(new Error('Solicitação cancelada.'));};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},ms);
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
});}
let waiting=0;const listeners=new Set<()=>void>();
export const retrySnapshot=()=>waiting;
export const subscribeRetry=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export function retryWaiting(delta:number){waiting=Math.max(0,waiting+delta);listeners.forEach(fn=>fn());}
