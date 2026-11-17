import type { EventDetail } from '../types/sdk';
export function participation(detail:EventDetail,userId?:number) {
  const member=detail.members.find(m=>m.user_id===userId);
  const team=detail.teams.find(t=>t.id===(detail.my_team_id || member?.team_id));
  const candidates=!team && detail.event.data.classroom_version===1?detail.teams.filter(t=>t.owner===userId):[];
  return {member,team,candidates};
}
