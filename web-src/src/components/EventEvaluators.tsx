import {router} from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../providers/AuthProvider';
import { useCode } from '../providers/CodeProvider';
import { api } from '../lib/api';
import { AIModel, Evaluators, EventRecord, Reasoning } from '../types/sdk';
import { Card } from './Card';
import { HelpHeading, Notice, ui } from './Page';
import { Choice } from './Choice';
import { TextField } from './TextField';
import { PrimaryButton } from './PrimaryButton';

const empty:Evaluators={gemini:{model:'',reasoning:'default'},nvidia:{model:'',reasoning:'default'}};
const labels:Record<string,string>={default:'Padrão do modelo',none:'Sem raciocínio',minimal:'Mínimo',low:'Baixo',medium:'Médio',high:'Alto',off:'Desligado',on:'Ligado'};
export function EventEvaluators({event,onBusyChange,onDirtyChange,otherDirty=false}:{event:EventRecord;onBusyChange?:(s:string)=>void;onDirtyChange?:(v:boolean)=>void;otherDirty?:boolean}){
 const {token}=useAuth();const state=useCode();const [value,setValue]=useState<Evaluators>(event.data.evaluators||empty);
 const [provider,setProvider]=useState<'gemini'|'nvidia'>('gemini');const [catalogs,setCatalogs]=useState<Partial<Record<'gemini'|'nvidia',AIModel[]>>>({});
 const [search,setSearch]=useState('');const [page,setPage]=useState(0);const [busy,setBusy]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('');
 const dirty=JSON.stringify(value)!==JSON.stringify(event.data.evaluators||empty);
 useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
 const selected=value[provider];const catalog=catalogs[provider];const info=catalog?.find(m=>m.id===selected.model);const rows=(catalog||[]).filter(m=>m.selectable&&m.id.toLowerCase().includes(search.toLowerCase()));const pages=Math.max(1,Math.ceil(rows.length/6));
 async function run(action:string,work:()=>Promise<void>){setBusy(action);onBusyChange?.('event-evaluators');setError('');setMessage('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy('');onBusyChange?.('');}}
 function select(model:string){setValue(v=>({...v,[provider]:{model,reasoning:'default'}}));}
 if(otherDirty)return <Card><HelpHeading title="Modelos de avaliação" help="teacher#evaluators"/><Notice text="Salve as configurações acima antes de configurar os avaliadores."/></Card>;
 return <Card><HelpHeading title="Modelos de avaliação" help="teacher#evaluators"/>
 <PrimaryButton label="Configurar minha chave em Minha IA" variant="secondary" disabled={!!busy} onPress={()=>router.push('/account')}/><Text style={ui.muted}>É a mesma chave salva em Minha IA, na sua conta. Cada professor usa a própria chave ao processar as entregas.</Text>
 <Text style={ui.text}>Você escolhe quem corrige. O aluno escolhe o modelo das dicas. A avaliação usa a chave e o provedor ativos do professor que processar a fila.</Text>
 {!event.data.evaluators&&<Notice text="Ainda não configurado: a fila usa o modelo ativo do professor. Escolha e salve os dois avaliadores para padronizar novas entregas."/>}
 <View style={ui.row}>{(['gemini','nvidia'] as const).map(p=><View key={p} style={{flex:1,minWidth:220,gap:6,borderLeftWidth:3,borderColor:'#17705f',paddingLeft:12}}><Text style={ui.h2}>{p==='gemini'?'Google Gemini':'NVIDIA'}</Text><Text selectable style={ui.text}>{value[p].model||'Escolha um modelo'}</Text><Text style={ui.muted}>{labels[value[p].reasoning]||value[p].reasoning}</Text></View>)}</View>
 <Choice label="Configurar avaliador" value={provider} disabled={!!busy} options={[{value:'gemini',label:'Google Gemini'},{value:'nvidia',label:'NVIDIA'}]} onChange={p=>{setProvider(p);setSearch('');setPage(0);setError('');}}/>
 <PrimaryButton label={`Consultar modelos ${provider==='gemini'?'Google':'NVIDIA'}`} variant="secondary" loading={busy==='catalog'} disabled={!!busy} onPress={()=>run('catalog',async()=>{const result=await api<{provider:string;details:AIModel[]}>(`ai/models?provider=${provider}`,token);setCatalogs(c=>({...c,[provider]:result.details}));setPage(0);setMessage('Catálogo carregado com sua chave. Disponibilidade e cota dependem da conta do professor.');})}/>
 <Text style={ui.muted}>Para consultar, cadastre sua chave desse provedor em Minha IA. Consultar o catálogo não altera seu modelo de dicas.</Text>
 <TextField label="Identificador do avaliador" helperText="Selecione no catálogo abaixo ou informe o identificador exato do modelo." value={selected.model} onChangeText={select} editable={!busy}/>
 {catalog&&<><TextField label="Buscar no catálogo de avaliadores" value={search} onChangeText={s=>{setSearch(s);setPage(0);}} editable={!busy}/><Text style={ui.muted}>{rows.length} modelos · página {page+1} de {pages}</Text>{rows.slice(page*6,page*6+6).map(m=><PrimaryButton key={m.id} label={(m.id===selected.model?'Selecionado: ':'')+m.id} variant="secondary" disabled={!!busy} onPress={()=>select(m.id)}/>)}<View style={ui.row}><PrimaryButton label="Página anterior de modelos" variant="secondary" disabled={!!busy||page===0} onPress={()=>setPage(p=>p-1)}/><PrimaryButton label="Próxima página de modelos" variant="secondary" disabled={!!busy||page+1>=pages} onPress={()=>setPage(p=>p+1)}/></View></>}
 {info&&<Choice label="Raciocínio do avaliador" value={selected.reasoning} disabled={!!busy} options={info.reasoning.options.map(v=>({value:v,label:labels[v]||v}))} onChange={(reasoning:Reasoning)=>setValue(v=>({...v,[provider]:{...v[provider],reasoning}}))}/>}
 {error&&<Notice text={error} error/>}{message&&<Notice text={message}/>}
 <Text style={ui.muted}>Salvando, as próximas entregas usarão o avaliador do provedor ativo do professor que processar a fila. Entregas já iniciadas mantêm a configuração anterior. Se o modelo falhar, não trocamos por outro nem concedemos pontos automaticamente.</Text>
 {otherDirty&&<Notice text="Salve primeiro os horários e regras alterados acima. Suas escolhas de avaliadores serão preservadas."/>}
 <PrimaryButton label="Salvar avaliadores do evento" loading={busy==='save'} disabled={!!busy||otherDirty||!dirty||!value.gemini.model.trim()||!value.nvidia.model.trim()} onPress={()=>run('save',async()=>{await api('event/settings',token,{event_id:event.id,version:event.version,evaluators:value});onDirtyChange?.(false);await state.reloadEvent();})}/>
 </Card>;
}
