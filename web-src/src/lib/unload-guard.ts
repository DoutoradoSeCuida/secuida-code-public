import { useEffect } from 'react';
// Web-only exception: warn before browser navigation can discard an unconfirmed write.
export function useUnloadGuard(pending:boolean,_flush:()=>Promise<void>) {
  useEffect(()=>{if(!pending)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[pending]);
}
