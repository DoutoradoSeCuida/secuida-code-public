import { storageKey } from '../lib/site';
import React, { createContext, useCallback, useContext, useEffect, useState, useRef } from 'react';
import { api, ApiError } from '../lib/api';
import { loadEventSnapshot } from '../lib/event-state';
import { EventDetail, EventSync, EventRecord, Language } from '../types/sdk';
import { refreshGate } from '../lib/refresh-gate';
import { poll } from '../lib/poll';
import { pageHidden } from '../lib/visibility';
import { usePathname } from 'expo-router';
import { useAuth } from './AuthProvider';
import { createEventGuard, EventSwitchBlocked } from '../lib/event-guard';
import { draftStore, LocalDraft } from '../lib/local-draft';
type Draft = LocalDraft & {language:Language};
type State = { registerEventGuard:(guard:()=>boolean)=>(()=>void); flushingDraft:boolean;flushDraft:()=>Promise<void>;registerDraftGuard:(guard:()=>Promise<void>)=>(()=>void); events: EventRecord[]; detail: EventDetail | null; loading: boolean; error: string; syncError:string; refresh: () => Promise<void>; select: (id: string) => Promise<void>; reloadEvent: (options?:{background?:boolean}) => Promise<void>; getDraft: (id: string) => LocalDraft | undefined; setDraft: (id: string, draft: Draft) => boolean; clearDraft: (id: string) => void };
const Context = createContext<State | null>(null);
export function CodeProvider({ children }: React.PropsWithChildren) {
  const { token, user } = useAuth(); const [events, setEvents] = useState<EventRecord[]>([]); const [detail, setDetail] = useState<EventDetail | null>(null);
  const path=usePathname();
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [syncError,setSyncError]=useState('');const gate=useRef(refreshGate()).current;
  const detailRef=useRef(detail);detailRef.current=detail;const loadingRef=useRef(loading);loadingRef.current=loading;
  const eventGuard=useRef(createEventGuard()).current;
  const registerEventGuard=useCallback((guard:()=>boolean)=>eventGuard.register(guard),[eventGuard]);
  const draftGuard=useRef<(()=>Promise<void>)|null>(null);const flushFlight=useRef<Promise<void>|null>(null);const [flushingDraft,setFlushingDraft]=useState(false);
  const registerDraftGuard=useCallback((guard:()=>Promise<void>)=>{draftGuard.current=guard;return()=>{if(draftGuard.current===guard)draftGuard.current=null;};},[]);
  const flushDraft=useCallback(async()=>{if(flushFlight.current)return flushFlight.current;const guard=draftGuard.current;if(!guard)return;setFlushingDraft(true);const flight=Promise.resolve().then(guard);flushFlight.current=flight;try{await flight;}finally{if(flushFlight.current===flight){flushFlight.current=null;setFlushingDraft(false);}}},[]);
  const requestSeq = useRef(0); const selecting = useRef(false);
  const drafts = useRef(new Map<string, Draft>());
  const tokenRef = useRef(token); tokenRef.current = token;
  useEffect(() => { drafts.current.clear();setDetail(null);setEvents([]);setSyncError(''); }, [token]);
  const refresh = useCallback(async () => {
    if (selecting.current) return;
    const seq = ++requestSeq.current;
    if (!token) { setDetail(null); setEvents([]); setLoading(false); setError(''); return; }
    setLoading(true); setError('');
    try {
      const data = await loadEventSnapshot(<T,>(path: string, body?: unknown) => api<T>(path, token, body));
      if (tokenRef.current !== token || requestSeq.current !== seq) return;
      if(activeRef.current && data.detail?.event.id!==activeRef.current){eventGuard.check(activeRef.current,data.detail?.event.id);await flushDraft();}
      if (tokenRef.current !== token || requestSeq.current !== seq) return;
      setEvents(data.events); setDetail(data.detail);
    } catch (e) {
      if (tokenRef.current !== token || requestSeq.current !== seq) return;
      if(!(e instanceof EventSwitchBlocked))setError(e instanceof Error ? e.message : 'Não foi possível carregar os eventos.'); throw e;
    } finally { if (tokenRef.current === token && requestSeq.current === seq) setLoading(false); }
  }, [token,flushDraft,eventGuard]);
  useEffect(() => { selecting.current=false; void refresh().catch(() => {}); return () => { requestSeq.current++; }; }, [refresh]);
  const select = async (id: string) => {
    eventGuard.check(activeRef.current,id);
    await flushDraft();
    if (selecting.current) throw new Error('Aguarde a abertura do evento atual.');
    const seq = ++requestSeq.current; selecting.current=true; setLoading(true); setError('');
    let confirmed=false;
    try {
      await api('events/active', token, { id });confirmed=true;
      const data = await loadEventSnapshot(<T,>(path: string, body?: unknown) => api<T>(path, token, body), id);
      if (tokenRef.current !== token || requestSeq.current !== seq) return;
      setEvents(data.events); setDetail(data.detail);
    } catch (e) {
      if (tokenRef.current === token && requestSeq.current === seq) { if(confirmed){setDetail(null);setError(e instanceof Error ? e.message : 'Não foi possível abrir o evento.');} }
      throw e;
    } finally { if (requestSeq.current === seq) { selecting.current=false; setLoading(false); } }
  };
  const activeRef=useRef(detail?.event.id); activeRef.current=detail?.event.id;
  const reloadEvent=useCallback(async(options?:{background?:boolean})=>{
    const id=detailRef.current?.event.id;if(!id || !token || loadingRef.current || selecting.current)return;
    return gate.run(`${token}:${id}`,async()=>{
      if(detailRef.current?.event.id!==id || tokenRef.current!==token || selecting.current)return;
      const current=detailRef.current,seq=++requestSeq.current;
      try {
        const delta=await api<EventSync>('event/sync',token,{id,challenge_revision:current.challenge_revision});
        if(tokenRef.current!==token || activeRef.current!==id || requestSeq.current!==seq)return;
        if(delta.event.id!==id)throw new Error('Não foi possível confirmar o evento atualizado.');
        const next={...delta,challenges:delta.challenges ?? current.challenges};detailRef.current=next;setDetail(next);setSyncError('');
      }catch(e){if(tokenRef.current===token && activeRef.current===id){if(e instanceof ApiError && e.code==='sc_code_error' && [403,404].includes(e.status)){detailRef.current=null;setDetail(null);setSyncError('');setError('Este evento não está mais disponível para sua conta.');}else setSyncError('Não foi possível atualizar o evento. Mostramos os últimos dados recebidos e tentaremos novamente automaticamente.');}throw e;}
    },!!options?.background);
  },[token,gate]);
  useEffect(()=>{setSyncError('');if(!token || !detail?.event.id)return;return poll(()=>reloadEvent({background:true}),path.startsWith('/teacher')?10000:60000,()=>!pageHidden(),false);},[token,detail?.event.id,reloadEvent,path]);
  const local=()=>{try{return draftStore(typeof localStorage==='undefined'?null:{getItem:key=>localStorage.getItem(storageKey(key)),setItem:(key,value)=>localStorage.setItem(storageKey(key),value),removeItem:key=>localStorage.removeItem(storageKey(key))});}catch{return draftStore(null);}};
  const eventId=detail?.event.id;
  return <Context.Provider value={{ registerEventGuard,flushingDraft,flushDraft,registerDraftGuard,events, detail, loading, error, syncError, refresh, select, reloadEvent,
    getDraft: id => eventId ? drafts.current.get(`${eventId}:${id}`) || (user?.id ? local().read(user.id,eventId,id) : undefined) : undefined,
    setDraft: (id, draft) => {
      if(!eventId)return false;
      drafts.current.set(`${eventId}:${id}`,draft);
      return !!user?.id && local().write(user.id,eventId,id,draft);
    },
    clearDraft: id => {
      if(!eventId)return;
      drafts.current.delete(`${eventId}:${id}`);
      if(user?.id)local().clear(user.id,eventId,id);
    },
  }}>{children}</Context.Provider>;
}
export function useCode() { const ctx = useContext(Context); if (!ctx) throw new Error('CodeProvider ausente'); return ctx; }

export function useOptionalCode() { return useContext(Context); }
