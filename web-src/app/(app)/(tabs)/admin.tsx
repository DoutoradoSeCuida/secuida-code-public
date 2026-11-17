import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../../../src/lib/api';
import { useAuth } from '../../../src/providers/AuthProvider';
import { Page, Notice, Busy, HelpHeading, ui } from '../../../src/components/Page';
import { Card } from '../../../src/components/Card';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { TeacherList } from '../../../src/components/TeacherList';
import { SectionTabs } from '../../../src/components/SectionTabs';
type Request = {id:string;version:number;name:string;email:string;requested_at:number};
export default function Admin() {
 const [section,setSection]=useState<'requests'|'teachers'>('requests');
 const {token,user}=useAuth();const [requests,setRequests]=useState<Request[]>([]);const [busy,setBusy]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('');const [confirm,setConfirm]=useState<{request:Request;action:'approve'|'deny'}|null>(null);
 const load=useCallback(async()=>{if(!user?.can_manage_teachers)return;setBusy('load');setError('');try{const r=await api<{requests:Request[]}>('teachers/review',token,{action:'list'});setRequests(r.requests);}catch(e){setError((e as Error).message);}finally{setBusy('');}},[token,user?.can_manage_teachers]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 async function decide(){if(!confirm)return;setBusy('decide');setError('');try{const r=await api<{name:string}>('teachers/review',token,{action:confirm.action,id:confirm.request.id,version:confirm.request.version});setMessage(confirm.action==='approve'?`${r.name} agora pode criar seus eventos.`:`Pedido de ${r.name} negado.`);setConfirm(null);await load();}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 if(!user?.can_manage_teachers)return <Page title="Administrador" help="admin#requests"><Notice text="Esta área é exclusiva do administrador do site." error/></Page>;
 return <Page title="Administrador" subtitle="Acesso de professores" help="admin#requests"><SectionTabs value={section} onChange={setSection} options={[{value:'requests',label:'Solicitações'},{value:'teachers',label:'Professores'}]}/>{section==='teachers'?<TeacherList/>:<Card><HelpHeading title="Solicitações de professor" help="admin#requests"/><Text style={ui.text}>Aprovar permite que a pessoa crie seus próprios eventos. Isso não concede administração do WordPress.</Text>{error&&<Notice text={error} error/>}{message&&<Notice text={message}/>} {busy==='load'&&<Busy text="Buscando solicitações…"/>}<PrimaryButton label="Atualizar pedidos" variant="secondary" disabled={!!busy} onPress={load}/>{!busy && !error && !requests.length && <Text style={ui.muted}>Nenhum pedido aguardando análise.</Text>}{requests.map(r=><View key={r.id} style={{borderTopWidth:1,borderColor:'#d8e0d6',paddingTop:12,gap:8}}><Text style={ui.h2}>{r.name}</Text><Text style={ui.text}>{r.email}</Text><Text style={ui.muted}>Solicitado em {new Date(r.requested_at*1000).toLocaleString('pt-BR')}</Text><View style={ui.row}><PrimaryButton label="Aprovar" disabled={!!busy} onPress={()=>setConfirm({request:r,action:'approve'})}/><PrimaryButton label="Negar" variant="secondary" disabled={!!busy} onPress={()=>setConfirm({request:r,action:'deny'})}/></View></View>)}{confirm&&<><Notice text={`${confirm.action==='approve'?'Autorizar':'Negar acesso de professor para'} ${confirm.request.name} (${confirm.request.email})?`}/><PrimaryButton label={confirm.action==='approve'?'Confirmar aprovação':'Confirmar recusa'} loading={busy==='decide'} disabled={!!busy} onPress={decide}/><PrimaryButton label="Cancelar" variant="secondary" disabled={!!busy} onPress={()=>setConfirm(null)}/></>}</Card>}</Page>;
}
