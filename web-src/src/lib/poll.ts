// Shared admission gate for display refreshes only. Foreground actions bypass it.
let requests = 0;
let polling = false;
let quietUntil = 0;
export function beginRequest() { requests++; }
export function endRequest() { requests = Math.max(0, requests - 1); }
export function deferRefresh(status: number) {
  if (status === 0 || status === 429 || status >= 500) {
    quietUntil = Math.max(quietUntil, Date.now() + 30000 + Math.random() * 30000);
  }
}
export function poll(task:()=>Promise<unknown>, interval:number, visible=()=>true, immediate=true) {
  let stopped=false, timer:ReturnType<typeof setTimeout>|undefined, failures=0;
  const later=(delay:number)=>{if(!stopped)timer=setTimeout(tick,Math.round(delay));};
  const schedule=()=>later(Math.min(300000,interval*2**Math.min(failures,4))*(.75+Math.random()*.5));
  async function tick() {
    if(stopped)return;
    if(!visible()){schedule();return;}
    if(requests || polling || Date.now()<quietUntil) {
      later(Math.max(0,quietUntil-Date.now())+500+Math.random()*1500);return;
    }
    polling=true;
    try {await task();failures=0;} catch {failures++;}
    finally {polling=false; schedule();}
  }
  // Spread mounting/navigation bursts as well as subsequent refreshes.
  if(immediate)later(500+Math.random()*4500);else schedule();
  return()=>{stopped=true;if(timer)clearTimeout(timer);};
}
