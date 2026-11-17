import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../lib/api';
import { inviteUrl, shareInvite } from '../lib/invite';
import { useAuth } from '../providers/AuthProvider';
import { Card } from './Card';
import { Choice } from './Choice';
import { HelpHeading, Notice, ui } from './Page';
import { PrimaryButton } from './PrimaryButton';

type Role = 'monitor'|'editor'|'admin';
type Invitation = {id:string;version:number;data:{role:Role;expires:number;accepted_by:number|null;accepted_name?:string|null;revoked:boolean}};
const names:Record<Role,string>={monitor:'Acompanhar',editor:'Editar',admin:'Administrar'};
const descriptions:Record<Role,string>={monitor:'Pode acompanhar alunos, entregas e resultados. Não pode editar.',editor:'Pode acompanhar e editar o evento, desafios e avaliações. Não pode convidar pessoas nem excluir o evento.',admin:'Tem os mesmos poderes sobre este evento, inclusive convidar pessoas, revogar acessos e excluir o evento.'};
export function CollabAccess({eventId}:{eventId:string}) {
 const {token}=useAuth(); const [role,setRole]=useState<Role>('monitor'); const [items,setItems]=useState<Invitation[]>([]); const [code,setCode]=useState(''); const [busy,setBusy]=useState(''); const [error,setError]=useState(''); const [message,setMessage]=useState(''); const [revoke,setRevoke]=useState('');
 const load=useCallback(async()=>{setBusy('load');setError('');try{const r=await api<{invitations:Invitation[]}>('collab/list',token,{event_id:eventId});setItems(r.invitations);}catch(e){setError((e as Error).message);}finally{setBusy('');}},[token,eventId]);
 useEffect(()=>{setCode('');void load();},[load]);
 async function act(key:string,fn:()=>Promise<void>){setBusy(key);setError('');setMessage('');try{await fn();const r=await api<{invitations:Invitation[]}>('collab/list',token,{event_id:eventId});setItems(r.invitations);}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 return <Card><HelpHeading title="Professores convidados" help="teacher#collaboration"/><Text style={ui.text}>Convide professores já autorizados no Code para colaborar somente neste evento. A autorização de professor é feita pelo administrador do sistema.</Text><Choice label="O que o convidado poderá fazer?" value={role} onChange={v=>setRole(v as Role)} options={[{value:'monitor',label:'Acompanhar'},{value:'editor',label:'Editar'},{value:'admin',label:'Administrar'}]}/><Notice text={descriptions[role]}/><PrimaryButton label="Criar convite de professor" loading={busy==='create'} disabled={!!busy} onPress={()=>act('create',async()=>{const r=await api<{code:string}>('collab/invite',token,{event_id:eventId,role});setCode(r.code);})}/>{error&&<Notice text={error} error/>}{message&&<Notice text={message}/>} {code!==''&&<><Text style={ui.text}>Convite de uso único, válido por sete dias. Copie e envie ao professor:</Text><Text selectable style={ui.code}>{code}</Text><Text selectable style={ui.muted}>{inviteUrl({kind:'teacher',code})}</Text><PrimaryButton label="Copiar ou compartilhar link" variant="secondary" onPress={async()=>{try{setMessage(await shareInvite({kind:'teacher',code}));}catch(e){setError((e as Error).message);}}}/></>}{items.map(i=><View key={i.id} style={{gap:8,borderTopWidth:1,borderColor:'#d8e0d6',paddingTop:12}}><Text style={ui.text}>{names[i.data.role]} · {i.data.revoked?'Revogado':i.data.accepted_by?`Aceito por ${i.data.accepted_name||'professor'}`:i.data.expires*1000<Date.now()?'Expirado':'Aguardando aceite'}</Text>{!i.data.revoked&&(revoke!==i.id?<PrimaryButton label="Revogar convite ou acesso" variant="secondary" disabled={!!busy} onPress={()=>setRevoke(i.id)}/>:<><Notice text="A pessoa perderá o acesso concedido por este convite. O evento e o histórico serão preservados."/><PrimaryButton label="Confirmar revogação" loading={busy===i.id} disabled={!!busy} onPress={()=>act(i.id,async()=>{await api('collab/revoke',token,{event_id:eventId,id:i.id,version:i.version});setRevoke('');})}/><PrimaryButton label="Cancelar" variant="secondary" onPress={()=>setRevoke('')}/></>)}</View>)}</Card>;
}
