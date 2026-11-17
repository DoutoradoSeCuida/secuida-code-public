import { site, storageKey } from './site';
export type Invite={kind:'team'|'monitor'|'teacher';code:string;event?:string};
const key=()=>storageKey('invite');
export function pendingInvite():Invite|null{try{const s=JSON.parse(sessionStorage.getItem(key())||'null');return s && ['team','monitor','teacher'].includes(s.kind) && /^[A-Z0-9]{12}$/.test(s.code)?s:null;}catch{return null;}}
export function saveInvite(v:Invite|null){if(v)sessionStorage.setItem(key(),JSON.stringify(v));else sessionStorage.removeItem(key());}
let captured=false;
export function captureInvite(){if(captured)return;captured=true;const bridge=(globalThis as typeof globalThis & {SC_CODE_PUBLIC_ROUTER?:{read:(value:string)=>string}}).SC_CODE_PUBLIC_ROUTER;const p=new URL(bridge?.read(window.location.href)??window.location.href,window.location.origin).searchParams;const kind=p.get('sc_code_kind'),code=p.get('sc_code_invite');if((kind==='team'||kind==='monitor'||kind==='teacher')&&code&&/^[a-z0-9]{12}$/i.test(code))saveInvite({kind,code:code.toUpperCase(),event:p.get('sc_code_event')||undefined});}
export function inviteUrl(invite: Invite) {
  const url = new URL(site().appUrl);
  url.searchParams.set('sc_code_kind', invite.kind);
  url.searchParams.set('sc_code_invite', invite.code);
  if (invite.event) url.searchParams.set('sc_code_event', invite.event);
  return url.href;
}
export async function shareInvite(v:Invite){if(!navigator.clipboard)throw new Error('Selecione e copie o link do convite abaixo.');await navigator.clipboard.writeText(inviteUrl(v));return 'Link copiado. Envie aos convidados.';}

export async function shareEventCode(_title:string,code:string){if(!navigator.clipboard)throw new Error('Selecione e copie o código exibido na tela.');await navigator.clipboard.writeText(code);return 'Código copiado. Envie aos alunos.';}
