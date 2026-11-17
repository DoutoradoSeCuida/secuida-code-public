import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../lib/api';
import { AIModel, AISettings, Reasoning } from '../types/sdk';
import { useAuth } from '../providers/AuthProvider';
import { useFeedback } from '../providers/FeedbackProvider';
import { AITest } from './AITest';
import { Card } from './Card';
import { Choice } from './Choice';
import { HelpHeading, Notice, ui } from './Page';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';

const labels: Record<Reasoning,string> = { default:'Padrão do modelo',none:'Sem raciocínio',minimal:'Mínimo',low:'Baixo',medium:'Médio',high:'Alto',xhigh:'Muito alto',max:'Máximo',off:'Desativado',on:'Ativado' };
export function ModelSettings({ settings, onSaved, busy, setBusy, catalogEpoch, enabled, onPendingChange }: {
  settings: AISettings; onSaved: (v: AISettings) => void; busy: string; setBusy: (v: string) => void; catalogEpoch: number; enabled: boolean; onPendingChange?:(value:boolean)=>void;
}) {
  const { token } = useAuth(); const { showFeedback } = useFeedback();
  const [catalogOpen,setCatalogOpen]=useState(false);
  const [models,setModels] = useState<AIModel[]>([]); const [queried,setQueried] = useState(false);
  const [filter,setFilter] = useState(''); const [scope,setScope] = useState<'all'|'controlled'>('all'); const [page,setPage] = useState(0);
  const [error,setError] = useState(''); const [reasoning,setReasoning] = useState<Reasoning>(settings.reasoning || 'default');
  const active = useRef<AbortController | null>(null);
  useEffect(() => { setModels([]);setQueried(false);setCatalogOpen(false);setFilter('');setPage(0);setError('');setScope('all'); },[catalogEpoch]);
  useEffect(() => { setReasoning(settings.reasoning || 'default'); },[settings.provider,settings.model,settings.reasoning]);
  useEffect(() => () => { active.current?.abort(); },[]);
  useEffect(()=>{onPendingChange?.(reasoning!==(settings.reasoning || 'default'));},[reasoning,settings.reasoning,onPendingChange]);
  useEffect(()=>()=>onPendingChange?.(false),[onPendingChange]);
  const info=settings.model_info;
  const filtered=models.filter(m => m.id.toLowerCase().includes(filter.toLowerCase()) && (scope==='all' || m.reasoning.kind!=='default'));
  const lastPage=Math.max(0,Math.ceil(filtered.length/10)-1); const currentPage=Math.min(page,lastPage);
  async function perform(id: string, fn: (signal: AbortSignal) => Promise<void>) {
    const controller=new AbortController(); active.current=controller;setBusy(id);setError('');
    try { await fn(controller.signal); }
    catch(e) { if(!controller.signal.aborted) { const message=(e as Error).message;setError(message);showFeedback({title:'Confira a configuração de IA',message,tone:'error'}); } }
    finally { if(!controller.signal.aborted) setBusy(''); }
  }
  return <Card>
    <HelpHeading title="2. Modelo e raciocínio" help="account#models" />
    <Text style={ui.text}>Modelo atual: {settings.model || 'nenhum selecionado'}</Text>

    {!enabled && <Notice text="Salve a chave e as preferências acima antes de consultar modelos ou alterar o raciocínio." />}
    {enabled && !settings.has_key && <Notice text="Cadastre e salve sua chave acima para consultar o catálogo." />}
    {error && <Notice text={error} error />}
    <PrimaryButton label={settings.model ? 'Trocar modelo: consultar catálogo' : 'Consultar modelos disponíveis'} variant="secondary" loading={busy==='models'} disabled={!!busy || !enabled || !settings.has_key} onPress={() => perform('models',async signal => {
      const result=await api<{details:AIModel[];provider:AISettings['provider'];revision:string}>('ai/models',token,undefined,undefined,signal);
      if(result.provider!==settings.provider || result.revision!==settings.revision) throw new Error('A configuração mudou. Reabra a Conta e consulte novamente.');
      if(!Array.isArray(result.details)) throw new Error('Atualize o plugin Code SDK para gerenciar modelos e raciocínio.');
      if(signal.aborted)return;setModels(result.details);setQueried(true);setCatalogOpen(true);setPage(0);
      showFeedback({title:`${result.details.length} modelos encontrados`,message:'Escolha um modelo para suas análises.'});
    })} />
    {queried && catalogOpen && <><PrimaryButton label="Fechar catálogo de modelos" variant="secondary" disabled={!!busy} onPress={()=>setCatalogOpen(false)} />
      {!!settings.model && !models.some(m=>m.id===settings.model) && <Notice text="O modelo salvo não apareceu neste catálogo. Escolha outro antes de continuar as análises." error />}
      <TextField label="Buscar modelo no catálogo" value={filter} onChangeText={v=>{setFilter(v);setPage(0);}} autoCapitalize="none" autoCorrect={false} />
      <Choice label="Mostrar modelos" helperText="O filtro de raciocínio mostra apenas modelos com ajuste conhecido pela app; os demais podem raciocinar usando o padrão do provedor." value={scope} options={[{value:'all',label:'Todos'},{value:'controlled',label:'Com controle de raciocínio'}]} onChange={v=>{setScope(v);setPage(0);}} disabled={!!busy} />
      <Text style={ui.muted}>{filtered.length} resultados · página {currentPage+1} de {lastPage+1}</Text>
      {!filtered.length && <Notice text="Nenhum modelo corresponde à busca. Altere o nome ou mostre todos." />}
      {filtered.slice(currentPage*10,currentPage*10+10).map(model=><View key={model.id} style={{gap:4}}>
        <PrimaryButton label={model.id===settings.model ? `✓ ${model.id}` : model.id} variant="secondary" loading={busy===`model:${model.id}`} disabled={!!busy || !enabled || !model.selectable || model.id===settings.model} onPress={()=>perform(`model:${model.id}`,async signal=>{
          // Omit reasoning: the SDK restores this model's own preference, never the previous model's effort.
          const next=await api<AISettings>('ai/settings',token,{provider:settings.provider,model:model.id,transport:settings.transport},undefined,signal);
          if(signal.aborted)return;onSaved(next);setCatalogOpen(false);showFeedback({title:'Modelo selecionado',message:`${model.id} · ${labels[next.reasoning || 'default']}`,tone:'success'});
        })} />
        <Text style={ui.muted}>{!model.selectable ? model.reasoning.note : model.reasoning.kind==='default' ? 'Raciocínio: padrão do provedor' : model.reasoning.kind==='toggle' ? 'Raciocínio: ativar ou desativar' : 'Raciocínio: intensidade ajustável'}</Text>
      </View>)}
      {lastPage>0 && <View style={ui.row}><PrimaryButton label="Página anterior" variant="secondary" disabled={!!busy || currentPage===0} onPress={()=>setPage(currentPage-1)} /><PrimaryButton label="Próxima página" variant="secondary" disabled={!!busy || currentPage===lastPage} onPress={()=>setPage(currentPage+1)} /></View>}
    </>}
    {!!settings.model && <>
      {info ? <><Choice label="Raciocínio" value={reasoning} options={info.reasoning.options.map(value=>({value,label:labels[value]}))} onChange={setReasoning} disabled={!!busy || !enabled || !settings.has_key || info.reasoning.kind==='default'} /><Text style={ui.muted}>{info.reasoning.kind==='default'?'Este modelo usa o padrão do provedor.':'Mais raciocínio pode aumentar a espera e o consumo.'}</Text></> : <Notice text="Atualize o plugin Code SDK para consultar os controles deste modelo." />}
      {reasoning!==(settings.reasoning || 'default') && <Notice text="Alteração ainda não salva. As análises continuam usando a preferência anterior." />}
      {reasoning!==(settings.reasoning || 'default') && <PrimaryButton label="Salvar raciocínio" loading={busy==='reasoning'} disabled={!!busy || !enabled || !settings.has_key || !info || reasoning===(settings.reasoning || 'default')} onPress={()=>perform('reasoning',async signal=>{
        const next=await api<AISettings>('ai/settings',token,{provider:settings.provider,model:settings.model,transport:settings.transport,reasoning},undefined,signal);
        if(signal.aborted)return;onSaved(next);showFeedback({title:'Raciocínio salvo',message:labels[next.reasoning || 'default'],tone:'success'});
      })} />}
    </>}

    <AITest settings={settings} enabled={enabled && reasoning===(settings.reasoning || 'default')} busy={busy} setBusy={setBusy} />
  </Card>;
}
