import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { parseWorkbook, ImportQuestion } from '../lib/workbook-import';
import { parseImport } from '../lib/import';
import { api } from '../lib/api';
import { useAuth } from '../providers/AuthProvider';
import { useFeedback } from '../providers/FeedbackProvider';
import { importLevelSelection } from '../lib/program-selection';
import { reviewImport, matchesReview, reviewFilters, ReviewFilter } from '../lib/import-review';
import { ReferenceContent } from './ReferenceContent';
import { SectionTabs } from './SectionTabs';
import { levelNames, Level, EventDetail } from '../types/sdk';
import { confirmImports, importReceipt, ImportClaim } from '../lib/import-confirm';
import { Card } from './Card';
import { Choice } from './Choice';
import { HelpHeading, Notice, ui } from './Page';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';
import { QuestionContent } from './QuestionContent';
export function ImportPanel({eventId,eventTitle,onDone,onOpen,disabled,onBusyChange,onPendingChange}:{eventId:string;eventTitle:string;onDone:()=>Promise<void>;onOpen:()=>void;disabled:boolean;onBusyChange:(value:string)=>void;onPendingChange?:(value:boolean)=>void}) {
  const {token}=useAuth();const {showFeedback}=useFeedback();const [items,setItems]=useState<ImportQuestion[]>([]);const [selected,setSelected]=useState<Set<number>>(new Set());const [done,setDone]=useState<Set<number>>(new Set());
  const [busy,setBusy]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('');const [filter,setFilter]=useState('');const [scope,setScope]=useState<ReviewFilter>('all');const [page,setPage]=useState(0);const [preview,setPreview]=useState<number|null>(null);const [text,setText]=useState('');const [fileName,setFileName]=useState('');const stop=useRef(false); const [moreFilters,setMoreFilters]=useState(false); const [previewTab,setPreviewTab]=useState<'statement'|'solution'|'issues'>('statement');
  const claims = useRef(new Map<number,ImportClaim>()); const [received,setReceived]=useState(0);
  useEffect(()=>{onPendingChange?.([...selected].some(i=>!done.has(i))||!!text.trim());},[selected,done,text,onPendingChange]);
  useEffect(()=>()=>{stop.current=true;onBusyChange('');onPendingChange?.(false);},[]);
  const reviewed=useMemo(()=>items.map((item,index)=>({item,index,review:reviewImport(item)})),[items]);
  const counts=useMemo(()=>Object.fromEntries(reviewFilters.map(f=>[f.value,reviewed.filter(r=>matchesReview(r.review,f.value)).length])),[reviewed]);
  const visible=reviewed.filter(({item,review})=>`${item.source.external_id} ${item.challenge.title}`.toLowerCase().includes(filter.toLowerCase()) && matchesReview(review,scope));
  const pendingCount=[...selected].filter(i=>!done.has(i)).length;
  const hiddenSelected=[...selected].filter(i=>!done.has(i)&&!visible.some(r=>r.index===i)).length;
  const lastPage=Math.max(0,Math.ceil(visible.length/10)-1),currentPage=Math.min(page,lastPage);
  async function task(kind:string,fn:()=>Promise<void>){setBusy(kind);onBusyChange(`import-${kind}`);setError('');try{await fn();}catch(e){const m=(e as Error).message;setError(kind==='verify'||(kind==='import'&&claims.current.size)?`A conferência não foi concluída. As questões já enviadas foram preservadas. Use Conferir importação novamente. ${m}`:m);showFeedback({title:'Confira a importação',message:m,tone:'error'});}finally{setBusy('');onBusyChange('');}}
  function load(next:ImportQuestion[],name:string){claims.current.clear();setReceived(0);setItems(next);setFileName(name);setSelected(new Set(next.map((_,i)=>i)));setDone(new Set());setPreview(null);setPage(0);setFilter('');setScope('all');setMoreFilters(false);setPreviewTab('statement');setMessage('Prévia preparada. Confira a seleção antes de importar.');}
  async function verifyReceived(){
    setMessage('Conferindo as questões gravadas no evento…');
    const detail=await api<EventDetail>('event/read',token,{id:eventId});
    const result=confirmImports(detail,eventId,[...claims.current.values()]);setDone(new Set(result.confirmed));
    try{await onDone();}catch{setMessage(`${result.confirmed.length} questões conferidas no evento. A lista ainda não atualizou; use Conferir importação novamente.`);}
    return result;
  }
  async function importSelected() {
    stop.current=false;let created=0,existing=0;let failure:Error|null=null;
    const queue=[...selected].filter(i=>!done.has(i));
    try {
      for(let n=0;n<queue.length;n++) {
        if(stop.current)break;
        const index=queue[n];setMessage(`Enviando ${n+1} de ${queue.length}: ${items[index].challenge.title}`);
        const receipt=importReceipt(await api<unknown>('challenges/import',token,{event_id:eventId,item:items[index]}));
        claims.current.set(index,{index,externalId:items[index].source.external_id,receipt});
        setReceived(claims.current.size);receipt.status==='created'?created++:existing++;
      }
    } catch(e) {failure=e instanceof Error?e:new Error('Não foi possível enviar a questão.');}
    const result=await verifyReceived();
    if(result.missing.length) {
      setMessage(`${result.confirmed.length} questões conferidas no evento. O envio ainda precisa de conferência.`);
      throw new Error(`${result.missing.length} ${result.missing.length===1?'questão recebeu resposta, mas não apareceu':'questões receberam resposta, mas não apareceram'} no evento. Retome para conferir sem duplicar.`);
    }
    if(failure) {
      setMessage(`Importação incompleta: ${result.confirmed.length} questões conferidas no evento. Retome as selecionadas restantes.`);
      throw failure;
    }
    setMessage(`${stop.current?'Importação interrompida':'Importação conferida'}: ${result.confirmed.length} ${result.confirmed.length===1?'questão presente':'questões presentes'} neste evento. Neste envio: ${created} ${created===1?'nova':'novas'} e ${existing} ${existing===1?'já existente preservada':'já existentes preservadas'}.`);
    showFeedback({title:stop.current?'Importação interrompida':'Questões conferidas no evento',message:`${result.confirmed.length} ${result.confirmed.length===1?'questão presente':'questões presentes'}. Abra a lista para revisar.`,tone:stop.current?'warning':'success'});
  }
  return <Card><HelpHeading title="Importar desafios" help="teacher#import" /><Text style={ui.text}>Bases INTERIF e Outras Maratonas em XLSX, até 20 MB. CSV e JSON simples continuam disponíveis, sem material de solução privado. A leitura de XLSX prepara uma prévia; nada é cadastrado nesta etapa.</Text>
    {error && <Notice text={error} error />}{message && <Notice text={message} />}
    <PrimaryButton label="Escolher planilha XLSX, CSV ou JSON" variant="secondary" loading={busy==='file'} disabled={disabled || !!busy} onPress={()=>task('file',async()=>{
      const r=await DocumentPicker.getDocumentAsync({type:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','application/json','text/plain'],copyToCacheDirectory:true});if(r.canceled)return;const a=r.assets[0];if(a.size && a.size>20_000_000)throw new Error('Use um arquivo de até 20 MB.');
      await new Promise(resolve=>setTimeout(resolve,0));
      if(a.name.toLowerCase().endsWith('.xlsx')){const bytes=a.file?new Uint8Array(await a.file.arrayBuffer()):await new File(a.uri).bytes();load(parseWorkbook(bytes,a.name),a.name);setText('');}
      else {const raw=a.file?await a.file.text():await new File(a.uri).text();parseImport(raw);setText(raw);setItems([]);setMessage('Arquivo simples lido. Use Importar CSV/JSON para confirmar.');}
    })} />
    {!items.length && <><TextField label="Conteúdo CSV/JSON · opcional" helperText="Alternativa ao envio de arquivo: cole aqui desafios no formato CSV ou JSON descrito na ajuda. Para planilhas XLSX, use o botão Escolher planilha XLSX, CSV ou JSON." value={text} onChangeText={setText} editable={!busy && !disabled} multiline style={{minHeight:90,fontFamily:'monospace'}} /><PrimaryButton label="Importar CSV/JSON para o rascunho" disabled={disabled || !!busy || !text.trim()} loading={busy==='simple'} onPress={()=>task('simple',async()=>{await api('challenges',token,{event_id:eventId,items:parseImport(text)});setText('');await onDone();setMessage('Desafios importados para o rascunho.');showFeedback({title:'Importação concluída',tone:'success'});})} /></>}
    {!!items.length && <>
      <Text style={ui.h2}>{fileName}</Text><Text style={ui.text}>{items.length} questões · {items.reduce((n,i)=>n+(i.challenge.examples?.length || 0),0)} exemplos · {items.reduce((n,i)=>n+i.media.length,0)} figuras</Text><Text style={ui.muted}>Níveis 1 e 2 → fácil; 3 → médio; 4 e 5 → difícil. As entradas e saídas fornecidas viram testes iniciais. A revisão de conteúdo pela IA é opcional; as soluções ficam privadas do professor.</Text>
      <View style={ui.column}><Text style={ui.text}>Destino: {eventTitle}</Text><Text accessibilityLiveRegion="polite" style={ui.muted}>Selecionadas: {selected.size} · Respostas recebidas: {received} · Conferidas no evento: {done.size}</Text>
        <PrimaryButton label={!pendingCount?'Seleção já conferida no evento':`${done.size?'Retomar':'Importar'} ${pendingCount} ${pendingCount===1?'questão':'questões'} para este evento`} loading={busy==='import'} disabled={disabled || !!busy || !pendingCount} onPress={()=>task('import',importSelected)} />
        {busy==='import' && <PrimaryButton label="Interromper após a questão atual" variant="secondary" onPress={()=>{stop.current=true;setMessage('Interrupção solicitada. A questão em envio ainda será conferida.');}} />}
        {!!received&&<PrimaryButton label="Conferir importação novamente" variant="secondary" disabled={disabled||!!busy} loading={busy==='verify'} onPress={()=>task('verify',async()=>{const result=await verifyReceived();if(result.missing.length)throw new Error(`${result.missing.length} questões ainda não foram encontradas no evento; retome apenas as restantes.`);setMessage(`${result.confirmed.length} questões conferidas no evento. Não é necessário salvar de novo.`);showFeedback({title:'Conferência concluída',message:`${result.confirmed.length} questões presentes em ${eventTitle}.`,tone:'success'});})}/>}
        {!!done.size && <PrimaryButton label="Ver desafios do evento" variant="secondary" disabled={disabled || !!busy} onPress={onOpen} />}
        {!received && <Text style={ui.muted}>A prévia ainda não grava questões. Confirme no botão acima; ao terminar, a app confere se elas aparecem neste evento.</Text>}
      </View>
      <HelpHeading title="Escolher o que importar" help="teacher#import"/><Text style={ui.muted}>A lista abaixo permite conferir e escolher quais questões serão copiadas para o evento. Todas começam marcadas. Se importar todas, você ainda poderá mostrar só as categorias desejadas em Aquecimento e seleção → Fase oficial. Não precisa limitar a importação agora.</Text><Text style={ui.h2}>Dificuldades a importar</Text><Text style={ui.muted}>Marque ou desmarque um nível inteiro do arquivo. Depois ajuste questões individuais na lista. Isso muda a seleção para importar; não envia nada sozinho.</Text><View style={ui.row}>{(['easy','medium','hard'] as Level[]).map(level=>{const indices=items.map((item,index)=>item.challenge.level===level?index:-1).filter(i=>i>=0),count=indices.filter(i=>selected.has(i)).length,checked=indices.length>0&&count===indices.length,mixed=count>0&&!checked;return <Pressable key={level} accessibilityRole="checkbox" accessibilityLabel={`${levelNames[level]} para importar`} accessibilityState={{checked:mixed?'mixed':checked,disabled:!!busy||!indices.length}} aria-checked={mixed?'mixed':checked} disabled={!!busy||!indices.length} onPress={()=>{setSelected(v=>importLevelSelection(items,v,level));setMessage(`Seleção de ${levelNames[level]} atualizada. Confirme no botão Importar quando terminar.`);}} style={{minHeight:44,padding:12,borderRadius:9,borderWidth:1,borderColor:count?'#2456c7':'#aab9ad',backgroundColor:count?'#e8eefc':'#fff',opacity:indices.length?1:.5}}><Text style={{fontWeight:'700',color:'#172b3a'}}>{checked?'☑':mixed?'▣':'☐'} {levelNames[level]} · {count}/{indices.length}</Text></Pressable>;})}</View><PrimaryButton label="Selecionar todas as dificuldades" variant="secondary" disabled={!!busy} onPress={()=>{setSelected(new Set(items.map((_,i)=>i)));setMessage('Todas as dificuldades selecionadas para importar.');}}/>
      <TextField label="Buscar questão por título ou ID" value={filter} onChangeText={v=>{setFilter(v);setPage(0);}} /><HelpHeading title="Soluções e pendências" help="teacher#reviewlist" /><Text style={ui.muted}>Os totais abaixo consideram o arquivo inteiro. A busca por título ou ID refina os resultados. Esses alertas são da fonte ou do formato; não equivalem a uma revisão de conteúdo pela IA.</Text><Choice label="Filtrar prévia" value={scope} options={reviewFilters.filter(f=>moreFilters || ['all','missing','partial','attention'].includes(f.value) || f.value===scope).map(f=>({value:f.value,label:`${f.label} (${counts[f.value] || 0})`}))} disabled={!!busy} onChange={v=>{setScope(v);setPage(0);}} /><PrimaryButton label={moreFilters?'Menos filtros':'Mais filtros de preparação'} variant="secondary" disabled={!!busy} onPress={()=>setMoreFilters(v=>!v)} />
      <View style={ui.row}><PrimaryButton label="Selecionar só os resultados" variant="secondary" disabled={!!busy} onPress={()=>setSelected(new Set(visible.map(r=>r.index)))} /><PrimaryButton label="Limpar seleção" variant="secondary" disabled={!!busy} onPress={()=>setSelected(new Set())} /></View>
      <Text accessibilityLiveRegion="polite" style={ui.text}>Resultados do filtro: {visible.length} · Selecionadas: {selected.size} · Conferidas no evento: {done.size}</Text>{hiddenSelected>0 && <View style={ui.column}><Notice text={`${hiddenSelected} questões selecionadas estão fora do filtro e também serão enviadas. Filtrar não altera a seleção.`} /><PrimaryButton label="Manter somente resultados deste filtro" variant="secondary" disabled={!!busy} onPress={()=>setSelected(v=>new Set([...v].filter(i=>visible.some(r=>r.index===i))))} /></View>}
      {visible.slice(currentPage*10,currentPage*10+10).map(({item,index,review})=><View key={item.source.external_id} style={ui.column}><Pressable accessibilityRole="checkbox" aria-checked={selected.has(index)} accessibilityState={{checked:selected.has(index),disabled:!!busy}} disabled={!!busy} onPress={()=>setSelected(v=>{const next=new Set(v);next.has(index)?next.delete(index):next.add(index);return next;})} style={{padding:12,borderWidth:1,borderRadius:8,borderColor:'#aab9ad'}}><Text style={ui.text}>{selected.has(index)?'☑':'☐'} {item.source.external_id} · {item.challenge.title}</Text><Text style={ui.muted}>{levelNames[item.challenge.level]} · {done.has(index)?'conferida no evento':'dados fornecidos para uso'}</Text></Pressable>
        <View style={ui.row}><Text style={[ui.badge,{color:review.reference.available&&!review.reference.partial?'#17705f':'#9a650f',backgroundColor:review.reference.available&&!review.reference.partial?'#e2f0e9':'#fff1ca'}]}>{!review.reference.available?'Sem solução':review.reference.partial?'Solução: apenas resumo':'Solução de referência disponível'}</Text><Text style={ui.muted}>{review.extras.length?`${review.extras.length} ${review.extras.length===1?'alerta extra':'alertas extras'}`:'Sem alertas extras'} · {item.challenge.tests.length?'testes presentes':'testes a preparar'}</Text></View>
        <View style={ui.row}><PrimaryButton label={preview===index?'Fechar prévia':'Ver enunciado'} variant="secondary" disabled={!!busy} onPress={()=>{setPreview(preview===index?null:index);setPreviewTab('statement');}} />{!(preview===index&&previewTab==='solution') && <PrimaryButton label="Ver solução" variant="secondary" disabled={!!busy} onPress={()=>{setPreview(index);setPreviewTab('solution');}} />}<PrimaryButton label={`Ver pendências (${review.issues.length})`} variant="secondary" disabled={!!busy} onPress={()=>{setPreview(index);setPreviewTab('issues');}} /></View>
        {preview===index && <View style={ui.column}>
          <SectionTabs value={previewTab} onChange={setPreviewTab} disabled={!!busy} options={[{value:'statement',label:'Enunciado'},{value:'solution',label:'Solução'},{value:'issues',label:'Pendências'}]} />
          {previewTab==='statement' && <QuestionContent data={item.challenge} media={item.media} />}
          {previewTab==='solution' && <ReferenceContent archive={item.source.archive} />}
          {previewTab==='issues' && <><HelpHeading title="Antes de usar esta questão" help="teacher#reviewlist" /><Text style={ui.muted}>Pode importar para o rascunho. Os exemplos serão aproveitados automaticamente. Notas da fonte não são uma certificação nem exigem redigitação; comparação especial depende de corretor compatível.</Text>{review.issues.map(issue=><View key={issue.code} style={{gap:6,borderLeftWidth:3,borderColor:'#9a650f',paddingLeft:12}}><Text style={[ui.text,{fontWeight:'700'}]}>{issue.title}</Text><Text selectable style={ui.muted}>{issue.detail}</Text></View>)}{!review.issues.length && <Notice text="Nenhuma pendência identificada nestes campos. A conferência final do conteúdo continua sendo do professor." />}</>}
        </View>}
      </View>)}
      {!visible.length && <Notice text="Nenhuma questão corresponde ao filtro." />}<Text style={ui.muted}>Página {currentPage+1} de {lastPage+1}</Text><View style={ui.row}><PrimaryButton label="Página anterior" variant="secondary" disabled={!!busy || currentPage===0} onPress={()=>setPage(currentPage-1)} /><PrimaryButton label="Próxima página" variant="secondary" disabled={!!busy || currentPage===lastPage} onPress={()=>setPage(currentPage+1)} /></View>

    </>}
  </Card>;
}
