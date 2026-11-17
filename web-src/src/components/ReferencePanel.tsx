import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../providers/AuthProvider';
import { ReferenceContent } from './ReferenceContent';
import { SourceRow } from '../lib/workbook-import';
import { HelpHeading, Notice, ui } from './Page';
import { PrimaryButton } from './PrimaryButton';
export function ReferencePanel({id,readOnly=false}:{id:string;readOnly?:boolean}) {
  const {token}=useAuth();const [source,setSource]=useState<{external_id:string;file_name:string;archive:Record<string,SourceRow[]>}|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  return <View style={ui.column}><HelpHeading title="Referência privada do professor" help="teacher#source" /><Text style={ui.muted}>{readOnly?'Solução e procedência para consulta do professor. Este material é privado; o conjunto publicado permanece preservado.':'Solução e dicas originais para sua revisão. Este material não é mostrado ao aluno nem enviado pelo tutor. Confira os complementos: tabelas e regras necessárias devem ser incorporadas ao enunciado; preserve em privado etapas que revelem a solução.'}</Text>
    <PrimaryButton label={source?'Fechar referência':'Consultar solução e procedência'} variant="secondary" loading={busy} disabled={busy} onPress={async()=>{if(source){setSource(null);return;}setBusy(true);setError('');try{const r=await api<{source:{external_id:string;file_name:string;archive:Record<string,SourceRow[]>}}>(`challenge/source?challenge_id=${encodeURIComponent(id)}`,token);setSource(r.source);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}} />
    {error && <Notice text={error} error />}{source && <><Text style={ui.badge}>{source.external_id}</Text><Text style={ui.muted}>Arquivo: {source.file_name}</Text><ReferenceContent archive={source.archive} /><Text style={ui.muted}>Os campos originais e textos complementares permanecem na exportação dos seus dados.</Text></>}
  </View>;
}
