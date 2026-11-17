import {ClassroomTeams} from './Classroom';
import { TeamActions } from './TeamActions';
import { inviteUrl,shareInvite } from '../lib/invite';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../providers/AuthProvider';
import { useCode } from '../providers/CodeProvider';
import { api } from '../lib/api';
import { SectionTabs } from './SectionTabs';
import { useFeedback } from '../providers/FeedbackProvider';
import { Card } from './Card';
import { TextField } from './TextField';
import { PrimaryButton } from './PrimaryButton';
import { Notice, ui, HelpHeading } from './Page';
export function Teams({ teacher = false, onBusyChange }: { teacher?: boolean; onBusyChange?:(value:string)=>void }) {
  const {showFeedback}=useFeedback();const [manage,setManage]=useState<'teams'|'members'|'claims'>('teams');const [search,setSearch]=useState('');
  const {token, user} = useAuth(); const state=useCode(); const d=state.detail;
  const [name,setName]=useState(''); const [busy,setBusy]=useState(''); const [error,setError]=useState(''); const [message,setMessage]=useState('');
  const [target,setTarget]=useState<number | null>(null); const [release,setRelease]=useState('');
  useEffect(()=>()=>onBusyChange?.(''),[onBusyChange]);
  if (!d?.event.data.teams_mode) return null;
  async function act(key:string, fn:()=>Promise<unknown>) {setBusy(key);onBusyChange?.(`team-${key}`);setError('');setMessage('');try{await fn();await state.reloadEvent();setMessage(key==='create-team'?'Equipe criada.':'Alteração salva.');showFeedback({title:key==='create-team'?'Equipe criada':'Alteração salva',tone:'success'});}catch(e){setError((e as Error).message);}finally{setBusy('');onBusyChange?.('');}}
  const mine=d.members.find(m=>m.user_id===user?.id);
  const locked=!!mine && (!!mine.team_locked || d.attempts.some(a=>a.owner===mine.user_id));
  const currentTeam=d.teams.find(t=>t.id===mine?.team_id);
  if(d.event.data.classroom_version===1)return <ClassroomTeams teacher={teacher}/>;
  return <Card><HelpHeading title={teacher ? 'Equipes e participantes' : currentTeam?`Sua equipe: ${currentTeam.data.name}`:'Crie ou encontre seu time'} help={teacher ? 'teacher#teams' : 'events#teams'} />
    {error && <Notice text={error} error />}{message && <Notice text={message} />}
    {teacher && <SectionTabs value={manage} options={[{value:'teams',label:'Equipes'},{value:'members',label:'Participantes'},{value:'claims',label:'Reservas'}]} disabled={!!busy} onChange={v=>{setManage(v);setTarget(null);setError('');setMessage('');}} />}
    {teacher && manage==='teams' && <><Text style={ui.text}>Os alunos inscritos podem criar seus times e convidar colegas. Configure mínimo e máximo em Evento → Horários e regras.</Text><Text style={ui.badge}>Mínimo {d.event.data.team_min ?? 1} · máximo {d.event.data.team_max ?? 'sem limite'}</Text></>}
    {!teacher && mine && !mine.team_id && !locked && d.event.data.self_teams!==false && <><TextField label="Nome do meu time" helperText="Escolha um nome de até 60 caracteres. Ao criar, você já entra no time e recebe um convite para os colegas." value={name} onChangeText={setName}/><PrimaryButton label="Criar meu time" disabled={!!busy || !name.trim()} loading={busy==='create-team'} onPress={()=>act('create-team',async()=>{await api('teams',token,{event_id:d.event.id,name});setName('');})}/><PrimaryButton label="Tenho um código de time" variant="secondary" onPress={()=>router.push('/join')}/></>}
    {!teacher && currentTeam && !currentTeam.data.invite && <PrimaryButton label="Gerar convite do meu time" variant="secondary" loading={busy==='invite'} onPress={()=>act('invite',async()=>{await api('teams/invite',token,{event_id:d.event.id,team_id:currentTeam.id});})}/>}
    {!teacher && currentTeam?.data.invite && <><Text style={ui.muted}>Compartilhe somente com os colegas que vão entrar no seu time.</Text><Text selectable accessibilityLabel="Código de convite do time" style={ui.code}>{currentTeam.data.invite}</Text><PrimaryButton label="Compartilhar convite do time" variant="secondary" onPress={()=>act('share',async()=>{setMessage(await shareInvite({kind:'team',code:currentTeam.data.invite!,event:d.event.id}));})}/><Text selectable style={ui.muted}>{inviteUrl({kind:'team',code:currentTeam.data.invite,event:d.event.id})}</Text></>}
    {teacher && manage==='members' && <><TextField label="Buscar participante" value={search} onChangeText={setSearch} />{!d.members.length && <Notice text="Ninguém entrou ainda. Compartilhe o código em Evento e convite." />}
    {!!search && !d.members.some(m=>m.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && <Notice text="Nenhum participante com esse nome. Altere a busca." />}
    {d.members.filter(m=>m.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(m=><View key={m.user_id} style={ui.row}><Text style={ui.text}>{m.name} · {d.teams.find(t=>t.id===m.team_id)?.data.name || 'Sem equipe'}</Text><PrimaryButton label={`Organizar ${m.name}`} variant="secondary" disabled={!!busy || (m.team_locked || d.attempts.some(a=>a.owner===m.user_id))} onPress={()=>setTarget(m.user_id)} />{(m.team_locked || d.attempts.some(a=>a.owner===m.user_id)) && <Text style={ui.muted}>Equipe definida · já iniciou um desafio.</Text>}</View>)}</>}
    {!teacher && locked && <Notice text="Sua equipe está definida porque você já iniciou sua participação ou um desafio. Você pode continuar treinando com ela." />}
    {!teacher && <Text style={ui.text}>{mine ? mine.team_id ? `Você está na equipe ${d.teams.find(t=>t.id===mine.team_id)?.data.name}.` : 'Escolha uma equipe para começar a resolver os desafios.' : 'Entre no evento pelo código para participar como aluno.'}</Text>}
    {target && <Notice text={`Escolha a equipe de ${d.members.find(m=>m.user_id===target)?.name}.`} />}
    {!d.teams.length && <Notice text={d.event.data.self_teams!==false?'Ainda não há times. O primeiro aluno inscrito pode criar o seu.':'O professor ainda não criou equipes para este evento.'} />}
    {(!teacher || manage==='teams' || !!target) && d.teams.map(t=><View key={t.id} style={{gap:10,padding:16,borderRadius:12,borderWidth:mine?.team_id===t.id?2:1,borderColor:mine?.team_id===t.id?'#17705f':'#d8e0d6',backgroundColor:mine?.team_id===t.id?'#f0f8f3':'#fff'}}><View style={ui.row}><Text style={[ui.h2,{flex:1}]}>{t.data.name}</Text>{mine?.team_id===t.id && <Text style={ui.badge}>Sua equipe</Text>}{(teacher || mine?.team_id===t.id) && <TeamActions team={t} teacher={teacher}/>}<Text style={ui.muted}>{d.members.filter(m=>m.team_id===t.id).length} participantes</Text></View><Text style={ui.badge}>{d.members.filter(m=>m.team_id===t.id).length<(d.event.data.team_min ?? 1)?'Aguardando integrantes':'Mínimo atingido'} · máximo {d.event.data.team_max ?? 'sem limite'}</Text>{(teacher || mine?.team_id===t.id) && <TeamActions team={t} teacher={teacher}/>}<Text style={ui.muted}>{d.members.filter(m=>m.team_id===t.id).map(m=>m.user_id===user?.id?`${m.name} (você)`:m.name).join(' · ') || (teacher?'Alunos poderão escolher esta equipe.':'Ainda sem participantes.')}</Text>{(target || (!teacher && !d.event.data.self_teams && !t.data.invite_required && mine && mine.team_id!==t.id && !locked)) && <PrimaryButton label={target?`Colocar participante em ${t.data.name}`:`Entrar na equipe ${t.data.name}`} variant={mine?.team_id?'secondary':undefined} disabled={!!busy} loading={busy===t.id} onPress={()=>act(t.id,async()=>{await api('teams/join',token,{event_id:d.event.id,team_id:t.id,...(target?{user_id:target}:{})});setTarget(null);})} />}</View>)}
    {target && <PrimaryButton label="Cancelar organização" variant="secondary" onPress={()=>setTarget(null)} />}
    {teacher && manage==='claims' && !d.claims.length && <Notice text="Nenhum desafio reservado no momento. As reservas mostram quem está resolvendo cada desafio." />}
    {teacher && manage==='claims' && d.claims.map(c=><View key={c.id} style={ui.column}><Text style={ui.text}>{c.data.name} · {d.challenges.find(x=>x.id===c.data.challenge_id)?.data.title}</Text>{c.data.status!=='working'?<Text style={ui.muted}>A entrega já avançou. A reserva é preservada; somente tentativas em andamento podem ser liberadas.</Text>:release!==c.id ? <PrimaryButton label={`Liberar reserva de ${c.data.name}`} variant="secondary" onPress={()=>setRelease(c.id)} /> : <><Notice text="Liberar esta reserva? O rascunho será preservado. Somente tentativas em andamento podem ser liberadas." /><PrimaryButton label="Confirmar liberação" disabled={!!busy} loading={busy===c.id} onPress={()=>act(c.id,async()=>{await api('claims/release',token,{event_id:d.event.id,claim_id:c.id,confirmation:c.id});setRelease('');})} /><PrimaryButton label="Manter reserva" variant="secondary" onPress={()=>setRelease('')} /></>}</View>)}
  </Card>;
}
