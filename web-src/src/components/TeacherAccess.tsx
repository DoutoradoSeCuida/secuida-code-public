import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { useAuth } from '../providers/AuthProvider';
import { Card } from './Card';
import { HelpHeading, Notice, ui } from './Page';
import { PrimaryButton } from './PrimaryButton';
type State = {status:'none'|'pending'|'approved'|'denied'|'revoked';is_teacher:boolean};
export function TeacherAccess() {
 const {token}=useAuth();const [state,setState]=useState<State|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const load=useCallback(async()=>{setBusy(true);setError('');try{setState(await api<State>('teachers/request',token,{action:'status'}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}},[token]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 async function request(){setBusy(true);setError('');try{setState(await api<State>('teachers/request',token,{action:'submit'}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Card><HelpHeading title="Quer criar eventos?" help="teacher#access"/><Text style={ui.text}>Solicite acesso de professor. O administrador do Code analisará seu pedido.</Text>{error && <Notice text={error} error/>}{state?.status==='pending'?<Notice text="Seu pedido está aguardando análise."/>:state?.status==='denied'?<Notice text="Seu pedido anterior não foi aprovado. Você pode solicitar novamente."/>:state?.status==='revoked'?<Notice text="Seu acesso de professor foi retirado. Você pode solicitar novamente."/>:state?.is_teacher?<Notice text="Seu acesso de professor foi aprovado. Atualize a página ou entre novamente."/>:null}{!state && error?<PrimaryButton label="Tentar novamente" variant="secondary" loading={busy} onPress={load}/>:state && state.status!=='pending' && !state.is_teacher?<PrimaryButton label="Solicitar acesso de professor" loading={busy} onPress={request}/>:null}</Card>;
}
