import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useFeedback } from '../providers/FeedbackProvider';
import { useAuth } from '../providers/AuthProvider';
import { AITestResult, testAI } from '../lib/ai';
import { AISettings } from '../types/sdk';
import { PrimaryButton } from './PrimaryButton';
import { HelpHeading, Notice, ui } from './Page';
export function AITest({settings,enabled,busy,setBusy}:{settings:AISettings;enabled:boolean;busy:string;setBusy:(value:string)=>void}) {
  const {showFeedback}=useFeedback();const {token}=useAuth();const active=useRef<AbortController|null>(null);
  const [result,setResult]=useState<AITestResult|null>(null);const [message,setMessage]=useState('');const [error,setError]=useState('');const [seconds,setSeconds]=useState(0);
  useEffect(()=>{setResult(null);setMessage('');setError('');},[settings.revision,enabled]);
  useEffect(()=>()=>active.current?.abort(),[]);
  useEffect(()=>{if(busy!=='probe')return;const start=Date.now();const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-start)/1000)),1000);return()=>clearInterval(timer);},[busy]);
  async function test() {
    const controller=new AbortController();active.current=controller;setBusy('probe');setResult(null);setError('');setMessage('');setSeconds(0);const start=Date.now();
    try {const next=await testAI(token!,settings.revision!,controller.signal);if(!controller.signal.aborted){setResult(next);setSeconds((Date.now()-start)/1000);showFeedback({title:next.matched?'Chave aceita e modelo respondendo':'Modelo respondeu em formato inesperado',message:next.model,tone:next.matched?'success':'warning'});}}
    catch(e){if(!controller.signal.aborted){setError((e as Error).message);showFeedback({title:'Teste da IA não concluído',message:(e as Error).message,tone:'error',durationMs:10000});}}
    finally {if(active.current===controller){active.current=null;setBusy('');}}
  }
  return <View style={ui.column}><HelpHeading title="3. Testar chave e resposta" help="account#test" />
    <Text style={ui.muted}>Envia uma mensagem curta ao modelo salvo, com seu raciocínio e conexão atuais. Usa a cota da sua conta no provedor; nenhum desafio é enviado.</Text>
    {!enabled ? <Notice text="Salve as alterações de chave, provedor, conexão ou raciocínio antes de testar." /> : (!settings.has_key || !settings.model) && <Notice text="Salve sua chave e escolha um modelo para liberar o teste." />}
    <PrimaryButton label={busy==='probe'?`Esperando resposta · ${Math.floor(seconds)} s`:'Testar resposta do modelo'} disabled={!!busy || !enabled || !settings.has_key || !settings.model} loading={busy==='probe'} onPress={test} />
    {busy==='probe' && <><Notice text="Consultando o provedor. Alguns modelos levam mais tempo para raciocinar. Você pode cancelar a espera." /><PrimaryButton label="Cancelar teste" variant="secondary" onPress={()=>{active.current?.abort();setBusy('');setMessage('Espera cancelada. O provedor pode já ter contabilizado a consulta.');}} /></>}
    {error && <Notice text={`Teste não concluído. ${error}`} error />}{message && <Notice text={message} />}
    {result && <View accessibilityLiveRegion="polite" style={{gap:8,padding:16,borderRadius:12,backgroundColor:result.matched?'#e2f0e9':'#fff5df'}}><Text style={ui.h2}>{result.matched?'✓ Chave aceita e modelo respondendo':'O modelo respondeu em formato inesperado'}</Text><Text selectable style={ui.text}>{result.model}</Text><Text style={ui.muted}>{{nvidia:'NVIDIA',openai:'OpenAI',gemini:'Google Gemini'}[result.provider]} · {seconds.toFixed(1)} s · {result.transport==='direct'?'conexão direta':'conexão pelo site'} · raciocínio: {{default:'Padrão do modelo',none:'Sem raciocínio',minimal:'Mínimo',low:'Baixo',medium:'Médio',high:'Alto',xhigh:'Muito alto',max:'Máximo',off:'Desativado',on:'Ativado'}[result.reasoning] || result.reasoning}</Text><Text style={ui.muted}>{result.matched?'Resposta de teste recebida: CODE_OK. Isso confirma esta consulta, sem garantir futuras análises.':'A conexão respondeu, mas não retornou CODE_OK. Tente Padrão do modelo ou selecione outro modelo.'}</Text></View>}
  </View>;
}
