import { api } from './api';
import { analyze } from './ai';
import { runTests } from './execution';
import { Attempt, Challenge } from '../types/sdk';
// Every stage is persisted. Closing the app cannot turn a pending assessment into success.
export async function assess(token: string, initial: Attempt, challenge: Challenge, onUpdate: (a: Attempt) => void, signal: AbortSignal, resume = false) {
  let current = initial;
  const update = (a: Attempt) => { current = a; onUpdate(a); };
  try {
    if (resume) update(await api<Attempt>('assessment',token,{attempt_id:current.id,version:current.version,action:'resume'},undefined,signal));
    const x = current.data.assessment;
    if (!x || x.status !== 'running') throw new Error('Atualize a entrega antes de continuar.');
    if (x.current_step_id === 'execute') {
      const results = await runTests(current.data.language,current.data.code,challenge.data.tests,signal);
      if (results.some(r=>r.infrastructure_error)) throw new Error('O ambiente de execução não carregou. Seu código será liberado para editar e entregar novamente.');
      if (signal.aborted) throw new Error('Avaliação interrompida. Seu código está preservado.');
      update(await api<Attempt>('assessment',token,{attempt_id:current.id,version:current.version,run_id:x.run_id,action:'evidence',results},undefined,signal));
    }
    const response = await analyze(token,'assessment',challenge.id,1,signal,{run_id:current.data.assessment!.run_id});
    if (!response.attempt) throw new Error('A avaliação não foi registrada. Atualize e continue.');
    update(response.attempt);
    return response.attempt;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Não foi possível concluir a avaliação.';
    const runId=current.data.assessment?.run_id;
    // The response can be lost after the server committed the grade. Read the
    // canonical attempt before marking a failure; never repeat the provider call.
    try {
      const fresh=await api<Attempt>('attempt',token,{challenge_id:challenge.id,action:'start'});
      if(fresh.id===current.id){
        update(fresh);
        if(runId && fresh.data.assessment?.run_id===runId && fresh.data.assessment.status==='completed')return fresh;
      }
    }catch{/* Recovery remains visible; an offline client must not unlock locally. */}
    // Independent request records cancellation too; never auto-retry a provider call.
    try { if(current.data.status==='submitted' && runId && current.data.assessment?.run_id===runId)update(await api<Attempt>('assessment',token,{attempt_id:current.id,version:current.version,run_id:runId,action:'fail',message})); }
    catch { /* Stale version means another actor may have reviewed; keep UI error and refresh. */ }
    throw new Error(message);
  }
}
