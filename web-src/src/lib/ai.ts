import { api, ApiError } from './api';
import { waitRetry, retryDelay, transient } from './retry';
import { AISettings, Attempt, Challenge, Hint, Language, RunResult } from '../types/sdk';

export type AIResult = { attempt?: Attempt; challenge?: Challenge; hint?: Hint; transport: string };
type HintDraft = {code: string; language: Language; results: RunResult[]};
type Prepared = { ticket: string; run_id: string };
type ProviderJob = { ready?: boolean; pending?: boolean; failure?: { status: number; message: string } };

export async function hashDraft(code: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function resolveAnalysis(token: string, ticket: string, signal?: AbortSignal): Promise<AIResult> {
  for (let round = 0; round < 3; round++) {
    try {
      for (let poll = 0; poll < 20; poll++) {
        const result = await api<ProviderJob>('ai/request', token, { ticket, round }, undefined, signal);
        if (result.failure) throw new ApiError(result.failure.message, result.failure.status, null, 'provider');
        if (result.ready) return await api<AIResult>('ai/complete', token, { ticket, round }, undefined, signal);
        if (!result.pending) throw new ApiError('Consulta sem confirmação do servidor.', 409);
        await waitRetry(4000 + Math.random() * 2000, signal);
      }
      throw new ApiError('A consulta ainda não pôde ser confirmada. Seu código está preservado.', 409);
    } catch (cause) {
      const error = cause as ApiError;
      const retry = error.code === 'sc_code_ai_format' || error.code === 'provider' && transient(error.status);
      if (signal?.aborted || round === 2 || !retry) throw cause;
      const delay = retryDelay(round, error.retryAfter);
      if (delay === null) throw cause;
      await waitRetry(delay, signal);
    }
  }
  throw new Error('A análise não pôde ser concluída.');
}

export async function analyze(token: string, mode: 'hint' | 'classify' | 'assessment' | 'reconcile',
  challengeId: string, level: number, signal?: AbortSignal, extra: { run_id?: string; question?: string; draft?: HintDraft } = {},
): Promise<AIResult> {
  const config = await api<AISettings>('ai/settings', token, undefined, undefined, signal);
  const args = { mode, challenge_id: challengeId, level, revision: config.revision, ...extra };
  if (mode === 'classify' || mode === 'reconcile') return api<AIResult>('ai/prepare', token, args, undefined, signal);
  const prepared = await api<Prepared>('ai/prepare', token, args, undefined, signal);
  return resolveAnalysis(token, prepared.ticket, signal);
}

export async function evaluateQueued(token: string, attemptId: string, signal?: AbortSignal): Promise<AIResult> {
  const prepared = await api<Prepared>('evaluation/prepare', token, { attempt_id: attemptId }, undefined, signal);
  try {
    return await resolveAnalysis(token, prepared.ticket, signal);
  } catch (cause) {
    try {
      await api('evaluation/release', token, { attempt_id: attemptId, run_id: prepared.run_id, message: (cause as Error).message });
    } catch { /* A completed assessment cannot be reset and leases expire on the server. */ }
    throw cause;
  }
}

export type AITestResult = { provider: AISettings['provider']; model: string; reasoning: string; transport: string; matched: boolean };
export async function testAI(token: string, revision: string, signal?: AbortSignal): Promise<AITestResult> {
  return api<AITestResult>('ai/test', token, { revision }, undefined, signal);
}
