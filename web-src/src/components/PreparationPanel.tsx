import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../lib/api';
import { analyze } from '../lib/ai';
import { Challenge } from '../types/sdk';
import { useAuth } from '../providers/AuthProvider';
import { useFeedback } from '../providers/FeedbackProvider';
import { Card } from './Card';
import { Choice } from './Choice';
import { HelpHeading, Notice, ui } from './Page';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';
import { TestCases } from './TestCases';

const statusName={consistent:'A IA não apontou contradições',issues:'A IA levantou possíveis problemas',uncertain:'A IA não conseguiu concluir'};
export function PreparationPanel({eventId,challenges,onDone,onBusyChange}:{eventId:string;challenges:Challenge[];onDone:()=>Promise<void>;onBusyChange:(v:string)=>void}) {
  const {token}=useAuth();const {showFeedback}=useFeedback();const [busy,setBusy]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('');
  const [filter,setFilter]=useState('');const [scope,setScope]=useState<'all'|'format'|'ai'|'pending'>('all');const [page,setPage]=useState(0);const [opened,setOpened]=useState('');const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>{controller.current?.abort();onBusyChange('');},[onBusyChange]);
  const imported=challenges.filter(c=>c.data.import_info), unprepared=imported.filter(c=>c.data.import_info?.preparation_version!==1);
  const visible=imported.filter(c=>`${c.data.title} ${c.data.import_info!.external_id}`.toLowerCase().includes(filter.toLowerCase()) && (scope==='all' || scope==='format' && (!!c.data.import_info?.preparation_issues?.length || !c.data.tests.length) || scope==='ai' && c.data.reconciliation?.status!=='consistent' && !!c.data.reconciliation || scope==='pending' && !c.data.reconciliation));
  const reviewedCount=imported.filter(c=>!!c.data.reconciliation).length;
  const pending=visible.filter(c=>!c.data.reconciliation);const current=Math.min(page,Math.max(0,Math.ceil(visible.length/10)-1));
  async function act(id:string,fn:()=>Promise<void>){setBusy(id);onBusyChange(`prepare-${id}`);setError('');try{await fn();}catch(e){const text=(e as Error).message;setError(text);setMessage('Operação interrompida. Os resultados já registrados foram preservados; você pode retomar as questões restantes.');showFeedback({title:'Não foi possível concluir',message:text,tone:'error'});}finally{try{await onDone();}catch(e){setError((e as Error).message);}controller.current=null;setBusy('');onBusyChange('');}}
  async function review(list:Challenge[]){
    controller.current=new AbortController();const signal=controller.current.signal;
    for(let i=0;i<list.length;i++){
      if(signal.aborted)break;
      if(i && i%18===0){
        setMessage(`Pausa de um minuto para respeitar limites de consulta. ${i} de ${list.length} análises registradas. Você pode interromper.`);
        await new Promise<void>((resolve,reject)=>{const stop=()=>{clearTimeout(timer);signal.removeEventListener('abort',stop);reject(new Error('Análise interrompida.'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},61000);signal.addEventListener('abort',stop,{once:true});});
      }
      setMessage(`Análise de conteúdo ${i+1} de ${list.length}: ${list[i].data.title}`);
      await analyze(token!,'reconcile',list[i].id,1,signal);setOpened(list[i].id);
    }
    setMessage('Análises registradas. Pareceres são hipóteses; propostas não foram aplicadas automaticamente.');
  }
  return <Card><HelpHeading title="Dados fornecidos e revisão por IA" help="teacher#prepare" />
    <Text style={ui.text}>{imported.length} questões importadas · {imported.reduce((n,c)=>n+c.data.tests.length,0)} testes disponíveis · {reviewedCount} {reviewedCount===1?'análise':'análises'} de conteúdo pela IA</Text>
    <Text style={ui.muted}>Entradas e saídas fornecidas são usadas como testes iniciais. Sem tipo de comparação declarado, usamos a saída dos exemplos como padrão. Conferir a estrutura não avalia a correção da pergunta ou da solução. Revisão pela IA é opcional e não é exigida para publicar.</Text>
    {error && <Notice text={error} error />}{message && <Notice text={message} />}
    <PrimaryButton label={unprepared.length?'Aproveitar automaticamente os dados já importados':'Dados da planilha já aproveitados'} disabled={!!busy || !unprepared.length} loading={busy==='adopt'} onPress={()=>act('adopt',async()=>{const r=await api<{questions:number;tests:number;attention:number}>('imports/prepare',token,{event_id:eventId});setMessage(`${r.questions} questões preparadas com ${r.tests} testes fornecidos. ${r.attention} questões precisam de atenção ao formato ou tipo de comparação.`);showFeedback({title:'Dados aproveitados',message:`${r.tests} testes preparados sem redigitação.`,tone:'success'});})} />
    <TextField label="Buscar questão para revisão" value={filter} editable={!busy} onChangeText={v=>{setFilter(v);setPage(0);}} />
    <Choice label="Mostrar questões" value={scope} disabled={!!busy} onChange={v=>{setScope(v);setPage(0);}} options={[{value:'all',label:'Todas'},{value:'format',label:'Atenção ao formato'},{value:'ai',label:'Alertas ou dúvidas da IA'},{value:'pending',label:'Sem revisão de conteúdo'}]} />
    <Text style={ui.muted}>As análises usam o modelo, raciocínio e chave da sua Conta e podem consumir sua franquia. Só começam ao clicar. A solução fornecida será enviada ao seu provedor para esta revisão privada do professor.</Text>
    <PrimaryButton label={`Analisar ${pending.length} ${pending.length===1?'questão':'questões'} deste filtro com IA`} disabled={!!busy || !pending.length} loading={busy==='batch'} onPress={()=>act('batch',()=>review(pending))} />
    {busy && controller.current && <PrimaryButton label="Interromper análise" variant="secondary" onPress={()=>controller.current?.abort()} />}
    <Text style={ui.muted}>{visible.length} {visible.length===1?'resultado':'resultados'} · página {current+1} de {Math.max(1,Math.ceil(visible.length/10))}</Text>
    {visible.slice(current*10,current*10+10).map(c=><View key={c.id} style={ui.column}><Text style={ui.h2}>{c.data.title}</Text><Text style={ui.muted}>{c.data.import_info!.external_id} · {c.data.tests.length} {c.data.tests.length===1?'teste':'testes'} · {c.data.reconciliation?statusName[c.data.reconciliation.status]:'Conteúdo ainda não revisado por IA · uso da fonte permitido'}</Text>
      {c.data.import_info?.preparation_issues?.map((text,i)=><Notice key={i} text={text} />)}
      <View style={ui.row}><PrimaryButton label={c.data.reconciliation?'Analisar novamente com IA':'Analisar esta questão com IA'} variant="secondary" disabled={!!busy} loading={busy===c.id} onPress={()=>act(c.id,()=>review([c]))} />{c.data.reconciliation && <PrimaryButton label={opened===c.id?'Fechar parecer':'Ver parecer e proposta'} variant="secondary" disabled={!!busy} onPress={()=>setOpened(opened===c.id?'':c.id)} />}</View>
      {opened===c.id && c.data.reconciliation && <><Notice text="Parecer da IA: análise estática, sem execução ou certificação. Confira a proposta antes de aplicar." /><Text selectable style={ui.text}>{c.data.reconciliation.summary}</Text>{c.data.reconciliation.issues.map((text,i)=><Text key={i} selectable style={ui.text}>• {text}</Text>)}{!!c.data.reconciliation.proposed_tests.length && <><TestCases value={JSON.stringify(c.data.reconciliation.proposed_tests)} onChange={()=>{}} disabled /><PrimaryButton label={c.data.reconciliation.applied?'Proposta já aplicada':'Aplicar estes testes propostos'} disabled={!!busy || c.data.reconciliation.applied} onPress={()=>act('apply',async()=>{await api('imports/apply',token,{challenge_id:c.id,version:c.version});setMessage('Proposta aplicada. Os exemplos e a referência originais foram preservados.');})} /></>}</>}
    </View>)}
    {!visible.length && <Notice text="Nenhuma questão neste filtro. Você pode escolher outro filtro; a revisão por IA é opcional." />}
    <View style={ui.row}><PrimaryButton label="Questões anteriores" variant="secondary" disabled={!!busy || current===0} onPress={()=>setPage(current-1)} /><PrimaryButton label="Próximas questões" variant="secondary" disabled={!!busy || (current+1)*10>=visible.length} onPress={()=>setPage(current+1)} /></View>
  </Card>;
}
