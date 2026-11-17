import type {EventDetail} from '../types/sdk';
export type ScreenSource='page_visibility_client_reported'|'fullscreen_client_reported'|'window_focus_client_reported';
export function screenActivity(hidden:boolean,fullscreen:boolean,watchFullscreen:boolean,focused=true,watchFocus=false):{action:'hidden'|'visible';source:ScreenSource}{
 const fullAway=watchFullscreen&&!fullscreen,focusAway=watchFocus&&!focused;
 return {action:hidden||fullAway||focusAway?'hidden':'visible',source:hidden?'page_visibility_client_reported':fullAway?'fullscreen_client_reported':focusAway?'window_focus_client_reported':'page_visibility_client_reported'};
}
export function eventWindow(event:{status:string;starts_at?:string;ends_at?:string}|undefined,now:number){const start=Date.parse(event?.starts_at||''),end=Date.parse(event?.ends_at||'');return{active:!!event&&event.status==='published'&&(!start||start<=now)&&(!end||now<end),ended:!!end&&now>=end};}

export function focusStageReady(detail:EventDetail|null|undefined,userId?:number){
 if(!detail)return false;
 if(detail.event.data.classroom_version!==1)return true;
 if(detail.event.data.phase!=='official')return false;
 const member=detail.members.find(m=>m.user_id===userId);
 const team=detail.teams.find(t=>t.id===(detail.my_team_id||member?.team_id));
 return !!member&&!!team?.data.approved&&!team.data.suspended;
}
