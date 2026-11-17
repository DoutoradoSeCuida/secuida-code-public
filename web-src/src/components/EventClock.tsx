import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { EventRecord } from '../types/sdk';
import { ui } from './Page';
export function duration(seconds:number){const s=Math.max(0,Math.ceil(seconds));if(s>=86400)return `${Math.floor(s/86400)}d ${Math.floor(s%86400/3600)}h`;if(s>=3600)return `${Math.floor(s/3600)}h ${Math.floor(s%3600/60)}min`;if(s>=60)return `${Math.floor(s/60)}min ${s%60}s`;return `${s}s`;}
export function EventClock({event,serverNow,compact=false,onBoundary}:{event:EventRecord;serverNow?:number;compact?:boolean;onBoundary?:()=>void}){
 const [now,setNow]=useState(Date.now());const offset=useRef(0);const seenPhase=useRef('');
 useEffect(()=>{if(serverNow)offset.current=serverNow*1000-Date.now();setNow(Date.now()+offset.current);},[serverNow,event.id]);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()+offset.current),1000);return()=>clearInterval(t);},[]);
 const start=event.data.starts_at?Date.parse(event.data.starts_at):0,end=event.data.ends_at?Date.parse(event.data.ends_at):0;const phase=start>now?'waiting':end&&now>=end?'ended':'open';const remaining=end?(end-now)/1000:0;
 useEffect(()=>{if(seenPhase.current && seenPhase.current!==phase)onBoundary?.();seenPhase.current=phase;},[phase]);
 if(!start&&!end)return compact?null:<Text style={ui.muted}>{'Sem prazo de término. O professor poderá definir o horário durante a atividade.'}</Text>;
 const label=phase==='waiting'?`Começa em ${duration((start-now)/1000)}`:phase==='ended'?'Evento encerrado':end?`Termina em ${duration(remaining)}`:'Evento em andamento';
 return <View style={compact?{flexDirection:'row',gap:8,alignItems:'center'}:{gap:4,padding:12,borderRadius:10,backgroundColor:'#e8eefc'}}><Text style={[compact?{fontSize:12,fontWeight:'700',color:'#2456c7'}:ui.h2]}>{label}</Text>{!compact&&<><Text style={ui.muted}>{[start?`Início ${new Date(start).toLocaleString('pt-BR')}`:'Início livre',end?`Fim ${new Date(end).toLocaleString('pt-BR')}`:'Sem prazo de término'].join(' · ')}</Text></>}</View>;
}
