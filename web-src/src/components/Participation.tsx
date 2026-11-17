import { useState } from 'react';
import { Text, View, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventClock } from './EventClock';
import { router } from 'expo-router';
import { useEventSession } from './EventSession';
import { useAuth } from '../providers/AuthProvider';
import { useCode } from '../providers/CodeProvider';
import { participation } from '../lib/participation';
import { eventWindow } from '../lib/screen-activity';
import { useFeedback } from '../providers/FeedbackProvider';
import { shareEventCode } from '../lib/invite';
import { api } from '../lib/api';
import { Card } from './Card';
import { PrimaryButton } from './PrimaryButton';
import { HelpHeading, Notice, ui } from './Page';
export function Participation({ compact = false, dashboard = false }: { compact?: boolean; dashboard?: boolean }) {
  const session=useEventSession();const { user, token }=useAuth(); const state=useCode(); const d=state.detail;
  const {showFeedback}=useFeedback();
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const {width}=useWindowDimensions();
  if(!d || d.event.data.status!=='published')return null;
  const {member,team,candidates}=participation(d,user?.id);
  const ended=eventWindow(d.event.data,Date.now()).ended;
  const teamStatus=team?.data.suspended?'Equipe suspensa · procure o professor':team?.data.approved?'Equipe conferida e liberada':'Aguardando conferência do professor';
  const needsTeam=d.event.data.teams_mode && !team;
  if(dashboard) {
    const approved=new Set(d.attempts.filter(a=>a.owner===user?.id && a.data.status==='validated').map(a=>a.data.challenge_id)).size;
    const status=!member?'Você organiza este evento':needsTeam?(candidates.length?'Equipe encontrada · falta retomar':'Crie sua equipe'):team?`Equipe ${team.data.name}`:'Participação individual';
    return <Card>
      <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
        <View style={{width:48,height:48,borderRadius:14,backgroundColor:'#e8eefc',alignItems:'center',justifyContent:'center'}}><Ionicons name="rocket-outline" size={26} color="#2456c7" /></View>
        <View style={{flex:1,gap:3}}><Text style={{color:'#17705f',fontSize:12,fontWeight:'800',letterSpacing:1}}>EVENTO SELECIONADO</Text><HelpHeading title={d.event.data.title} help="events#teams" /></View>
      </View>
      {d.event.data.invite && <View style={{padding:12,gap:6,backgroundColor:'#edf3ff',borderRadius:10}}><Text style={{fontSize:12,fontWeight:'700',color:'#344b5e'}}>CÓDIGO DO EVENTO · PARA OS ALUNOS</Text><View style={ui.row}><Text selectable accessibilityLabel="Código para entrar no evento" style={{fontFamily:'monospace',fontSize:24,fontWeight:'800',letterSpacing:2,color:'#173a85',flex:1}}>{d.event.data.invite}</Text><PrimaryButton label={Platform.OS==='web'?'Copiar código':'Compartilhar código'} variant="secondary" onPress={async()=>{try{const message=await shareEventCode(d.event.data.title,d.event.data.invite!);showFeedback({title:message,tone:'success'});}catch(e){showFeedback({title:'Não foi possível compartilhar',message:(e as Error).message,tone:'error'});}}}/></View><Text style={[ui.muted,{fontSize:12}]}>{ended?'Evento encerrado. O código não reabre o prazo.':'Use este código em Entrar no evento. Ele é diferente do convite de professor ou equipe.'}</Text></View>}
      {d.event.data.starts_at || d.event.data.ends_at ? <EventClock event={d.event} serverNow={d.server_now} onBoundary={()=>{void state.reloadEvent().catch(()=>{});}} /> : <Text style={ui.muted}>Sem prazo de término. O professor pode definir o horário durante a atividade.</Text>}
      <View style={{flexDirection:width>=700?'row':'column',gap:10}}>
        <View style={{flex:1,backgroundColor:'#e2f0e9',borderRadius:12,padding:12,gap:3}}><Text style={ui.muted}>Sua participação</Text><Text style={[ui.text,{fontWeight:'800'}]}>{status}</Text>{team && <Text style={{fontSize:12,color:team.data.approved?'#17705f':'#8a5413'}}>{teamStatus}</Text>}{team && <Text style={[ui.muted,{fontSize:12}]}>{team.data.roster?.join(' · ')}</Text>}</View>
        {!!member && <View style={{flex:1,backgroundColor:'#f3f6fa',borderRadius:12,padding:12,gap:3}}><Text style={ui.muted}>Seu progresso</Text><Text style={[ui.text,{fontWeight:'800'}]}>{approved===0?'Nenhum desafio aprovado ainda':`${approved} desafio${approved===1?'':'s'} aprovado${approved===1?'':'s'}`}</Text></View>}
      </View>
      {!member && <Text style={ui.text}>Para resolver desafios, entre também como participante. Você continua com acesso à área Professor.</Text>}
      {member && needsTeam && !candidates.length && !ended && <Text style={ui.text}>{d.event.data.classroom_version===1?'Crie sua equipe e cadastre os nomes dos colegas que usarão este computador.':'Crie sua equipe ou entre com o convite de um colega.'}</Text>}
      {error && <Notice text={error} error />}
      {!member ? <PrimaryButton label="Participar como aluno neste evento" loading={busy} disabled={busy || state.loading} onPress={async()=>{setBusy(true);setError('');try{await api('events/join',token,{code:d.event.data.invite});await state.refresh();router.push('/team');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}} /> : needsTeam ? <PrimaryButton label={candidates.length?'Retomar minha equipe':ended?'Ver equipes do evento':d.event.data.classroom_version===1?'Criar minha equipe':'Criar ou entrar na minha equipe'} onPress={()=>router.push('/team')} /> : <View style={{flexDirection:width>=700?'row':'column',gap:10}}><View style={{flex:1}}><PrimaryButton label={ended?"Consultar desafios e resultados":"Acessar desafios"} onPress={()=>{void session.enterScreen();router.push('/train');}} /></View>{team && <View style={{flex:1}}><PrimaryButton label="Minha equipe" variant="secondary" onPress={()=>{void session.enterScreen();router.push('/team');}} /></View>}<View style={{flex:1}}><PrimaryButton label="Ver ranking" variant="secondary" onPress={()=>{void session.enterScreen();router.push('/ranking');}} /></View></View>}
    </Card>;
  }
  return <Card><HelpHeading title={compact?'Sua participação':d.event.data.title} help="events#teams" />
    <Text style={ui.badge}>{!member?'Você organiza este evento':needsTeam?(candidates.length?'Equipe encontrada · falta retomar':'Inscrição concluída · falta criar a equipe'):team?`Sua equipe: ${team.data.name}`:'Inscrição concluída'}</Text>
    {team && <Text style={ui.muted}>{teamStatus}</Text>}
    {!member && <Text style={ui.text}>Para resolver desafios, entre também como participante. Depois, escolha sua equipe. Você continua com acesso à área Professor.</Text>}
    {member && needsTeam && !candidates.length && !ended && <Text style={ui.text}>{d.event.data.classroom_version===1?'Crie seu time e cadastre os nomes dos colegas que usarão este computador.':'Crie seu time ou use o convite de um colega para entrar.'}</Text>}
    {error && <Notice text={error} error />}
    {!member ? <PrimaryButton label="Participar como aluno neste evento" loading={busy} disabled={busy || state.loading} onPress={async()=>{setBusy(true);setError('');try{await api('events/join',token,{code:d.event.data.invite});await state.refresh();router.push('/team');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}} /> : needsTeam ? <PrimaryButton label={candidates.length?'Retomar minha equipe':ended?'Ver equipes do evento':d.event.data.classroom_version===1?'Criar meu time':'Criar ou entrar no meu time'} onPress={()=>router.push('/team')} /> : <><PrimaryButton label={ended?"Consultar desafios e resultados":"Acessar desafios"} onPress={()=>{void session.enterScreen();router.push('/train');}} />{team && <PrimaryButton label="Ver minha equipe e colegas" variant="secondary" onPress={()=>{void session.enterScreen();router.push('/team');}} />}</>}
  </Card>;
}
