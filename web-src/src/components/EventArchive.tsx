import { useState } from 'react';
import { ActivityIndicator,Pressable,Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../providers/AuthProvider';
import { useCode } from '../providers/CodeProvider';
import { useFeedback } from '../providers/FeedbackProvider';
import { api } from '../lib/api';
import { EventRecord } from '../types/sdk';
import { Choice } from './Choice';
export type EventListScope='current'|'archived';
export function EventListFilter({events,value,onChange,disabled}:{events:EventRecord[];value:EventListScope;onChange:(v:EventListScope)=>void;disabled?:boolean}){
 const archived=events.filter(e=>e.archived).length;
 return <Choice label="Mostrar eventos" value={value} disabled={disabled} onChange={v=>onChange(v as EventListScope)} options={[{value:'current',label:`Em uso (${events.length-archived})`},{value:'archived',label:`Arquivados (${archived})`}]}/>;
}
export function EventArchiveButton({event,disabled}:{event:EventRecord;disabled?:boolean}){
 const {token}=useAuth(),state=useCode(),{showFeedback}=useFeedback();const [busy,setBusy]=useState(false);
 async function toggle(){if(busy||disabled)return;setBusy(true);try{await state.flushDraft();await api('events/archive',token,{id:event.id,version:event.list_version??0,archived:!event.archived});await state.refresh();showFeedback({title:event.archived?'Evento restaurado':'Evento arquivado',message:event.archived?'Ele voltou à lista Em uso.':'Consulte ou restaure em Arquivados. A participação da turma continua igual.',tone:'success'});}catch(e){showFeedback({title:'Não foi possível atualizar a lista',message:`${(e as Error).message} Atualize a lista e tente novamente.`,tone:'error',durationMs:9000});}finally{setBusy(false);}}
 return <Pressable accessibilityRole="button" accessibilityLabel={`${event.archived?'Restaurar':'Arquivar'} ${event.data.title}`} accessibilityState={{disabled:!!disabled||busy,busy}} disabled={disabled||busy} onPress={()=>void toggle()} style={({pressed})=>({minHeight:44,paddingHorizontal:12,borderRadius:9,flexDirection:'row',alignItems:'center',gap:6,backgroundColor:pressed?'#eef3ff':'transparent',opacity:(disabled||busy)?0.6:1})}>{busy?<ActivityIndicator size="small" color="#2456c7"/>:<Ionicons name={event.archived?'arrow-undo-outline':'archive-outline'} size={18} color="#34495a"/>}<Text style={{fontSize:14,fontWeight:'700',color:'#34495a'}}>{event.archived?'Restaurar':'Arquivar'}</Text></Pressable>;
}
