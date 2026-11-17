import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../providers/AuthProvider';
import { Card } from './Card';
import { Notice, Busy, HelpHeading, ui } from './Page';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';

type Teacher = {id:number;name:string;email:string;revocable:boolean;reason:string};
export function TeacherList() {
 const {token}=useAuth();const [input,setInput]=useState('');const [search,setSearch]=useState('');const [page,setPage]=useState(1);const [total,setTotal]=useState(0);const [teachers,setTeachers]=useState<Teacher[]>([]);const [busy,setBusy]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('');const [confirm,setConfirm]=useState<Teacher|null>(null);
 const load=useCallback(async()=>{setBusy('load');setError('');try{const r=await api<{teachers:Teacher[];total:number}>('teachers/review',token,{action:'teachers',search,page});setTeachers(r.teachers);setTotal(r.total);}catch(e){setError((e as Error).message);}finally{setBusy('');}},[token,search,page]);
 useEffect(()=>{void load();},[load]);
 async function revoke(){if(!confirm)return;setBusy('revoke');setError('');setMessage('');try{const r=await api<{name:string}>('teachers/review',token,{action:'revoke',user_id:confirm.id});setConfirm(null);await load();setMessage(`Acesso de professor de ${r.name} retirado.`);}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 function find(){setMessage('');setConfirm(null);if(search===input.trim()&&page===1)void load();else{setPage(1);setSearch(input.trim());}}
 return <Card><HelpHeading title="Professores autorizados" help="admin#teachers"/><Text style={ui.text}>Busque por nome, usuário ou e-mail. Retirar o acesso preserva os eventos e os dados da pessoa.</Text><TextField label="Buscar professores" placeholder="Nome, usuário ou e-mail" value={input} onChangeText={setInput}/><PrimaryButton label="Buscar" disabled={!!busy} onPress={find} variant="secondary"/>{error&&<Notice text={error} error/>}{message&&<Notice text={message}/>} {busy==='load'&&<Busy text="Buscando professores…"/>}{!busy&&!error&&!teachers.length&&<Text style={ui.muted}>Nenhum professor encontrado.</Text>}{teachers.map(t=><View key={t.id} style={{borderTopWidth:1,borderColor:'#d8e0d6',paddingTop:12,gap:8}}><Text style={ui.h2}>{t.name}</Text><Text style={ui.text}>{t.email}</Text>{!t.revocable?<Text style={ui.muted}>{t.reason} · acesso não removível aqui</Text>:confirm?.id!==t.id?<PrimaryButton label="Retirar acesso de professor" variant="secondary" disabled={!!busy} onPress={()=>{setError('');setConfirm(t);}}/>:<><Notice text={`Retirar o acesso de ${t.name} (${t.email})? A pessoa deixará de criar e gerenciar eventos como professora. Eventos, dados e inscrições serão preservados.`}/><PrimaryButton label="Confirmar retirada de acesso" variant="danger" loading={busy==='revoke'} disabled={!!busy} onPress={revoke}/><PrimaryButton label="Cancelar" variant="secondary" disabled={!!busy} onPress={()=>setConfirm(null)}/></>}</View>)}<View style={ui.row}><PrimaryButton label="Página anterior" variant="secondary" disabled={!!busy||page<=1} onPress={()=>{setConfirm(null);setPage(page-1);}}/><Text style={ui.muted}>Página {page} · {total} resultado(s)</Text><PrimaryButton label="Próxima página" variant="secondary" disabled={!!busy||page*20>=total} onPress={()=>{setConfirm(null);setPage(page+1);}}/></View></Card>;
}
