import { EventArchiveButton,EventListFilter,EventListScope } from './EventArchive';
import { useAuth } from '../providers/AuthProvider';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EventRecord } from '../types/sdk';
import { Card } from './Card';
import { HelpHeading, ui } from './Page';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';
export function EventPicker({events,activeId,disabled,onSelect,onCreate,alwaysList=false,onDelete}:{onDelete?:(id:string)=>void;events:EventRecord[];activeId?:string;disabled:boolean;onSelect:(id:string)=>void;onCreate:()=>void;alwaysList?:boolean}) {
  const {user}=useAuth();const [scope,setScope]=useState<EventListScope>('current');const filtered=events.filter(e=>!!e.archived===(scope==='archived'));const [expanded,setExpanded]=useState(false);const [search,setSearch]=useState('');const [page,setPage]=useState(0);
  const active=events.find(e=>e.id===activeId);const visible=filtered.filter(e=>e.data.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const current=Math.min(page,Math.max(0,Math.ceil(visible.length/5)-1));
  if (alwaysList) return <Card>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
      <View style={{flex:1,minWidth:0}}><HelpHeading title="Meus eventos" help="teacher#select" compact /><Text style={ui.muted}>{events.length} {events.length===1?'evento':'eventos'}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Criar novo evento" accessibilityState={{disabled}} disabled={disabled} onPress={onCreate} style={({pressed})=>({minHeight:44,flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:12,borderRadius:10,backgroundColor:events.length?'#eef3ff':'#2456c7',opacity:disabled?0.5:pressed?0.7:1})}><Ionicons name="add" size={20} color={events.length?'#2456c7':'#fff'} /><Text style={{color:events.length?'#2456c7':'#fff',fontWeight:'700'}}>Novo evento</Text></Pressable>
    </View>
    <EventListFilter events={events} value={scope} onChange={v=>{setScope(v);setPage(0);}} disabled={disabled}/><Text style={[ui.muted,{fontSize:12}]}>Arquivar organiza só a sua lista, sem interromper a turma. Excluir apaga os dados após sua confirmação.</Text>
    {events.length>5 && <TextField label="Buscar eventos pelo nome" value={search} onChangeText={v=>{setSearch(v);setPage(0);}} editable={!disabled} />}
    {!events.length && <Text style={ui.muted}>Crie seu primeiro evento para começar.</Text>}
    {visible.slice(current*5,current*5+5).map(e=>{
      const selected=e.id===activeId;const status=e.data.status==='draft'?'Rascunho':'Publicado';
      return <View key={e.id} style={{gap:4}}><Pressable accessibilityRole="button" accessibilityLabel={`Gerenciar ${e.data.title}. ${status}${selected?', selecionado':''}`} accessibilityState={{disabled}} disabled={disabled} onPress={()=>onSelect(e.id)} style={({pressed})=>({flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:selected?'#2456c7':'#d8e0d6',borderRadius:12,padding:12,minHeight:76,backgroundColor:pressed?'#eef3ff':'#fff',opacity:disabled?0.55:1})}>
        <View style={{width:40,height:40,borderRadius:10,backgroundColor:'#eaf0ff',alignItems:'center',justifyContent:'center'}}><Ionicons name="calendar-outline" size={21} color="#2456c7" /></View>
        <View style={{flex:1,minWidth:0,gap:4}}><Text style={[ui.text,{fontWeight:'800'}]}>{e.data.title}</Text><View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:6}}><Text style={ui.badge}>{status}</Text>{e.archived&&<Text style={ui.badge}>Arquivado</Text>}{selected && <Text style={[ui.muted,{fontSize:12}]}>Selecionado</Text>}</View></View>
        <View style={{alignItems:'center'}}><Ionicons name="chevron-forward" size={22} color="#2456c7" /><Text style={{fontSize:12,fontWeight:'700',color:'#2456c7'}}>Gerenciar</Text></View>
      </Pressable><View style={{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'flex-end'}}><EventArchiveButton event={e} disabled={disabled}/>{onDelete&&(e.owner===user?.id||e.access_role==='admin')&&<Pressable accessibilityRole="button" accessibilityLabel={`Excluir ${e.data.title}`} disabled={disabled} onPress={()=>onDelete(e.id)} style={{minHeight:44,paddingHorizontal:12,flexDirection:'row',gap:6,alignItems:'center'}}><Ionicons name="trash-outline" size={18} color="#9b2535"/><Text style={{fontWeight:'700',color:'#9b2535'}}>Excluir</Text></Pressable>}</View></View>;
    })}
    {events.length>0 && !visible.length && <Text style={ui.muted}>{search?'Nenhum evento com esse nome. Tente outra busca.':scope==='archived'?'Nenhum evento arquivado.':'Nenhum evento em uso. Consulte Arquivados para restaurar.'}</Text>}
    {visible.length>5 && <View style={ui.row}><PrimaryButton label="Eventos anteriores" variant="secondary" disabled={disabled || !current} onPress={()=>setPage(current-1)} /><Text style={ui.muted}>Página {current+1} de {Math.ceil(visible.length/5)}</Text><PrimaryButton label="Próximos eventos" variant="secondary" disabled={disabled || (current+1)*5>=visible.length} onPress={()=>setPage(current+1)} /></View>}
  </Card>;
  return <Card>
    {active && !alwaysList ? <View style={ui.row}><View style={{flex:1,minWidth:200}}><Text style={ui.muted}>Evento selecionado para gerenciar</Text><HelpHeading title={active.data.title} help="teacher#select" /><Text style={ui.muted}>{active.data.status==='draft'?'Rascunho · ainda não aberto aos alunos':'Publicado · disponível para a turma'}</Text></View><View style={ui.row}><PrimaryButton label={expanded?'Fechar lista de eventos':`Trocar evento (${events.length})`} variant="secondary" disabled={disabled} onPress={()=>setExpanded(v=>!v)} /><PrimaryButton label="Novo evento" variant="secondary" disabled={disabled} onPress={onCreate} /></View></View> : <><HelpHeading title="Meus eventos" help="teacher#select" /><Text style={ui.text}>{events.length?'Escolha um evento criado por você ou compartilhado com você.':'Você ainda não criou eventos. Comece criando um para sua turma.'}</Text><PrimaryButton label="Novo evento" disabled={disabled} onPress={onCreate} /></>}
    {(alwaysList || expanded || (!active && !!events.length)) && <>
      <TextField label="Buscar eventos pelo nome" value={search} onChangeText={v=>{setSearch(v);setPage(0);}} editable={!disabled} />
      {visible.slice(current*5,current*5+5).map(e=><View key={e.id} style={{borderWidth:1,borderColor:e.id===activeId?'#2456c7':'#d8e0d6',borderRadius:12,padding:12,gap:8}}><View style={ui.row}><Text style={[ui.text,{flex:1,fontWeight:'700'}]}>{e.data.title}</Text><Text style={ui.badge}>{e.id===activeId?'Selecionado · ':''}{e.data.status==='draft'?'Rascunho':'Publicado'}</Text></View><PrimaryButton label={e.id===activeId && !alwaysList?'Gerenciando este evento':`Gerenciar ${e.data.title}`} variant="secondary" disabled={disabled || (e.id===activeId && !alwaysList)} onPress={()=>{onSelect(e.id);setExpanded(false);}} /></View>)}
      {!visible.length && <Text style={ui.muted}>{search?'Nenhum evento com esse nome. Tente outra busca.':scope==='archived'?'Nenhum evento arquivado.':'Nenhum evento em uso. Consulte Arquivados para restaurar.'}</Text>}
      {visible.length>5 && <View style={ui.row}><PrimaryButton label="Eventos anteriores" variant="secondary" disabled={disabled || !current} onPress={()=>setPage(current-1)} /><Text style={ui.muted}>Página {current+1} de {Math.ceil(visible.length/5)}</Text><PrimaryButton label="Próximos eventos" variant="secondary" disabled={disabled || (current+1)*5>=visible.length} onPress={()=>setPage(current+1)} /></View>}
    </>}
  </Card>;
}
