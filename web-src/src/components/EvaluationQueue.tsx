import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { api } from '../lib/api';
import { evaluateQueued } from '../lib/ai';
import { useAuth } from '../providers/AuthProvider';
import { useCode } from '../providers/CodeProvider';
import { Card } from './Card';
import { HelpHeading, Notice, ui } from './Page';
import { PrimaryButton } from './PrimaryButton';
import { Choice } from './Choice';
type Queue={items:{id:string;state:'queued'|'running'|'retry'|'review';message:string}[]};
export function EvaluationQueue({eventId}:{eventId:string}){
 const {token}=useAuth();const state=useCode();const [queue,setQueue]=useState<Queue>({items:[]});const [busy,setBusy]=useState(false);const [automatic,setAutomatic]=useState<'off'|'30'|'60'|'120'>('off');
 const [message,setMessage]=useState('');const [error,setError]=useState('');const active=useRef(false);const flight=useRef(false);const stopAfter=useRef(false);const controller=useRef<AbortController|null>(null);
 const cycleRef=useRef<()=>Promise<void>>(async()=>{});
 async function refresh(){const q=await api<Queue>('evaluation/list',token,{event_id:eventId});if(active.current)setQueue(q);return q;}
 useFocusEffect(useCallback(()=>{active.current=true;setBusy(flight.current);void refresh().catch(e=>setError(e.message));return()=>{active.current=false;setAutomatic('off');stopAfter.current=true;controller.current?.abort();};},[eventId,token]));
 async function cycle(){
  if(flight.current||!active.current||!token)return;flight.current=true;stopAfter.current=false;setBusy(true);setError('');setMessage('Consultando entregas pendentes…');controller.current=new AbortController();
  let done=0,failed=0;
  try{const q=await refresh();const batch=q.items.filter(x=>x.state==='queued').slice(0,5);
   for(const item of batch){if(!active.current||stopAfter.current)break;setMessage(`Avaliando entrega ${done+failed+1} de ${batch.length}…`);
    try{await evaluateQueued(token,item.id,controller.current.signal);done++;}
    catch(e){failed++;if(active.current)setError((e as Error).message);}
   }
   if(active.current){await refresh();await state.reloadEvent();setMessage(`${done} avaliação(ões) registrada(s).${failed?` ${failed} entrega(s) preservada(s) para nova tentativa.`:batch.length?' Ranking atualizado.':' Nenhuma entrega pronta neste momento.'}`);}
  }catch(e){if(active.current)setError((e as Error).message);}finally{flight.current=false;if(active.current)setBusy(false);}
 }
 cycleRef.current=cycle;
 useEffect(()=>{if(automatic==='off'||busy)return;const timer=setTimeout(()=>{if(active.current)void cycleRef.current();},Number(automatic)*1000);return()=>clearTimeout(timer);},[automatic,busy,queue]);
 const counts=(s:string)=>queue.items.filter(x=>x.state===s).length;
 return <Card><HelpHeading title="Avaliar entregas pendentes" help="teacher#queue"/>
 <Text style={ui.text}>Usa sua chave de IA e o avaliador definido para o provedor ativo. Os alunos podem continuar enquanto você avalia.</Text>
 <View style={ui.row}><Text style={ui.badge}>{counts('queued')} prontas</Text><Text style={ui.muted}>{counts('running')} em avaliação · {counts('retry')} aguardando nova tentativa · {counts('review')} para revisão manual</Text></View>
 <Choice label="Avaliação periódica nesta tela" value={automatic} onChange={setAutomatic} options={[{value:'off',label:'Manual'},{value:'30',label:'A cada 30 s'},{value:'60',label:'A cada 1 min'},{value:'120',label:'A cada 2 min'}]}/>
 <Text style={ui.muted}>Até cinco entregas por ciclo, uma por vez. O intervalo começa após o ciclo. Mantenha esta tela aberta; ao sair, a fila permanece salva.</Text>
 <View style={ui.row}><PrimaryButton label="Avaliar pendentes" loading={busy} disabled={busy} onPress={()=>void cycle()}/><PrimaryButton label={busy?'Parar após esta avaliação':'Atualizar fila'} variant="secondary" onPress={()=>{if(busy){stopAfter.current=true;setAutomatic('off');setMessage('O ciclo vai parar após a avaliação atual.');}else void refresh().catch(e=>setError(e.message));}}/></View>
 {!!message&&<View accessibilityLiveRegion="polite" style={{backgroundColor:busy?'#e8efff':error?'#fff0f1':'#e9f6ee',borderLeftWidth:4,borderColor:busy?'#2456c7':error?'#a12d3b':'#17705f',padding:12,borderRadius:8,flexDirection:'row',alignItems:'center',gap:10}}>{busy&&<ActivityIndicator color="#2456c7"/>}<Text style={[ui.text,{flex:1,fontWeight:'700',color:busy?'#1c479f':error?'#9b2535':'#17705f'}]}>{message}</Text></View>}{!!error&&<Notice text={error} error/>}
 {!!counts('review')&&<Notice text="Entregas sem resultados de testes precisam da revisão manual abaixo. Elas não recebem zero automaticamente."/>}
 </Card>;
}
