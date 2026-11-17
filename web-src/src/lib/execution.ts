import { storageKey as scopedKey } from './site';
import { Language, RunResult, TestCase } from '../types/sdk';
export type Capability = { language: Language; version: string };
export type ExecutorConnection = { status: 'disconnected'|'connecting'|'connected'|'unavailable'; saved: boolean; message: string };
export const browserLanguages: Language[] = ['python','javascript'];
let secret = ''; let capabilities: Capability[] = []; let activeController: AbortController | null = null; let stopBrowser: (() => void) | null = null;
let nextHealthRetry = 0;
let account: number | null = null; let generation = 0; let saved = false; let flight: Promise<Capability[]> | null = null;
let connection: ExecutorConnection = { status: 'disconnected', saved: false, message: 'Executor ainda não conectado.' };
const listeners = new Set<() => void>();
export function executorConnection(): ExecutorConnection { return connection; }
export function subscribeExecutor(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(status: ExecutorConnection['status'], message: string) { connection = { status, saved, message }; listeners.forEach(listener => listener()); }
function storageKey() { return account === null ? null : `${scopedKey("executor")}.${account}`; }
function readKey(): string { try { const key = storageKey(); return key ? globalThis.localStorage?.getItem(key) || '' : ''; } catch { return ''; } }
function rememberKey(value: string): boolean { try { const key = storageKey(); if (!key || !globalThis.localStorage) return false; globalThis.localStorage.setItem(key, value); return true; } catch { return false; } }
function forgetKey() { try { const key = storageKey(); if (key) globalThis.localStorage?.removeItem(key); } catch { /* Storage can be blocked by the browser. */ } }
async function local(path: string, body?: unknown, credential = secret) {
  let port = 8766, token = credential;
  if (credential.startsWith('sccode1:')) {
    const parts = /^sccode1:([1-9][0-9]{0,4}):([A-Za-z0-9_-]{32,128})$/.exec(credential);
    if (!parts || Number(parts[1]) > 65535) throw new Error('Código do executor inválido. Copie o código completo mostrado pelo programa.');
    port = Number(parts[1]); token = parts[2];
  } else if (!/^[A-Za-z0-9_-]{1,256}$/.test(credential)) {
    throw new Error('Código do executor inválido. Copie o código completo mostrado pelo programa.');
  }
  const controller = new AbortController(); if (path !== 'health') activeController = controller; const timer = setTimeout(() => controller.abort(), path === 'health' ? 5000 : 25000);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, credentials: 'omit', cache: 'no-store' });
    const data = await r.json(); if (!r.ok) throw new Error(data.message || 'O executor não concluiu a operação.'); return data;
  } catch (e) { throw new Error(controller.signal.aborted ? 'Execução interrompida ou tempo excedido.' : e instanceof TypeError ? 'Não foi possível conectar ao executor. Abra o programa, confira a chave e permita a conexão local no navegador.' : (e as Error).message); }
  finally { clearTimeout(timer); if (activeController === controller) activeController = null; }
}
function checkExecutor(value: string, remember = false, quiet = false): Promise<Capability[]> {
  const ticket = ++generation;
  if (!quiet) { secret = ''; capabilities = []; publish('connecting', saved ? 'Reconectando ao executor…' : 'Conectando ao executor…'); }
  const request = (async () => {
    try {
      const r = await local('health', undefined, value);
      if (ticket !== generation) throw new Error('A conexão foi cancelada ou substituída.');
      if (r.product !== 'secuida-code' || r.protocol !== 1 || !Array.isArray(r.languages) || !r.languages.every((c: Capability) => ['python','c','cpp','java','javascript'].includes(c.language) && typeof c.version === 'string')) throw new Error('Atualize o executor para esta versão da app.');
      secret = value; capabilities = r.languages; nextHealthRetry = 0;
      if (remember) saved = rememberKey(value);
      publish('connected', capabilities.length ? `Executor conectado.${saved ? ' Reconexão automática ativada neste navegador.' : ' O navegador não permitiu guardar a chave; ela será pedida após atualizar a página.'}` : 'Executor conectado, mas nenhuma ferramenta disponível. Confira as instruções do download.');
      return executorLanguages();
    } catch (e) {
      if (ticket === generation) { nextHealthRetry = Date.now()+30000; secret = ''; capabilities = []; publish('unavailable', `${(e as Error).message} Abra o executor e tente reconectar. Se ele foi reiniciado, informe a nova chave.`); }
      throw e;
    }
  })();
  flight = request;
  void request.finally(() => { if (flight === request) flight = null; }).catch(() => {});
  return request;
}
export async function connectExecutor(value: string): Promise<Capability[]> {
  if (account === null) throw new Error('Entre na sua conta antes de conectar o executor.');
  if (!value.trim()) throw new Error('Informe a chave exibida pelo executor.');
  return checkExecutor(value.trim(), true);
}
export async function restoreExecutor(userId: number | null): Promise<Capability[]> {
  if (account === userId) return flight?.catch(() => []) || executorLanguages();
  generation++; stopExecution(); secret = ''; capabilities = []; flight = null; account = userId;
  const value = readKey(); saved = !!value;
  publish('disconnected', 'Executor ainda não conectado.');
  return value ? checkExecutor(value).catch(() => []) : [];
}
export async function reconnectExecutor(): Promise<Capability[]> {
  if (flight) return flight;
  const value = readKey();
  if (!value) throw new Error('Informe a chave exibida pelo executor.');
  return checkExecutor(value);
}
export function executorLanguages(): Capability[] { return capabilities.map(c => ({ ...c })); }
export async function refreshExecutorCapabilities(): Promise<Capability[]> {
  if (flight) return flight.catch(() => []);
  const value = secret || (saved && Date.now()>=nextHealthRetry ? readKey() : '');
  if (!value) return [];
  return checkExecutor(value, false, true).catch(() => []);
}
export function disconnectExecutor() { generation++; stopExecution(); forgetKey(); saved = false; secret = ''; capabilities = []; flight = null; publish('disconnected', 'Executor desconectado. A chave foi removida deste navegador.'); }
export function stopExecution() { activeController?.abort(); stopBrowser?.(); }
function browserRun(language: Language, code: string, input: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe'); iframe.sandbox.add('allow-scripts'); iframe.style.display = 'none';
    const url = new URL('./run-sandbox.html', document.baseURI); url.hash = crypto.randomUUID(); iframe.src = url.href;
    const id = url.hash.slice(1); let done = false; let ready = false;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => { window.removeEventListener('message', onMessage); clearTimeout(timer); iframe.remove(); stopBrowser = null; };
    const finish = (result?: RunResult, error?: Error) => { if (done) return; done = true; cleanup(); error ? reject(error) : resolve(result!); };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow || event.data?.id !== id) return;
      if (event.data.type === 'ready' && !ready) { ready = true; clearTimeout(timer); timer=setTimeout(()=>finish(undefined,new Error('O ambiente demorou para executar. Seu código está preservado.')),language==='python'?60000:10000); iframe.contentWindow?.postMessage({ id, language, code, input }, '*'); }
      if (event.data.type === 'result') finish({ ...event.data.result, engine: `browser-${language}` });
    };
    timer = setTimeout(() => finish(undefined, new Error('O ambiente demorou para carregar. Tente novamente ou conecte o executor local.')), 30000);
    stopBrowser = () => finish(undefined, new Error('Execução interrompida. Seu código foi preservado.'));
    window.addEventListener('message', onMessage); document.body.appendChild(iframe);
  });
}
export async function runTests(language: Language, code: string, tests: TestCase[], signal?: AbortSignal): Promise<RunResult[]> {
  if (!tests.length) throw new Error('Este desafio não tem testes públicos. Peça uma revisão ou entregue sua tentativa ao professor.');
  if (!secret && saved && !browserLanguages.includes(language)) await reconnectExecutor();
  const useLocal = !!secret && capabilities.some(c => c.language === language);
  if (!useLocal && !browserLanguages.includes(language)) throw new Error('Esta linguagem precisa do executor local. Conecte-o na área Conta.');
  const results: RunResult[] = [];
  for (const test of tests) {
    if(signal?.aborted) throw new Error('Execução interrompida. Sua entrega foi preservada.');
    const r: RunResult = useLocal ? await local('run', { language, code, input: test.input }) : await browserRun(language, code, test.input);
    results.push({ ...r, passed: !r.error && r.exit_code === 0 && r.output === test.output });
  }
  return results;
}

export function isExecutorConnected(): boolean { return !!secret; }
