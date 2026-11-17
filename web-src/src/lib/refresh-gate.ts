// Per-provider coordination. Never caches authorization or retries mutations.
export function refreshGate(now=Date.now) {
  let scope='',flight:Promise<void>|null=null,follow:Promise<void>|null=null,failures=0,nextAt=0;
  function run(key:string,work:()=>Promise<void>,background=false):Promise<void> {
    if(scope!==key){scope=key;flight=null;follow=null;failures=0;nextAt=0;}
    if(background && now()<nextAt)return Promise.resolve();
    if(flight){
      if(background)return flight;
      if(!follow){const waiting=flight.catch(()=>{}).then(()=>{if(scope!==key)return;follow=null;return run(key,work);});follow=waiting;}
      return follow;
    }
    const current=Promise.resolve().then(work).then(()=>{if(scope===key){failures=0;nextAt=now()+4000;}},e=>{if(scope===key){failures++;nextAt=now()+Math.min(60000,5000*2**Math.min(failures,4));}throw e;});
    flight=current;
    void current.finally(()=>{if(flight===current)flight=null;}).catch(()=>{});
    return current;
  }
  return {run};
}
