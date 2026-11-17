import { Ionicons } from '@expo/vector-icons';
import { TeamActions } from '../../../src/components/TeamActions';
import { useEventSession } from '../../../src/components/EventSession';
import { EventRules } from '../../../src/components/EventRules';
import { flushPendingDraft } from '../../../src/lib/draft-gate';
import { Delivery, deliveryFor, deliveryConfirmed, sendDelivery, DeliveryUnconfirmed } from '../../../src/lib/delivery';
import { evaluationView } from '../../../src/lib/evaluation-view';
import { phaseProgress } from '../../../src/lib/phase-progress';
import { draftRelation, LocalDraft } from '../../../src/lib/local-draft';
import { useUnloadGuard } from '../../../src/lib/unload-guard';
import { TrainingBench } from '../../../src/components/TrainingBench';
import { RankSummary } from '../../../src/components/RankSummary';
import { Participation } from '../../../src/components/Participation';
import { QuestionContent } from '../../../src/components/QuestionContent';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useAuth } from '../../../src/providers/AuthProvider';
import { useCode } from '../../../src/providers/CodeProvider';
import { api, ApiError } from '../../../src/lib/api';
import { comparePractice } from '../../../src/lib/practice-results';
import { analyze, hashDraft } from '../../../src/lib/ai';
import { browserLanguages, executorConnection, executorLanguages, refreshExecutorCapabilities, runTests, stopExecution, subscribeExecutor } from '../../../src/lib/execution';
import { Attempt, Challenge, Language, RunResult, languageNames, levelNames, statusNames, challengePoints } from '../../../src/types/sdk';
import { CodeEditor } from '../../../src/components/CodeEditor';
import { Page, Notice, Busy, ui, HelpHeading } from '../../../src/components/Page';
import { Card } from '../../../src/components/Card';
import { Choice } from '../../../src/components/Choice';
import { TextField } from '../../../src/components/TextField';
import { SectionTabs } from '../../../src/components/SectionTabs';
import { LanguageTools } from '../../../src/components/LanguageTools';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { useFeedback } from '../../../src/providers/FeedbackProvider';
function pointText(value: number) { return `${value} ${value === 1 ? 'ponto' : 'pontos'}`; }
export default function Train() {
  const session=useEventSession();const { token, user } = useAuth(); const state = useCode(); const { width,height } = useWindowDimensions();
  const { showFeedback } = useFeedback();
  const [challenge, setChallenge] = useState<Challenge | null>(null); const [attempt, setAttempt] = useState<Attempt | null>(null); const [code, setCode] = useState(''); const [language, setLanguage] = useState<Language>('python');
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [results, setResults] = useState<RunResult[]>([]); const [dirty, setDirty] = useState(false);
  const executor=useSyncExternalStore(subscribeExecutor,executorConnection,executorConnection); const busyRef = useRef(busy); busyRef.current = busy;
  const [deliveryOpen,setDeliveryOpen]=useState(false);const deliveryFlight=useRef(false);const deliveryCancelled=useRef(false); const ai = useRef<AbortController | null>(null);
  const [panel, setPanel] = useState<'statement'|'code'>('statement');
  const [catalogOpen, setCatalogOpen] = useState(true); const [search, setSearch] = useState(''); const [level, setLevel] = useState('all'); const [listPage, setListPage] = useState(0);
  const [runError,setRunError]=useState('');const [hintError,setHintError]=useState('');const flushRef=useRef<()=>Promise<void>>(async()=>{});
  const [saving, setSaving] = useState(false); const [autosaveError, setAutosaveError] = useState('');
  const [localSaved,setLocalSaved]=useState(false);const [localConflict,setLocalConflict]=useState<LocalDraft|null>(null);
  const browserDraft=Platform.OS==='web';
  const practice=useRef<LocalDraft['practice']>(undefined);
  const [draftHash,setDraftHash]=useState('');
  const [retrySave,setRetrySave]=useState(true);
  const [pendingDelivery,setPendingDelivery]=useState<Delivery|null>(null);
  const [completionOpen,setCompletionOpen]=useState(false);
  const completionSeen=useRef('');
  const completionAfterDelivery=useRef(false);
  const attemptRef = useRef(attempt); attemptRef.current = attempt;
  const draftRef = useRef({ code, language }); draftRef.current = { code, language };
  const saveFlight = useRef<Promise<Attempt> | null>(null);
  const challengeRef = useRef(challenge?.id); challengeRef.current = challenge?.id;
  useEffect(() => { setChallenge(null); setAttempt(null); setCode(''); setDirty(false); setResults([]); practice.current=undefined; setLocalSaved(false);setLocalConflict(null);setAutosaveError('');setCatalogOpen(true); setPanel('statement');setDeliveryOpen(false);setPendingDelivery(null); setSearch(''); setLevel('all'); setListPage(0); completionAfterDelivery.current=false;completionSeen.current=''; }, [state.detail?.event.id]);
  useEffect(() => {
    if (!challenge || !state.detail || state.detail.challenges.some(c=>c.id===challenge.id)) return;
    // Visibility is confirmed by the server snapshot. Keep any unsynced draft
    // locally, but never leave an old warmup/hidden question actionable.
    const current=attemptRef.current;
    if(current?.data.status==='working' && dirty && !pendingDelivery)state.setDraft(challenge.id,{...draftRef.current,baseCode:current.data.code,baseLanguage:current.data.language,practice:practice.current});
    stopExecution();ai.current?.abort();challengeRef.current=undefined;attemptRef.current=null;
    setChallenge(null);setAttempt(null);setDirty(false);setResults([]);practice.current=undefined;setDeliveryOpen(false);setPendingDelivery(null);setLocalConflict(null);setCatalogOpen(true);setSearch('');setLevel('all');setListPage(0);
    setNotice('A lista de desafios foi atualizada pelo professor. Seu rascunho anterior foi preservado.');
  }, [state.detail,challenge?.id,dirty,pendingDelivery]);
  useEffect(() => () => { stopExecution(); ai.current?.abort(); }, []);
  async function action(key: string, fn: () => Promise<void>) { setBusy(key); setError(''); setNotice(''); try { await fn(); if (['save','reopen'].includes(key)) showFeedback({ title: key === 'submit' ? 'Entregue! Aguarde a revisão do professor.' : key === 'reopen' ? 'Tentativa reaberta' : 'Tentativa salva', tone: 'success' }); } catch (e) { setError((e as Error).message); showFeedback({ title: 'Não foi possível concluir', message: (e as Error).message, tone: 'error', durationMs: 9000 }); } finally { setBusy(''); } }
  async function open(c: Challenge) {
    await action('open', async () => {
      await state.flushDraft();
      setRunError('');setHintError('');
      const a=await api<Attempt>('attempt',token,{challenge_id:c.id,action:'start'});
      const stored=state.getDraft(c.id);
      const unresolved=stored?.delivery && stored.delivery.attemptId===a.id && !deliveryConfirmed(stored.delivery,a) ? stored.delivery : null;
      const draft=a.data.status==='working' ? stored : undefined;
      const relation=draft ? draftRelation(draft,a.data) : null;
      const recover=draft && relation!=='conflict' && c.data.languages.includes(draft.language as Language) ? draft : undefined;
      practice.current=recover?.practice?.challengeVersion===c.version ? recover.practice : undefined;
      if(stored?.delivery && deliveryConfirmed(stored.delivery,a))state.clearDraft(c.id);
      setPendingDelivery(unresolved);
      setLocalConflict(relation==='conflict' ? draft ?? null : null);
      setChallenge(c);setAttempt(a);attemptRef.current=a;challengeRef.current=c.id;
      draftRef.current={code:recover?.code ?? a.data.code,language:(recover?.language as Language) ?? a.data.language};
      setCode(draftRef.current.code);setLanguage(draftRef.current.language);
      setResults(unresolved?.payload.results ?? practice.current?.results ?? (relation==='recover'?[]:a.data.results.items ?? []));
      const restored=relation==='recover' && !!recover;
      setDirty(restored);
      const durable=!!recover && state.setDraft(c.id,{...recover,language:draftRef.current.language,practice:practice.current});
      setLocalSaved(durable);
      if(restored)setNotice('Rascunho deste navegador recuperado.');
      setAutosaveError(browserDraft && recover && !durable?'Não foi possível salvar neste navegador. Copie seu código antes de fechar a página.':'');
      setDeliveryOpen(false);
      setPanel(a.data.revisions===0 && !draftRef.current.code.trim() ? 'statement' : 'code');
      setCatalogOpen(false);
    });
  }
  function persistDraft(delivery?:Delivery) {
    const current=attemptRef.current;
    if(!current)return true;
    const durable=state.setDraft(current.data.challenge_id,{
      ...draftRef.current,baseCode:current.data.code,baseLanguage:current.data.language,practice:practice.current,delivery,
    });
    setLocalSaved(durable);
    if(browserDraft)setAutosaveError(durable?'':'Não foi possível salvar neste navegador. Copie seu código antes de fechar a página.');
    return durable;
  }
  async function save(actionName = 'save', runResults?: RunResult[]): Promise<Attempt> {
    if (!attempt || !challenge) throw new Error('Abra um desafio para continuar.');
    if(pendingDelivery)throw new DeliveryUnconfirmed();
    if (saveFlight.current) await saveFlight.current;
    const current = attemptRef.current || attempt; const snapshot = { ...draftRef.current };
    if(browserDraft){
      if(actionName==='save'){
        if(!persistDraft())throw new Error('Não foi possível salvar o rascunho neste navegador.');
        return current;
      }
      const next=await api<Attempt>('attempt',token,{challenge_id:challenge.id,version:current.version,action:actionName,local_draft:true});
      attemptRef.current=next;setAttempt(next);
      return next;
    }
    if(actionName==='save' && current.data.code===snapshot.code && current.data.language===snapshot.language){state.clearDraft(challenge.id);setDirty(false);setLocalSaved(false);setAutosaveError('');return current;}
    const flight = api<Attempt>('attempt', token, { challenge_id: challenge.id, version: current.version, action: actionName, ...snapshot, ...(runResults ? { results: runResults } : {}) }).catch(async e=>{
      // All response retries can fail after COMMIT. Reconcile only an exact saved
      // snapshot; never treat a different revision/code or lost reservation as saved.
      if(actionName==='save' && e instanceof ApiError && (e.status===0 || e.status>=500)){
        try{const fresh=await api<Attempt>('attempt',token,{challenge_id:challenge.id,action:'start'});
          if(fresh.id===current.id && fresh.data.status==='working' && fresh.data.code===snapshot.code && fresh.data.language===snapshot.language)return fresh;
        }catch{/* Local draft and normal backoff remain active. */}
      }
      throw e;
    });
    saveFlight.current = flight;
    try {
      const next = await flight;
      if (challengeRef.current !== challenge.id) return next;
      attemptRef.current = next; setAttempt(next);
      const unchanged = draftRef.current.code === snapshot.code && draftRef.current.language === snapshot.language;
      setDirty(!unchanged); setAutosaveError(''); if (unchanged) {state.clearDraft(challenge.id);setLocalSaved(false);} else setLocalSaved(state.setDraft(challenge.id,{...draftRef.current,baseCode:next.data.code,baseLanguage:next.data.language})); return next;
    } finally { if (saveFlight.current === flight) saveFlight.current = null; }
  }
  flushRef.current=async()=>{
    try{
      if(browserDraft){
        if((dirty || pendingDelivery) && !localSaved && !localConflict && !persistDraft(pendingDelivery ?? undefined)){
          throw new Error('O rascunho está apenas nesta tela. Copie o código ou libere o armazenamento do navegador para sair.');
        }
      }else{
        await flushPendingDraft(()=>({saved:attemptRef.current?.data || null,code:draftRef.current.code,language:draftRef.current.language,flight:saveFlight.current}),()=>save());
        setAutosaveError('');
      }
    }catch(e){setAutosaveError((e as Error).message);throw e;}
  };
  const flushDraft=useCallback(()=>flushRef.current(),[]);
  useEffect(()=>state.registerDraftGuard(flushDraft),[state.registerDraftGuard,flushDraft]);
  useUnloadGuard(browserDraft ? (dirty || !!pendingDelivery) && !localSaved : dirty || saving || !!autosaveError,flushDraft);
  const hasLocalHints=!!attempt?.data.hint_history?.some(h=>h.draft_language);
  useEffect(()=>{
    setDraftHash('');
    if(!browserDraft || !hasLocalHints)return;
    let active=true;
    void hashDraft(code).then(hash=>{if(active)setDraftHash(hash);}).catch(()=>{});
    return ()=>{active=false;};
  },[browserDraft,code,hasLocalHints]);
  const ended=!!state.detail?.event.data.ends_at && Date.parse(state.detail.event.data.ends_at)<=Date.now();
  const inBench=!!attempt && panel==='code';const fixedWorkbench=(session.ready||ended) && inBench && Platform.OS==='web' && width>=1000 && height>=600;
  const waitingForApproval=state.detail?.event.data.classroom_version===1 && state.detail.event.data.phase==='official' && !state.detail.teams.find(t=>t.id===state.detail?.my_team_id)?.data.approved;
  const auto = !!state.detail?.event.data.teams_mode;
  const member=state.detail?.members.find(m=>m.user_id===user?.id); const readyToSolve=!!member && (!auto || !!member.team_id);
  const locked = ended || waitingForApproval || !!pendingDelivery || attempt?.data.status !== 'working';
  const eventId = state.detail?.event.id;
  useFocusEffect(useCallback(()=>{let checking=false;const refresh=async()=>{if(checking || busyRef.current)return;checking=true;try{await refreshExecutorCapabilities();}finally{checking=false;}};void refresh();const timer=setInterval(()=>void refresh(),15000);return()=>clearInterval(timer);},[]));
  useEffect(()=>{if(!attempt || attempt.data.status!=='working' || !state.detail?.event.data.teams_mode)return;const claim=state.detail.claims?.find(c=>c.data.challenge_id===attempt.data.challenge_id);if(!claim || claim.owner!==user?.id){const latest=state.detail.attempts.find(a=>a.id===attempt.id);if(latest && latest.version>attempt.version && latest.data.status!=='working'){setAttempt(latest);attemptRef.current=latest;setDirty(false);setNotice('Reserva liberada. Seu código continua visível para copiar; o colega pode continuar pelo último rascunho salvo.');}}},[state.detail,attempt?.id,attempt?.data.status,user?.id]);
  useEffect(()=>{
    if(!attempt || busy || saveFlight.current)return;
    const latest=state.detail?.attempts.find(a=>a.id===attempt.id);
    if(!latest || latest.version<=attempt.version || latest.data.status==='working')return;
    // Polling is authoritative for evaluation/revocation metadata. Never leave
    // a frozen submission editable just because this editor was already open.
    if(dirty && !pendingDelivery)state.setDraft(attempt.data.challenge_id,{...draftRef.current,baseCode:attempt.data.code,baseLanguage:attempt.data.language});
    const confirmed=pendingDelivery && deliveryConfirmed(pendingDelivery,latest);
    if(confirmed){state.clearDraft(pendingDelivery.payload.challenge_id);setPendingDelivery(null);}
    attemptRef.current=latest;setAttempt(latest);draftRef.current={code:latest.data.code,language:latest.data.language};setCode(latest.data.code);setLanguage(latest.data.language);setDirty(false);setResults(latest.data.results.items||[]);setError('');
    if(attempt.data.status==='working')setNotice(dirty?'A versão entregue foi confirmada. Suas alterações posteriores continuam preservadas neste navegador.':'Entrega confirmada pelo evento. Consulte o andamento pelo botão Entrega.');
  },[state.detail,attempt,busy,dirty,pendingDelivery]);
  useEffect(() => {
    if (browserDraft || !dirty || busy || attempt?.data.status !== 'working' || saving || !retrySave || localConflict || !challenge) return;
    const timer = setTimeout(() => {
      setSaving(true);
      void save().catch(e => { setRetrySave(!(e instanceof ApiError && e.status===409));setAutosaveError(e.message); showFeedback({ title: 'Ainda não sincronizado com o evento', message: e.message, tone: 'error', durationMs: 10000 }); }).finally(() => setSaving(false));
    }, autosaveError ? 120000 + Math.random()*60000 : localSaved ? 60000 + Math.random()*30000 : 15000 + Math.random()*5000);
    return () => clearTimeout(timer);
  }, [browserDraft,code, language, dirty, busy, locked, saving, autosaveError, retrySave,localConflict,localSaved,challenge?.id]);
  const labels=state.detail?.event.data.level_labels || levelNames;
  const warmup=state.detail?.event.data.classroom_version===1 && state.detail.event.data.phase!=='official';
  const phaseStatus=state.detail && user ? phaseProgress(state.detail.event.data,state.detail.challenges,state.detail.attempts,user.id) : null;
  const phaseKey=state.detail && phaseStatus ? `${state.detail.event.id}:${phaseStatus.warmup?'warmup':'official'}:${phaseStatus.total}` : '';
  useEffect(()=>{
    if(state.loading || state.error || state.syncError || busy)return;
    if(!phaseStatus?.complete){completionSeen.current='';setCompletionOpen(false);return;}
    const justDelivered=completionAfterDelivery.current && attempt?.data.status==='submitted';
    if((justDelivered || !attempt && !challenge && !deliveryOpen) && readyToSolve && (session.ready||ended) && completionSeen.current!==phaseKey){completionAfterDelivery.current=false;completionSeen.current=phaseKey;if(justDelivered)setDeliveryOpen(false);setCompletionOpen(true);}
  },[phaseStatus?.complete,phaseKey,attempt,challenge,deliveryOpen,state.loading,state.error,state.syncError,readyToSolve,session.ready,ended,busy]);
  const available = (state.detail?.challenges || []).filter(c => (level === 'all' || c.data.level === level) && `${c.data.title} ${c.data.topics}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const runtime = executorLanguages().find(c => c.language === language);
  const supported = Platform.OS === 'web' ? [...new Set([...browserLanguages, ...executorLanguages().map(c=>c.language)])] : [];
  const runnable = challenge ? challenge.data.languages.filter(value=>supported.includes(value)) : [];
  const canRun = runnable.includes(language);
  const executionLabel = challenge && !challenge.data.languages.includes(language) ? `${languageNames[language]} não está permitida neste desafio. Escolha uma linguagem disponível; seu código será preservado.` : Platform.OS !== 'web' ? 'Para executar, abra esta tentativa no navegador do computador.' : runtime ? `Executor conectado · ${runtime.version}` : executor.status==='connecting' ? 'Reconectando ao executor… Seu código está preservado.' : browserLanguages.includes(language) ? `${languageNames[language]} · execução no navegador` : `${languageNames[language]} precisa do executor local. ${executor.status==='unavailable'?'A reconexão falhou. Tente reconectar na Conta.':'Conecte-o na Conta; seu código pode ser salvo agora.'}`;
  function editDraft(nextCode:string,nextLanguage:Language) {
    draftRef.current={code:nextCode,language:nextLanguage};
    practice.current=undefined;
    setCode(nextCode);setLanguage(nextLanguage);setDirty(true);setRetrySave(true);
    setResults([]);setRunError('');
    persistDraft();
  }
  function changeLanguage(next: Language) {
    if (!challenge || locked || busy || !runnable.includes(next)) return;
    editDraft(code,next);
  }
  async function testCode() {
    if(!challenge)return;
    practice.current=undefined;setResults([]);setRunError('');
    await action('run',async()=>{
      try{
        const snapshot={...draftRef.current};
        const evidence=comparePractice(challenge,await runTests(snapshot.language,snapshot.code,challenge.data.tests));
        setResults(evidence);
        practice.current={challengeVersion:challenge.version,results:evidence};
        persistDraft();
        const passed=evidence.filter(item=>item.passed).length;
        showFeedback({title:evidence.some(item=>item.comparison==='ai_pending')?'Execução concluída · saídas serão conferidas na entrega':`${passed} de ${evidence.length} testes passaram`,
          message:'Confira a saída no painel Resultados.',tone:passed===evidence.length?'success':'warning',durationMs:5000});
      }catch(e){setRunError((e as Error).message);throw e;}
    });
  }
  async function customInput(input:string):Promise<RunResult> {
    setBusy('manual');setError('');
    try {
      const current={...draftRef.current};
      const r=await runTests(current.language,current.code,[{input,output:''}]);
      return r[0] || {output:'',error:'A execução não retornou uma saída.',exit_code:1,engine:'local'};
    } finally {setBusy('');}
  }
  async function hint(level:number,question?:string) {
    if(!challenge || pendingDelivery)return false;
    let received=false;setHintError('');
    await action('hint',async()=>{
      try{
        if(!browserDraft && !locked)await save();
        ai.current=new AbortController();
        const local=browserDraft && !locked ? {...draftRef.current,results:practice.current?.challengeVersion===challenge.version?practice.current.results:[]} : undefined;
        const r=await analyze(token!,'hint',challenge.id,level,ai.current.signal,{question,draft:local});
        if(r.attempt){setAttempt(r.attempt);attemptRef.current=r.attempt;}
        if(r.hint){received=true;showFeedback({title:'Dica recebida',message:'A nova orientação está junto ao código.',durationMs:5000});}
      }catch(e){setHintError((e as Error).message);throw e;}
    });
    return received;
  }
  async function hideHint(sequence:number|undefined,index:number){if(!attempt || pendingDelivery)return;await action('hideHint',async()=>{await state.flushDraft();const current=attemptRef.current;if(!current)throw new Error('Abra o desafio novamente.');const next=await api<Attempt>('hint/hide',token,{attempt_id:current.id,version:current.version,...(sequence?{sequence}:{index})});setAttempt(next);attemptRef.current=next;showFeedback({title:'Dica removida do histórico visível',message:'Ela não será enviada nas próximas dicas.',tone:'success'});});}
  function showDelivery(){setError('');setDeliveryOpen(true);}
  async function returnToCode(){if(busyRef.current){if(busyRef.current!=='submit' || pendingDelivery)return;deliveryCancelled.current=true;stopExecution();}setDeliveryOpen(false);setPanel('code');}
  async function confirmDelivery(){
    if(deliveryFlight.current || busyRef.current || !attemptRef.current || (!pendingDelivery && attemptRef.current.data.status!=='working'))return;
    deliveryFlight.current=true;deliveryCancelled.current=false;
    try{await action('submit',async()=>{
      let delivery=pendingDelivery;
      if(!delivery){
        if(!browserDraft)await state.flushDraft();if(deliveryCancelled.current)throw new Error('Entrega cancelada antes do envio. Seu código continua salvo e editável.');const snapshot={...draftRef.current};let evidence:RunResult[]|undefined;
        if(auto){
          const cached=practice.current?.challengeVersion===challenge!.version ? practice.current.results : undefined;
          evidence=cached?.length===challenge!.data.tests.length && !cached.some(r=>r.infrastructure_error)
            ? cached : comparePractice(challenge!,await runTests(snapshot.language,snapshot.code,challenge!.data.tests));
          if(evidence.some(r=>r.infrastructure_error))throw new Error('Os testes não puderam ser executados. Seu código continua editável. Tente entregar novamente.');
          setResults(evidence);
        }
        if(deliveryCancelled.current)throw new Error('Entrega cancelada antes do envio. Seu código continua salvo e editável.');
        if(snapshot.code!==draftRef.current.code || snapshot.language!==draftRef.current.language)throw new Error('O código mudou durante os testes. Confira e entregue novamente.');
        delivery=deliveryFor(attemptRef.current!,snapshot.code,snapshot.language,evidence);
        setPendingDelivery(delivery);
        const durable=persistDraft(delivery);
        if(!durable)setNotice('O armazenamento deste navegador está indisponível. Mantenha esta tela aberta até confirmar a entrega.');
      }
      let next:Attempt;
      const flight=sendDelivery(token,delivery);saveFlight.current=flight;
      try{next=await flight;}
      catch(e){
        if(!(e instanceof DeliveryUnconfirmed) && challengeRef.current===delivery.payload.challenge_id){
          setPendingDelivery(null);
          persistDraft();
        }
        throw e;
      }finally{if(saveFlight.current===flight)saveFlight.current=null;}
      state.clearDraft(delivery.payload.challenge_id);
      if(challengeRef.current!==delivery.payload.challenge_id)return;
      attemptRef.current=next;setAttempt(next);setPendingDelivery(null);setDirty(false);practice.current=undefined;setLocalSaved(false);
      setNotice('Entrega salva. Aguarde a avaliação do professor ou escolha outro desafio.');showFeedback({title:'Entrega salva',message:'Você já pode resolver outro desafio.',tone:'success'});
      // Updating the catalogue is secondary: a failed refresh cannot undo a receipt.
      completionAfterDelivery.current=true;
      await state.reloadEvent().catch(()=>setNotice('Entrega salva. A lista será atualizada quando a conexão voltar. Você pode resolver outro desafio.'));
    });}finally{deliveryFlight.current=false;}
  }
  async function account(executor=false){try{await state.flushDraft();router.push(executor?{pathname:'/account',params:{section:'executor'}}:'/account');}catch(e){showFeedback({title:'Seu código ainda não foi salvo',message:(e as Error).message,tone:'error'});}}
  const evaluation = attempt ? evaluationView(attempt) : undefined;
  return <Page compact={!!attempt} fixed={fixedWorkbench} title="Desafios da maratona" subtitle={state.detail?.event.data.title || 'Selecione um evento na aba Eventos.'} help="train#editor">
    {state.detail?.event.data.status==='published' && member && user && <RankSummary key={user.id+':'+state.detail.event.id} eventId={state.detail.event.id} token={token} userId={user.id} teamId={member.team_id} teamsMode={auto} compact={fixedWorkbench} />}
    {error && (!inBench || !runError && !hintError) && <Notice text={error} error />}{notice && !inBench && <Notice text={notice} />}{busy && !inBench && <Busy text={busy === 'run' ? 'Executando os testes no seu computador…' : busy === 'hint' ? 'Preparando uma pista…' : busy === 'assessment' || busy === 'submit' ? 'Preparando e salvando entrega…' : 'Salvando e carregando…'} />}
    {!inBench && (busy === 'run' || busy === 'hint' || busy === 'assessment' || busy === 'submit') && <PrimaryButton label="Interromper" variant="secondary" onPress={() => { stopExecution(); ai.current?.abort(); }} />}
    {waitingForApproval && <Notice text="Aguarde o professor conferir e liberar sua equipe. Você pode consultar os enunciados."/>}{!fixedWorkbench && state.detail?.event.data.classroom_version===1 && state.detail.event.data.phase!=='official' && <Notice text="Aquecimento · estes desafios valem zero pontos. O professor libera a fase oficial."/>}{state.loading && <Busy />}{state.error && <Notice text={state.error} error />}
    {!state.loading && !state.detail && <Card><Text style={ui.h2}>Vamos escolher um evento?</Text><Text style={ui.text}>Entre com o código do professor para ver os desafios da turma.</Text><PrimaryButton label="Ir para Eventos" onPress={() => router.push('/')} /></Card>}
    {state.detail?.event.data.status === 'draft' && <Card><Notice text="Este evento ainda está em rascunho. Os desafios serão liberados após a publicação pelo professor." /><PrimaryButton label={state.detail?.event.owner===user?.id?"Preparar meu evento":"Ir para Eventos"} onPress={()=>router.push(state.detail?.event.owner===user?.id?'/teacher':'/')} /></Card>}
    {ended && <Card><HelpHeading title="Evento encerrado" help="train#assessment"/><Text style={ui.text}>Novas entregas estão encerradas. Consulte suas tentativas e o ranking. Entregas pendentes ainda podem ser avaliadas, e o ranking pode mudar.</Text><PrimaryButton label="Ver ranking" variant="secondary" onPress={()=>router.push('/ranking')}/></Card>}
    {phaseStatus?.complete && !attempt && !challenge && <Card><HelpHeading title={warmup?'Desafios do aquecimento enviados':'Desafios da fase oficial enviados'} help="train#assessment"/><Text style={ui.text}>{phaseStatus.pending ? `${phaseStatus.pending} entrega(s) aguardam avaliação. Se alguma for devolvida, ela poderá precisar de uma nova tentativa.` : 'As entregas estão avaliadas. O professor ainda pode revisar os resultados.'} {warmup?'Aguarde o professor iniciar a fase oficial.':'Acompanhe o ranking e os resultados enquanto o evento estiver ativo.'}</Text>{!warmup && <PrimaryButton label="Ver ranking" variant="secondary" onPress={()=>router.push('/ranking')}/>}</Card>}
    <Modal visible={completionOpen} transparent animationType="fade" onRequestClose={()=>setCompletionOpen(false)}><View style={{flex:1,backgroundColor:'#14233499',justifyContent:'center',padding:16}}><View accessibilityViewIsModal style={{width:'100%',maxWidth:520,alignSelf:'center',backgroundColor:'#fff',borderRadius:16,padding:20,gap:12}}><Text accessibilityRole="header" style={ui.h2}>{warmup?'Aquecimento enviado':'Desafios enviados'}</Text><Text style={ui.text}>{warmup?'Sua equipe enviou todos os desafios disponíveis do aquecimento. Aguarde o professor iniciar a fase oficial.':'Sua equipe enviou todos os desafios disponíveis desta fase.'}</Text><Text style={ui.muted}>{phaseStatus?.pending ? `${phaseStatus.pending} entrega(s) ainda aguardam avaliação. Uma solução devolvida pode ser revisada e enviada novamente.` : 'Os resultados podem ser revistos pelo professor.'}</Text>{!warmup && <PrimaryButton label="Ver ranking" onPress={()=>{setCompletionOpen(false);router.push('/ranking');}}/>}<PrimaryButton label={warmup?'Entendi':'Continuar nos desafios'} variant="secondary" onPress={()=>setCompletionOpen(false)}/></View></View></Modal>
    {state.detail?.event.data.status==='published' && !readyToSolve && <Participation key={state.detail.event.id} compact />}
    {state.detail?.event.data.status==='published' && readyToSolve && !attempt && <View style={ui.row}><Text style={[ui.badge,{flex:1}]}>{auto?`Equipe: ${state.detail.teams.find(t=>t.id===member?.team_id)?.data.name}`:'Participação individual'}</Text>{auto && <PrimaryButton label="Minha equipe" variant="secondary" onPress={()=>router.push('/team')} />}</View>}
    {state.detail?.event.data.status==='published' && readyToSolve && !session.ready && !ended && <EventRules compact/>}
    {state.detail?.event.data.status === 'published' && readyToSolve && (session.ready||ended) && <View style={[ui.row, { alignItems: fixedWorkbench?'stretch':'flex-start', flexDirection: width >= 1000 ? 'row' : 'column' },fixedWorkbench && {flex:1,minHeight:0,flexWrap:'nowrap',gap:10}]}>
      {(!attempt || catalogOpen) && <ScrollView nestedScrollEnabled style={{ width: width >= 1000 ? 260 : '100%',flexGrow:0,...(fixedWorkbench?{height:'100%'}:{maxHeight:undefined}) }} contentContainerStyle={{gap:10}}>
        {(catalogOpen || !challenge) ? <Card><HelpHeading title="Desafios" help="train#claims" /><TextField label="Buscar por título ou assunto" value={search} onChangeText={v=>{setSearch(v);setListPage(0);}} /><Choice label="Dificuldade" value={level} options={[{value:'all',label:'Todas'},{value:'easy',label:labels.easy},{value:'medium',label:labels.medium},{value:'hard',label:labels.hard}]} onChange={v=>{setLevel(v);setListPage(0);}} /><Text style={ui.muted}>{available.length} {available.length===1?'desafio encontrado':'desafios encontrados'} · página {listPage+1} de {Math.max(1,Math.ceil(available.length/6))}</Text>
        {auto && !state.detail.my_team_id && <Notice text="Escolha sua equipe na aba Eventos para reservar um desafio." />}
        <ScrollView nestedScrollEnabled style={{maxHeight:width>=1000?560:360}} contentContainerStyle={{gap:12}}>{available.slice(listPage*6,(listPage+1)*6).map(c => {
          const savedAttempt=state.detail!.attempts.find(a=>a.owner===user?.id && a.data.challenge_id===c.id);
          // A confirmed submission remains visible even if the next refresh fails.
          const currentAttempt=attempt && attempt.owner===user?.id && attempt.data.challenge_id===c.id ? attempt : undefined;
          const ownAttempt=currentAttempt && (!savedAttempt || currentAttempt.version>savedAttempt.version) ? currentAttempt : savedAttempt;
          const claim=state.detail!.claims?.find(x=>x.data.challenge_id===c.id);
          const other=claim && claim.owner!==user?.id;
          return <View key={c.id} style={{gap:8,borderWidth:1,borderColor:other?'#b37b18':challenge?.id===c.id?'#2456c7':'#d8e0d6',backgroundColor:challenge?.id===c.id?'#eef3ff':'#fff',padding:12,borderRadius:12}}><Text style={ui.h2}>{c.data.title}</Text><Text style={ui.badge}>{labels[c.data.level]} · {pointText(warmup?0:challengePoints(state.detail!.event.data,c.data.level))}</Text>
            {ownAttempt && !other ? <Text accessibilityRole="text" style={[ui.badge,{alignSelf:'flex-start'}]}>{ownAttempt.data.status==='submitted'?'Entregue · aguardando avaliação':ownAttempt.data.status==='revise'?'Devolvido · precisa de revisão':statusNames[ownAttempt.data.status]}</Text> : <Text style={ui.muted}>{other ? `${claim.data.name} · ${claim.data.status ? statusNames[claim.data.status] : 'Resolvendo'} na sua equipe.` : ended?'Disponível para consulta':'Disponível para escolher'}</Text>}
            {other && <TeamActions claim={claim.id} challenge={c.id}/>}
            <PrimaryButton label="Ver enunciado" variant="secondary" disabled={!!busy || (!browserDraft && dirty)} onPress={()=>action('open',async()=>{await state.flushDraft();setChallenge(c);setAttempt(null);setCode('');setDirty(false);setResults([]);practice.current=undefined;setLocalSaved(false);setLocalConflict(null);setPendingDelivery(null);setAutosaveError('');setPanel('statement');setCatalogOpen(false);})} />
            <PrimaryButton label={ownAttempt?.data.status==='validated'?'Ver solução aprovada':ownAttempt?.data.status==='submitted'?'Ver entrega':ownAttempt?.data.status==='rejected'?'Ver avaliação':ownAttempt?.data.status==='revise'?'Revisar solução':ownAttempt?'Continuar desafio':'Resolver desafio'} variant="secondary" disabled={waitingForApproval || !!busy || !!other || (auto&&!state.detail!.my_team_id) || (ended&&!ownAttempt)} onPress={()=>open(c)} />
          </View>;
        })}</ScrollView>
        {!available.length && <Text style={ui.muted}>Nenhum desafio com esse filtro. Tente outro título ou dificuldade.</Text>}
        {available.length>6 && <View style={ui.row}><PrimaryButton label="Anterior" variant="secondary" disabled={!listPage} onPress={()=>setListPage(p=>p-1)} /><PrimaryButton label="Próximos" variant="secondary" disabled={(listPage+1)*6>=available.length} onPress={()=>setListPage(p=>p+1)} /></View>}</Card> : <PrimaryButton label="Trocar desafio" variant="secondary" onPress={()=>setCatalogOpen(true)} />}
      </ScrollView>}
      <View style={{ flex: 1,minHeight:0, width: width >= 1000 ? undefined : '100%', minWidth: 0, gap: 8 }}>
        {!challenge && <Notice text={ended?"Selecione um desafio para consultar o enunciado ou uma tentativa já registrada. O prazo terminou; novas tentativas estão encerradas.":"Escolha um desafio para começar. O tempo registrado começa ao escolher Resolver desafio."} />}
        {challenge && !attempt && <Card><Text style={ui.h2}>{challenge.data.title}</Text><QuestionContent data={challenge.data} id={challenge.id} /><Text style={ui.badge}>{pointText(challengePoints(state.detail!.event.data,challenge.data.level))}</Text><Notice text="Ler não inicia o tempo nem reserva o desafio para sua equipe." /><Text style={ui.muted}>Disponíveis para executar agora: {runnable.map(l=>languageNames[l]).join(' · ') || 'nenhuma neste dispositivo'}. {challenge.data.languages.some(l=>!runnable.includes(l)) ? `Outras linguagens permitidas precisam do executor local: ${challenge.data.languages.filter(l=>!runnable.includes(l)).map(l=>languageNames[l]).join(' · ')}.` : ''}</Text>{state.detail!.claims?.filter(c=>c.data.challenge_id===challenge.id && c.owner!==user?.id).map(c=><Notice key={c.id} text={`${c.data.name} · ${c.data.status ? statusNames[c.data.status] : 'Em andamento'} na sua equipe. Você pode ler ou escolher outro desafio.`} />)}{auto&&!state.detail!.my_team_id && <><Notice text="Escolha uma equipe antes de começar." /><PrimaryButton label="Escolher minha equipe" onPress={()=>router.push('/')} /></>}<PrimaryButton label="Resolver este desafio" disabled={waitingForApproval || ended || !!busy || (auto&&!state.detail!.my_team_id) || !!state.detail!.claims?.some(c=>c.data.challenge_id===challenge.id && c.owner!==user?.id)} onPress={()=>open(challenge)} /><PrimaryButton label="Ver outros desafios" variant="secondary" onPress={()=>{setChallenge(null);setCatalogOpen(true);}} /></Card>}
        {challenge && attempt && <>
          <View style={{gap:4}}><View style={ui.row}>{fixedWorkbench && warmup && <Text style={ui.badge}>Aquecimento · 0 pontos</Text>}<Text numberOfLines={1} style={{flex:1,fontSize:16,fontWeight:'800',color:'#172b3a'}}>{challenge.data.title}</Text><Text style={ui.badge}>{statusNames[attempt.data.status]} · {pointText(challengePoints(state.detail!.event.data,challenge.data.level))}{evaluation?.grade!==undefined?` · nota ${evaluation.grade}/10`:''}</Text></View><SectionTabs value={panel} onChange={setPanel} options={[{value:'statement',label:'Enunciado'},{value:'code',label:'Código'}]} /></View>
          {panel==='statement' && <Card><HelpHeading title="O desafio" help="train#statement" /><QuestionContent data={challenge.data} id={challenge.id} /><Text style={ui.muted}>Assuntos: {challenge.data.topics || 'Raciocínio e programação'}</Text><PrimaryButton label="Ir para meu código" onPress={()=>setPanel('code')} /></Card>}
          {localConflict && panel==='code' && <Card><Notice error text="Há um rascunho neste navegador e uma versão diferente no evento. Compare as versões antes de restaurar o rascunho."/><Text style={ui.h2}>Versão do evento</Text><Text selectable style={ui.code}>{code || '(vazio)'}</Text><Text style={ui.h2}>Rascunho neste navegador</Text><Text selectable style={ui.code}>{localConflict.code || '(vazio)'}</Text><PrimaryButton label="Restaurar rascunho deste navegador" disabled={!challenge.data.languages.includes(localConflict.language as Language)} onPress={()=>{const restored={code:localConflict.code,language:localConflict.language as Language};draftRef.current=restored;setCode(restored.code);setLanguage(restored.language);setDirty(true);practice.current=undefined;setResults([]);persistDraft();setLocalConflict(null);setRetrySave(true);}}/></Card>}
          <View style={{display:panel==='code'&&!localConflict?'flex':'none',flex:fixedWorkbench?1:undefined,minHeight:0}}><TrainingBench key={challenge.id} desktop={fixedWorkbench} code={code} language={language} allowed={challenge.data.languages} available={runnable} readOnly={locked || state.flushingDraft || !!localConflict} busy={busy} saving={saving || state.flushingDraft} dirty={dirty} localSaved={localSaved} saveError={autosaveError} runError={runError} hintError={hintError} results={results} tests={challenge.data.tests} codeRevision={attempt.data.revisions} history={attempt.data.hint_history} hint={attempt.data.last_hint} draftHash={draftHash} browserDraft={browserDraft} canRun={canRun} executorConnecting={executor.status==='connecting'} execution={executionLabel} canPass={auto && !locked && !localConflict} canReopen={!ended && attempt.data.status==='revise'} catalogOpen={catalogOpen} onCatalog={()=>setCatalogOpen(v=>!v)} onCode={next=>editDraft(next,language)} onLanguage={changeLanguage} onRun={testCode} onManual={customInput} onHint={hint} onHideHint={hideHint} onRetrySave={async()=>{setRetrySave(true);await action('save',flushDraft);}} onPass={()=>action('pass',async()=>{await state.flushDraft();await save('pass');if(!browserDraft)state.clearDraft(challenge.id);setChallenge(null);setAttempt(null);setDirty(false);setCatalogOpen(true);setNotice('Desafio liberado. Seu rascunho permanece onde foi salvo.');await state.reloadEvent();})} onReopen={()=>action('reopen',async()=>{await save('reopen');completionSeen.current='';completionAfterDelivery.current=false;await state.reloadEvent();})} deliveryState={pendingDelivery?'unconfirmed':attempt.data.status} deliveryGrade={evaluation?.grade} onDeliver={showDelivery} onStop={()=>{stopExecution();ai.current?.abort();}} onAI={()=>void account()} onExecutor={()=>void account(true)} /></View>
          <Modal visible={deliveryOpen} transparent animationType="fade" onRequestClose={()=>void returnToCode()}><View style={{flex:1,backgroundColor:'#14233499',justifyContent:'center',padding:16}}><View accessibilityViewIsModal style={{width:'100%',maxWidth:620,maxHeight:'90%',alignSelf:'center',backgroundColor:'#fff',borderRadius:16,padding:16,gap:12}}><View style={ui.row}><Text accessibilityRole="header" style={[ui.h2,{flex:1}]}>{pendingDelivery?'Confirmar recebimento da entrega':attempt.data.status==='working'?'Entregar este desafio?':'Sua avaliação'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Ajuda sobre entrega e avaliação" style={ui.icon} onPress={async()=>{try{await state.flushDraft();setDeliveryOpen(false);router.push({pathname:'/help',params:{page:attempt.data.status==='working'?'train#submit':'train#assessment'}});}catch(e){setError((e as Error).message);}}}><Ionicons name="help-circle-outline" size={25} color="#2456c7"/></Pressable></View>{error&&<Notice text={error} error/>}{notice&&<Text accessibilityLiveRegion="polite" style={ui.text}>{notice}</Text>}{(busy==='submit'||busy==='assessment')&&<Busy text={pendingDelivery?"Confirmando recebimento da entrega…":"Executando os testes antes de enviar…"}/>}<ScrollView contentContainerStyle={{gap:12}}>
          {attempt.data.assessment && <View style={{gap:10}}><Text style={ui.text}>{attempt.data.assessment.message}</Text>{phaseStatus?.complete && !state.error && !state.loading && <Notice text={warmup?'Sua equipe enviou todos os desafios do aquecimento. Aguarde o professor iniciar a fase oficial; as entregas ainda podem precisar de avaliação.':'Sua equipe enviou todos os desafios disponíveis. Confira os resultados e o ranking; uma entrega devolvida poderá ser revisada.'}/>} {attempt.data.assessment.evaluator&&<Text style={ui.muted}>Avaliador: {attempt.data.assessment.evaluator.model} · {attempt.data.assessment.evaluator.provider==='gemini'?'Google':'NVIDIA'}</Text>}{attempt.data.assessment.steps.map(step=><Text key={step.id} style={ui.muted}>{step.status==='done'?'✓':step.status==='active'?'◉':step.status==='error'?'!':'○'} {step.title}</Text>)}{attempt.data.assessment.error_repair && <Notice text={attempt.data.assessment.error_repair.user_message} error />}{attempt.data.status==='submitted' && <Notice text="Sua entrega está salva. O professor processará a avaliação; você pode continuar em outro desafio."/>}{attempt.data.assessment.effective?.source==='teacher' && <Notice text="A avaliação vigente foi revisada pelo professor." />}</View>}
          {pendingDelivery && <View style={{gap:8}}><Notice text="A confirmação da entrega está pendente. Seu código e os testes estão preservados; a verificação não executa os testes novamente."/><PrimaryButton label="Verificar entrega" loading={busy==='submit'} disabled={!!busy} onPress={confirmDelivery}/></View>}
          {!pendingDelivery && !ended && attempt.data.status==='revise' && <PrimaryButton label="Reabrir para continuar" disabled={!!busy} onPress={()=>action('reopen',async()=>{await save('reopen');completionSeen.current='';completionAfterDelivery.current=false;setPanel('code');setDeliveryOpen(false);await state.reloadEvent();})} />}
          {(attempt.data.status==='validated'||attempt.data.status==='submitted'||attempt.data.status==='rejected') && <PrimaryButton label="Escolher outro desafio" onPress={()=>{setDeliveryOpen(false);setChallenge(null);setAttempt(null);setCode('');setDirty(false);setResults([]);setCatalogOpen(true);setSearch('');setLevel('all');setListPage(0);setNotice('');}} />}
          {evaluation?.feedback && <Notice text={`Orientação da avaliação: ${evaluation.feedback}`} />}
          {locked && !pendingDelivery && !attempt.data.assessment && <Notice text={`Entrega: ${statusNames[attempt.data.status]}. Consulte seu código ou aguarde a revisão do professor.`} />}
          {!locked && <View style={{gap:12}}><Text style={ui.h2}>{challenge.data.title}</Text><Text style={ui.text}>Vamos salvar e preservar esta versão do código.{auto?' Os testes serão executados neste dispositivo; depois, a entrega ficará na fila de avaliação do professor. Você poderá continuar em outro desafio.':' O professor fará a avaliação.'} Você poderá consultar o resultado por este mesmo botão.</Text><Text style={ui.muted}>Parar e liberar guarda o rascunho neste navegador e libera a reserva. Entregar envia sua resposta para avaliação.</Text><PrimaryButton label="Confirmar entrega" loading={busy==='submit'} disabled={!!busy || ended || !code.trim()} onPress={confirmDelivery}/></View>}
          </ScrollView>{(busy==='submit'||busy==='assessment')&&!pendingDelivery&&<PrimaryButton label="Cancelar execução dos testes" variant="secondary" onPress={()=>{stopExecution();ai.current?.abort();}}/>}<PrimaryButton label={busy==='submit'?(pendingDelivery?'Aguarde a confirmação da entrega':'Cancelar testes e voltar ao código'):attempt.data.status==='working'&&!pendingDelivery?'Continuar trabalhando':'Voltar ao código'} variant="secondary" disabled={!!busy && (busy!=='submit' || !!pendingDelivery)} onPress={()=>void returnToCode()}/></View></View></Modal>

        </>}
      </View>
    </View>}
  </Page>;
}
