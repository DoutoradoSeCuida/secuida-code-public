import React,{createContext,useContext,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import { ActivityIndicator,Modal,Platform,Text,View } from 'react-native';
import { router,usePathname } from 'expo-router';
import { useAuth } from '../providers/AuthProvider';
import { useCode } from '../providers/CodeProvider';
import { useFeedback } from '../providers/FeedbackProvider';
import { api,ApiError } from '../lib/api';
import { loadJournal,saveJournal,subscribeVisibility,pageHidden,timeNoticeSeen,pageFocused,subscribeWindowFocus } from '../lib/visibility';
import { fullscreenState,subscribeFullscreen,requestEventFullscreen,exitEventFullscreen } from '../lib/fullscreen';
import { screenActivity,eventWindow,focusStageReady } from '../lib/screen-activity';
import { focusQueue } from '../lib/focus-queue';
import { poll } from '../lib/poll';
import { FocusState } from '../types/sdk';
import { deadlineWindow,crossedTimeCuts } from '../lib/event-time';
import { PrimaryButton } from './PrimaryButton';
type Session={data:FocusState|null;busy:boolean;pending:number;error:string;ready:boolean;focusAway:boolean;focusNotice:boolean;dismissFocusNotice:()=>void;screenWanted:boolean;screenActive:boolean;screenSupported:boolean;screenError:string;enterScreen:()=>Promise<boolean>;leaveScreen:()=>Promise<void>;begin:(takeover?:boolean)=>Promise<void>;end:()=>Promise<void>;reload:()=>Promise<void>};
const Context=createContext<Session|null>(null);
export function EventSessionProvider({children}:React.PropsWithChildren){
 const {token,user}=useAuth();const state=useCode();const {showFeedback}=useFeedback();const path=usePathname();const d=state.detail;const eventId=d?.event.id;const member=!!d?.members.some(m=>m.user_id===user?.id);const stageReady=focusStageReady(d,user?.id);const enabled=!!d?.event.data.focus_policy?.enabled&&member&&stageReady;const scope=`${user?.id}.${eventId}`;const current=useRef(scope);current.current=scope;
 const [record,setRecord]=useState<{scope:string;value:FocusState}|null>(null);const data=record?.scope===scope?record.value:null;const [busy,setBusy]=useState(false);const [pending,setPending]=useState(0);const [error,setError]=useState('');const queue=useRef<ReturnType<typeof focusQueue>|null>(null);const signal=useRef<()=>void>(()=>{});const penaltyRef=useRef<number|null>(null);const exitCountRef=useRef(0);
 const full=useSyncExternalStore(subscribeFullscreen,fullscreenState,fullscreenState);const [wanted,setWanted]=useState(false);const wantedRef=useRef(false);const [screenLeaving,setScreenLeaving]=useState(false);const [screenError,setScreenError]=useState('');const [now,setNow]=useState(Date.now());const offset=useMemo(()=>d?.server_now?d.server_now*1000-Date.now():0,[d?.server_now]);const window=eventWindow(d?.event.data,now+offset);const eligible=Platform.OS==='web'&&member&&stageReady&&window.active;const screenWanted=wanted&&eligible;
 const [endOpen,setEndOpen]=useState(false);const endSeen=useRef('');
 const focused=useSyncExternalStore(subscribeWindowFocus,pageFocused,()=>true);const [focusNotice,setFocusNotice]=useState(false);const focusArmed=useRef(false);const focusScope=useRef(scope);
 useEffect(()=>{if(focusScope.current!==scope){focusScope.current=scope;focusArmed.current=false;setFocusNotice(false);}if(!screenWanted){focusArmed.current=false;setFocusNotice(false);return;}if(focused){focusArmed.current=true;return;}if(focusArmed.current)setFocusNotice(true);},[screenWanted,focused,scope]);
 function setScreen(value:boolean){wantedRef.current=value;setWanted(value);signal.current();}
 function update(next:FocusState,expected=scope){if(current.current!==expected)return;if(penaltyRef.current!==null&&next.penalty>penaltyRef.current)showFeedback({title:`Saída registrada · desconto total ${next.penalty} ponto(s)`,message:'Confira a ocorrência em Regras. O professor pode revisar.',tone:'warning',durationMs:10000});else if(penaltyRef.current!==null&&next.exits.length>exitCountRef.current&&next.exits.at(-1)?.data.status==='warning')showFeedback({title:'Aviso de saída da tela',message:'Nas próximas saídas acima da tolerância, as regras do evento descontam pontos.',tone:'warning',durationMs:10000});penaltyRef.current=next.penalty;exitCountRef.current=next.exits.length;setRecord({scope:expected,value:next});}
 async function reload(){if(!enabled||!eventId||Platform.OS!=='web')return;const expected=scope;try{update(await api<FocusState>('focus/read',token,{event_id:eventId}),expected);if(current.current===expected)setError('');}catch(e){if(current.current===expected)setError((e as Error).message);}}
 function enterScreen(){setScreenError('');if(!eligible)return Promise.resolve(false);setScreen(true);return requestEventFullscreen();}
 async function leaveScreen(){setScreenLeaving(true);setScreenError('');try{await state.flushDraft();setScreen(false);await exitEventFullscreen();router.replace('/');}catch(e){setScreenError((e as Error).message);}finally{setScreenLeaving(false);}}
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(timer);},[]);
 useEffect(()=>{setRecord(null);setError('');setPending(0);penaltyRef.current=null;exitCountRef.current=0;if(enabled)void reload();},[eventId,token,enabled]);
 // If the initial session read fails, retry without requiring a manual action.
 useEffect(()=>{if(!enabled||data||!eventId||Platform.OS!=='web')return;return poll(reload,60000,()=>!pageHidden(),false);},[enabled,!!data,eventId,token]);
 // CodeProvider refreshes the event, including monitoring changes while off.
 // Route changes to the event, including direct links, attempt fullscreen. A rejected
 // request is recovered by a user gesture in the gate; no silent permission bypass.
 useEffect(()=>{if(eligible&&['/train','/team','/ranking','/rules'].includes(path)){if(!wantedRef.current)void enterScreen();}else if(path==='/'||path.startsWith('/teacher')||['/admin','/monitor'].includes(path)){setScreen(false);void exitEventFullscreen();}},[path,eligible,eventId]);
 useEffect(()=>{if(!eligible){setScreen(false);void exitEventFullscreen();}},[eligible,eventId,token]);
 useEffect(()=>()=>{void exitEventFullscreen();},[]);
 useEffect(()=>{signal.current();},[full.active,full.supported,wanted]);
 useEffect(()=>{
  if(Platform.OS!=='web'||!enabled||!eventId||!data?.session?.active)return;
  let journal;try{journal=loadJournal(scope);}catch{setError('Não foi possível guardar o registro desta sessão. Verifique as permissões de armazenamento do navegador.');return;}
  const session=data.session;if(journal.client_id!==session.client_id){setError('Esta participação está aberta em outra aba. Abra Regras para retomar aqui.');return;}
  if(journal.session_id!==session.id){journal={...journal,session_id:session.id,seq:session.seq,queue:[],fullscreen_armed:false,focus_armed:false};saveJournal(scope,journal);}else journal.seq=Math.max(journal.seq,session.seq);
  const expected=scope;const id=eventId;setPending(journal.queue.length);
  const q=focusQueue(journal,j=>saveJournal(scope,j),async edge=>{let result:FocusState;try{result=await api<FocusState>('focus/update',token,{event_id:id,session_id:session.id,...edge},undefined,undefined,true);}catch(e){if(e instanceof ApiError&&e.status===409){void reload();void state.reloadEvent();}throw e;}update(result,expected);},(count,message)=>{if(current.current===expected){setPending(count);setError(message);}});queue.current=q;
  const sample=(hidden=pageHidden())=>{const observed=fullscreenState();if(!wantedRef.current||!observed.supported)journal.fullscreen_armed=false;else if(observed.active)journal.fullscreen_armed=true;if(pageFocused())journal.focus_armed=true;try{saveJournal(scope,journal);}catch{setError('Não foi possível guardar os registros de saída. Confira as permissões do navegador.');return;}const activity=screenActivity(hidden,observed.active,!!d?.event.data.focus_policy?.fullscreen_exits&&wantedRef.current&&!!journal.fullscreen_armed,pageFocused(),!!d?.event.data.focus_policy?.focus_exits&&!!journal.focus_armed);void q.push(activity.action,activity.source).catch(()=>{});};signal.current=()=>sample();
  // A previous departure remains pending until all accepted signals recover.
  // Fullscreen disarms on internal departure; focus and visibility keep monitoring. The shared queue deduplicates the episode.
  sample();const remove=subscribeVisibility(sample);const removeFull=subscribeFullscreen(()=>sample());const removeFocus=subscribeWindowFocus(()=>sample());
  const stopPresence=poll(async()=>{
    try{
      await api('focus/ping',token,{event_id:id,session_id:session.id});
      if(current.current===expected && !q.pending())setError('');
    }catch(e){
      if(current.current===expected && e instanceof ApiError && e.status===409)void reload();
      throw e;
    }
  },75000,()=>!pageHidden() && !q.pending(),false);
  return()=>{remove();removeFull();removeFocus();stopPresence();q.stop();if(queue.current===q){queue.current=null;signal.current=()=>{};}};
 },[eventId,token,enabled,data?.session?.id,data?.session?.active,d?.event.data.focus_policy?.fullscreen_exits,d?.event.data.focus_policy?.focus_exits]);
 // End the presentation on the local synchronized deadline even if the network is
 // offline. The server clamps any pending incident to its own deadline.
 const ending=useRef('');const endRetryAt=useRef(0);useEffect(()=>{if(!window.ended||!enabled||!eventId||!data?.session?.active)return;const key=`${scope}.${data.session.id}.${d?.event.data.ends_at}`;if(ending.current===key||Date.now()<endRetryAt.current)return;ending.current=key;const expected=scope;void(async()=>{try{await queue.current?.push('visible');update(await api<FocusState>('focus/end',token,{event_id:eventId,session_id:data.session!.id}),expected);}catch(e){ending.current='';endRetryAt.current=Date.now()+15000;if(current.current===expected)setError(`O prazo terminou; há registros aguardando sincronização. Tentaremos novamente automaticamente. ${(e as Error).message}`);}})();},[now,window.ended,enabled,eventId,data?.session?.id,data?.session?.active,d?.event.data.ends_at]);
 useEffect(()=>{if(!member||!eventId||!window.ended){if(!window.ended)endSeen.current='';return;}const key=`${scope}:${d?.event.data.ends_at}`;if(endSeen.current!==key){endSeen.current=key;setEndOpen(true);}},[member,eventId,window.ended,scope,d?.event.data.ends_at]);
 const scheduleSeen=useRef<{scope:string;start:string;end:string}|null>(null);
 useEffect(()=>{if(!d||!member)return;const next={scope,start:d.event.data.starts_at,end:d.event.data.ends_at},old=scheduleSeen.current;scheduleSeen.current=next;if(old?.scope===scope&&(old.start!==next.start||old.end!==next.end))showFeedback({title:'Horários atualizados pelo professor',message:next.end?`Novo término: ${new Date(next.end).toLocaleString('pt-BR')}.`:'O evento está sem prazo de término.',durationMs:7000});},[scope,member,d?.event.data.starts_at,d?.event.data.ends_at]);
 useEffect(()=>{if(!eventId||!d||!member)return;const range=deadlineWindow(d.event.data,Date.now()+offset);if(!range)return;let previous=Date.now()+offset;const timer=setInterval(()=>{if(pageHidden())return;const now=Date.now()+offset,left=range.end-now;let announce=false;for(const cut of crossedTimeCuts(previous,now,range.start,range.end))if(!timeNoticeSeen(`${user?.id}:${eventId}:${range.end}:${cut}`))announce=true;if(announce){const minutes=Math.ceil(left/60000);showFeedback({title:'Prazo do evento',message:minutes>=1440?`Faltam ${Math.ceil(minutes/1440)} dias.`:minutes>=60?`Faltam ${Math.floor(minutes/60)}h e ${minutes%60}min.`:`Faltam ${minutes} minuto(s).`,durationMs:7000});}previous=now;},1000);return()=>clearInterval(timer);},[eventId,d?.event.data.starts_at,d?.event.data.ends_at,d?.event.data.schedule_updated_at,d?.event.data.published_at,user?.id,member,offset]);
 async function begin(takeover=false){if(!eventId)return;const screen=enterScreen();setBusy(true);setError('');try{await state.flushDraft();const journal=loadJournal(scope);if(queue.current)await queue.current.drain();const result=await api<FocusState>('focus/begin',token,{event_id:eventId,platform:Platform.OS,accepted_version:d?.event.data.focus_policy?.version,client_id:journal.client_id,takeover});update(result);await state.reloadEvent();await screen;}catch(e){setError((e as Error).message);throw e;}finally{setBusy(false);}}
 async function end(){if(!eventId||!data?.session)return;setBusy(true);try{await state.flushDraft();await queue.current?.drain();update(await api<FocusState>('focus/end',token,{event_id:eventId,session_id:data.session.id}));setScreen(false);await exitEventFullscreen();}catch(e){setError((e as Error).message);throw e;}finally{setBusy(false);}}
 let mine=false;try{mine=Platform.OS==='web'&&!!data?.session&&loadJournal(scope).client_id===data.session.client_id;}catch{}
 const ready=!enabled||(mine&&!!data?.session?.active);
 return <Context.Provider value={{data,busy,pending,error,ready,focusAway:screenWanted&&!focused,focusNotice,dismissFocusNotice:()=>setFocusNotice(false),screenWanted,screenActive:full.active,screenSupported:full.supported,screenError:screenError||full.error,enterScreen,leaveScreen,begin,end,reload}}>{children}
  <Modal visible={endOpen} transparent animationType="fade" onRequestClose={()=>setEndOpen(false)}><View style={{flex:1,backgroundColor:'#14233499',justifyContent:'center',padding:20}}><View accessibilityViewIsModal style={{width:'100%',maxWidth:520,alignSelf:'center',backgroundColor:'#fff',borderRadius:16,padding:20,gap:14}}><Text accessibilityRole="header" style={{fontSize:22,fontWeight:'800',color:'#172b3a'}}>Evento encerrado</Text><Text style={{fontSize:15,lineHeight:23,color:'#172b3a'}}>O prazo terminou. Novas entregas estão encerradas; códigos em edição não foram enviados automaticamente. Você pode consultar suas tentativas e o ranking.</Text><Text style={{fontSize:14,lineHeight:21,color:'#5f716d'}}>O ranking pode mudar enquanto o professor avalia entregas pendentes ou revisa resultados.</Text><PrimaryButton label="Ver ranking" onPress={()=>{setEndOpen(false);router.push('/ranking');}}/><PrimaryButton label="Continuar na tela" variant="secondary" onPress={()=>setEndOpen(false)}/></View></View></Modal>
  <Modal visible={screenWanted&&full.supported&&!full.active} transparent animationType="fade" onRequestClose={()=>{}}><View style={{flex:1,backgroundColor:'#14233488',justifyContent:'center',alignItems:'center',padding:20}}><View accessibilityViewIsModal style={{width:'100%',maxWidth:440,padding:22,gap:14,borderRadius:16,backgroundColor:'#fff'}}><Text accessibilityRole="header" style={{fontSize:22,fontWeight:'800',color:'#172b3a'}}>Continue em tela cheia</Text><Text style={{fontSize:15,lineHeight:23,color:'#172b3a'}}>Seu código está preservado. Retome a tela cheia para continuar no evento.</Text>{(screenError||full.error)&&<Text accessibilityRole="alert" style={{color:'#9b2535',fontSize:14}}>{screenError||full.error}</Text>}{full.pending&&<ActivityIndicator accessibilityLabel="Abrindo tela cheia"/>}<PrimaryButton label="Retomar em tela cheia" loading={full.pending} disabled={screenLeaving} onPress={()=>{void enterScreen();}}/><PrimaryButton label="Sair da tela do evento" variant="secondary" loading={screenLeaving} disabled={full.pending} onPress={()=>void leaveScreen()}/><Text style={{fontSize:12,lineHeight:18,color:'#5f716d'}}>{enabled?'Sair volta à abertura. O acompanhamento de saídas da página continua até o prazo do evento.':'Sair volta à abertura e mantém sua inscrição e seu código.'}</Text></View></View></Modal>
 </Context.Provider>;
}
export function useEventSession(){const v=useContext(Context);if(!v)throw new Error('Sessão de evento ausente');return v;}
export function useOptionalEventSession(){return useContext(Context);}
