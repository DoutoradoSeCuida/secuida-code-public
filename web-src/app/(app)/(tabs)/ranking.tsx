import { useCallback, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Text, View } from 'react-native';
import { useAuth } from '../../../src/providers/AuthProvider';
import { useCode } from '../../../src/providers/CodeProvider';
import { api } from '../../../src/lib/api';
import { SectionTabs } from '../../../src/components/SectionTabs';
import { Race } from '../../../src/components/Race';
import { exportData } from '../../../src/lib/export';
import { RankingRow, RaceData } from '../../../src/types/sdk';
import { Page, Busy, Notice, ui } from '../../../src/components/Page';
import { Card } from '../../../src/components/Card';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
export default function Ranking() {
  const { token, user } = useAuth(); const { detail, loading: eventLoading, error: eventError } = useCode(); const [view,setView]=useState<'teams'|'individual'>('teams'); const [rows, setRows] = useState<RankingRow[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async () => { if (!detail || detail.event.data.status!=='published' || eventLoading || eventError) return; setBusy(true); setError(''); try { const r = await api<{ rows: RankingRow[] }>(`ranking?event_id=${detail.event.id}`, token); setRows(r.rows); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }, [detail?.event.id, token,eventLoading,eventError]);
  useFocusEffect(useCallback(() => { setRows([]); void load(); }, [load]));
  return <Page title="Ranking do evento" subtitle={eventLoading ? 'Carregando seu evento…' : detail?.event.data.title || 'Selecione um evento para acompanhar a turma.'} help="ranking#points">
    {error || eventError ? <Notice text={error || eventError} error /> : null}{(busy || eventLoading) && <Busy />}
    {!detail && !eventLoading && <Card><Notice text="Selecione um evento na aba Eventos para acompanhar os resultados." /><PrimaryButton label="Ir para Eventos" onPress={()=>router.push('/')} /></Card>}
    {detail && !eventLoading && !eventError && <>{detail.event.data.teams_mode && detail.event.data.classroom_version!==1 && <SectionTabs value={view} onChange={setView} options={[{value:'teams',label:'Equipes e foguetes'},{value:'individual',label:'Individual'}]} />}
    {detail.event.data.teams_mode && view==='teams' && <Race />}

    <Notice text={detail?.event.data.teams_mode ? 'Pontos por solução aprovada pela IA ou revista pelo professor. Uma conquista por equipe/desafio. Dicas não descontam pontos; tempo não desempata.' : 'A classificação usa entregas validadas pelo professor. Dicas não descontam pontos; tempo não desempata.'} />
    <View style={ui.row}>{detail && <PrimaryButton label={detail.event.owner===user?.id ? 'Exportar resultados da turma' : 'Exportar meu resultado'} variant="secondary" loading={busy} onPress={async()=>{setBusy(true);setError('');try{const result=await api<RaceData>(`ranking?event_id=${detail.event.id}`,token);await exportData({event:detail.event.data.title,exported_at:new Date().toISOString(),...(detail.event.data.classroom_version===1?{teams:(result.teams||[]).filter(t=>detail.event.owner===user?.id||t.id===detail.my_team_id)}:{}),rows:detail.event.owner===user?.id?result.rows:result.rows.filter(r=>r.user_id===user?.id),attempts:detail.attempts.filter(a=>detail.event.owner===user?.id||a.owner===user?.id).map(a=>({student:a.student_name,challenge:detail.challenges.find(c=>c.id===a.data.challenge_id)?.data.title,status:a.data.status,grade:a.data.grade,assessment:a.data.assessment,started_at:a.data.started_at,submitted_at:a.data.submitted_at,hints:a.data.hints}))});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}} />}
    {detail && <PrimaryButton label="Atualizar classificação" variant="secondary" onPress={load} loading={busy} />}</View>
    {!busy && detail && !rows.length && !error && detail.event.data.classroom_version!==1 && <Notice text="Ainda não há participantes inscritos neste evento." />}
    {(!detail.event.data.teams_mode || view==='individual') && <><Text style={ui.h2}>Classificação individual</Text>{rows.map(r => <Card key={r.user_id}><View style={ui.row}><Text style={ui.h2}>{r.position}º · {r.name}{r.user_id === user?.id ? ' · você' : ''}</Text><Text style={ui.badge}>{r.points} pontos</Text></View><Text style={ui.text}>{r.earned_points ?? r.points} conquistados · {r.penalty ?? 0} descontados · {r.validated} validados · {r.submitted} entregues · {r.hints} pistas</Text><Text style={ui.muted}>Fácil: {r.by_level.easy} · Médio: {r.by_level.medium} · Difícil: {r.by_level.hard}</Text><Text style={ui.muted}>{r.revisions} revisões · {Math.round(r.elapsed_seconds / 60)} min registrados nas entregas</Text>{r.badges.map(b => <Text key={b} style={ui.badge}>🏅 {b}</Text>)}</Card>)}</>}</>}
  </Page>;
}
