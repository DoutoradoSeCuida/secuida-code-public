import { specialSupported } from './special-output';
import type { EventDetail, EventRecord } from '../types/sdk';
export type EventSnapshot = { events: EventRecord[]; detail: EventDetail | null };
export type EventRequest = <T>(path: string, body?: unknown) => Promise<T>;
export function participantCount(detail: EventDetail) {
  return detail.event.data.classroom_version===1
    ? detail.teams.reduce((total,team)=>total+(team.data.roster?.length || 0),0)
    : detail.members.length;
}
export function canTrain(detail: EventDetail | null, loading: boolean, error: string) {
  return !loading && !error && detail?.event.data.status === 'published' && detail.event.access_role !== 'monitor';
}
export function ownedEvents(events: EventRecord[], userId?: number,scope:'current'|'archived'|'all'='current') {
  return events.filter(e => (e.owner === userId || e.access_role === "editor" || e.access_role === "admin") && (scope==='all'||!!e.archived===(scope==='archived'))).sort((a,b) => a.data.title.localeCompare(b.data.title, 'pt-BR'));
}
export async function loadEventSnapshot(request: EventRequest, expectedId?: string): Promise<EventSnapshot> {
  const data = await request<{ events: EventRecord[]; active_event: string | null }>('events/read', {});
  if (expectedId && data.active_event !== expectedId) throw new Error('A seleção do evento mudou. Escolha novamente o evento que deseja abrir.');
  if (!data.active_event || !data.events.some(e => e.id === data.active_event)) return { events: data.events, detail: null };
  const detail = await request<EventDetail>('event/read', {id:data.active_event});
  if (detail.event.id !== data.active_event) throw new Error('Não foi possível confirmar o evento selecionado. Atualize e tente novamente.');
  return { events: data.events, detail };
}
export function publicationIssues(detail: EventDetail) {
  const problems: { id: string; text: string; section: 'challenges'|'teams' }[] = [];
  if (!detail.challenges.length) problems.push({id:'questions',text:'Adicione pelo menos um desafio.',section:'challenges'});
  const special = detail.challenges.filter(c => c.data.import_info && !specialSupported(c.data));
  if (special.length) problems.push({id:'review',text:`${special.length} questão(ões) precisa(m) de uma regra de comparação válida.`,section:'challenges'});
  const adopt=detail.challenges.filter(c=>c.data.import_info?.output_kind==='unconfirmed' && !c.data.import_info.comparison_declared);
  if(adopt.length)problems.push({id:'adopt',text:`Aproveite automaticamente os dados de ${adopt.length} questões já importadas.`,section:'challenges'});
  const conflicts = detail.challenges.filter(c=>c.data.import_info?.preparation_issues?.some(s=>s.startsWith('A mesma entrada')));
  if (conflicts.length) problems.push({id:'conflicts',text:`Confira entradas com saídas divergentes em ${conflicts.length} questão(ões).`,section:'challenges'});
  const noTests=detail.challenges.filter(c=>(detail.event.data.teams_mode || c.data.import_info) && !c.data.tests.length && !adopt.includes(c));
  if(noTests.length)problems.push({id:'tests',text:`Aproveite os dados da planilha para preparar testes em ${noTests.length} desafio(s).`,section:'challenges'});
  if (detail.event.data.teams_mode) {
    if (!detail.event.data.self_teams && !detail.teams.length) problems.push({id:'teams',text:'Crie pelo menos uma equipe.',section:'teams'});
  }
  if(detail.event.data.ends_at && Date.parse(detail.event.data.ends_at)<=Date.now())problems.push({id:'schedule',text:'O término informado já passou. Atualize ou remova o término em Horários e regras.',section:'teams'});
  return problems;
}
