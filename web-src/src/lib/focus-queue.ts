import type {FocusJournal,FocusEdge} from './visibility';
// Sequential acknowledgements make hidden/visible retry-safe and preserve order.
export function focusQueue(journal:FocusJournal,save:(j:FocusJournal)=>void,send:(edge:FocusEdge)=>Promise<void>,changed:(count:number,error:string)=>void){
 let flight:Promise<void>|null=null;let stopped=false;let lastAction=journal.queue.at(-1)?.action;
 let retryAt=0,failures=0,lastError:unknown;
 let retryTimer:ReturnType<typeof setTimeout>|undefined;
 async function drain(automatic=false){
   if(stopped || !journal.queue.length)return;
   if(flight)return flight;
   if(automatic && Date.now()<retryAt)throw lastError;
   clearTimeout(retryTimer);
   flight=Promise.resolve().then(async()=>{
     try{
       while(journal.queue.length&&!stopped){
         const edge=journal.queue[0];
         await send(edge);
         journal.queue=journal.queue.filter(x=>x.seq!==edge.seq);
         save(journal);changed(journal.queue.length,'');
         failures=0;retryAt=0;
       }
     }catch(e){
       lastError=e;
       const delay=Math.min(60000,2000*2**Math.min(failures++,5)*(.75+Math.random()*.5));
       retryAt=Date.now()+delay;
       changed(journal.queue.length,(e as Error).message);
       if(!stopped)retryTimer=setTimeout(()=>{void drain().catch(()=>{});},delay);
       throw e;
     }finally{flight=null;}
   });
   return flight;
 }
 async function push(action:FocusEdge['action'],source?:FocusEdge['source']){
   if(stopped)return;
   if(lastAction!==action){
     const edge={seq:++journal.seq,action,...(source?{source}:{})};
     journal.queue.push(edge);lastAction=action;save(journal);changed(journal.queue.length,'');
   }
   return drain(true);
 }
 return {push,drain,stop:()=>{stopped=true;clearTimeout(retryTimer);},pending:()=>journal.queue.length};
}
