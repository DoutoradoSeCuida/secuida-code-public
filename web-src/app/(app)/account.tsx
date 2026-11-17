import { useState, useRef, useSyncExternalStore } from 'react';
import { Platform, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { site } from '../../src/lib/site';
import { useCode } from '../../src/providers/CodeProvider';
import { useAuth } from '../../src/providers/AuthProvider';
import { useFeedback } from '../../src/providers/FeedbackProvider';
import { api } from '../../src/lib/api';
import { exportData } from '../../src/lib/export';
import { connectExecutor, disconnectExecutor, executorConnection, reconnectExecutor, subscribeExecutor } from '../../src/lib/execution';
import { AISettings, languageNames, Language } from '../../src/types/sdk';
import { Page, Notice, Busy, ui, HelpHeading } from '../../src/components/Page';
import { Card } from '../../src/components/Card';
import { TextField } from '../../src/components/TextField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Choice } from '../../src/components/Choice';
import { KeyGuide } from '../../src/components/KeyGuide';
import { SectionTabs } from '../../src/components/SectionTabs';
import { ModelSettings } from '../../src/components/ModelSettings';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
export default function Account() {
  const codeState=useCode();
  const params=useLocalSearchParams<{section?:string}>(); const [section,setSection]=useState<'ai'|'executor'|'data'>(params.section==='executor'?'executor':params.section==='data'?'data':'ai');const {width}=useWindowDimensions();const [advanced,setAdvanced]=useState(false);const [deleteOpen,setDeleteOpen]=useState(false);
  const { token, user, logout, restore } = useAuth(); const { showFeedback } = useFeedback();
  const [settings, setSettings] = useState<AISettings>({ provider: 'nvidia', model: '', transport: 'server', has_key: false });
  const [savedProvider,setSavedProvider]=useState<AISettings['provider']>('nvidia');
  const [editingKey,setEditingKey]=useState(false);
  const [key, setKey] = useState(''); const [catalogEpoch, setCatalogEpoch] = useState(0); const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [loaded, setLoaded] = useState(false);const [loadingConfig,setLoadingConfig]=useState(true);const modelPending=useRef(false);const onModelPending=useCallback((value:boolean)=>{modelPending.current=value;},[]);
  const [connectionKey, setConnectionKey] = useState(''); const executor=useSyncExternalStore(subscribeExecutor,executorConnection,executorConnection);const [changeExecutor,setChangeExecutor]=useState(false); const [health, setHealth] = useState('');
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const load = useCallback(async () => { setError(''); setLoaded(false);setLoadingConfig(true); try { const data=await api<AISettings>('ai/settings', token); setSettings(data);setSavedProvider(data.provider);setCatalogEpoch(v => v + 1);setKey('');setEditingKey(false); setLoaded(true); } catch (e) { setError((e as Error).message); } finally {setLoadingConfig(false);} }, [token]);
  const unsaved=useRef(false);unsaved.current=!!key || settings.provider!==savedProvider;
  useFocusEffect(useCallback(() => { if(!unsaved.current && !modelPending.current)void load(); }, [load]));
  async function action(id: string, fn: () => Promise<void>) { setBusy(id); setError(''); try { await fn(); } catch (e) { setError((e as Error).message);showFeedback({title:'Não foi possível concluir',message:(e as Error).message,tone:'error'}); } finally { setBusy(''); } }
  async function save(remove = false) { const next = await api<AISettings>('ai/settings', token, { ...settings, key, remove_key: remove }); setSettings(next);setSavedProvider(next.provider);setCatalogEpoch(v => v + 1); setKey('');setEditingKey(false); showFeedback({ title: remove ? 'Chave removida' : 'Preferências salvas', tone: 'success' }); }
  return <Page title="IA e conta" back={()=>router.canGoBack()?router.back():router.replace('/')} focusKey={section} subtitle={user?.name} help="account#ai">
    <SectionTabs value={section} disabled={!!busy} onChange={v=>{setSection(v);setError('');}} options={[{value:'ai',label:'IA'},{value:'executor',label:'Executor'},{value:'data',label:'Meus dados'}]} />
    {error && <Notice text={error} error />}
    {section==='ai' && !loaded && <Card>{loadingConfig?<Busy text="Carregando sua configuração de IA…" />:<PrimaryButton label="Tentar carregar configuração novamente" onPress={()=>void load()} />}</Card>}
    {section==='ai' && loaded && <><Notice text="1. Salve sua chave → 2. Escolha o modelo → 3. Teste a resposta. Sua configuração será usada nas dicas e, se você for professor, ao processar avaliações." /><View style={{gap:18,flexDirection:width>=1000?'row':'column',alignItems:'flex-start'}}><View style={{flex:1,width:width>=1000?undefined:'100%'}}><Card><HelpHeading title="1. Chave do provedor" help="account#ai" /><Text style={ui.text}>Cada provedor guarda sua própria chave e preferências. O consumo pertence à sua conta.</Text>
      <Choice label="Provedor" disabled={!loaded || !!busy} value={settings.provider} options={[{ value: 'nvidia', label: 'NVIDIA' },{ value: 'openai', label: 'OpenAI' },{ value: 'gemini', label: 'Google Gemini' }]} onChange={provider => { setSettings(v => ({ ...v, provider, model: v.providers?.[provider]?.model || '', reasoning: v.providers?.[provider]?.reasoning || 'default', model_info: v.providers?.[provider]?.model_info, has_key: v.providers?.[provider]?.has_key || false, transport:'server' }));setKey('');setEditingKey(false); setCatalogEpoch(v => v + 1); }} />
      <KeyGuide key={settings.provider} provider={settings.provider} disabled={!!busy || !loaded} />
      {settings.provider!==savedProvider && <Notice text="Salve a chave e as preferências deste provedor antes de consultar seus modelos. As configurações dos outros provedores serão preservadas." />}
      <Text style={ui.badge}>{settings.has_key?'Chave cadastrada · teste a resposta para conferir':'Nenhuma chave cadastrada neste provedor'}</Text>
      {settings.has_key && !editingKey ? <PrimaryButton label="Trocar chave deste provedor" variant="secondary" disabled={!!busy} onPress={()=>{setKey('');setEditingKey(true);}} /> : <>
        <TextField editable={loaded && !busy} label={settings.has_key ? 'Nova chave · deixe em branco para manter a atual' : 'Chave da sua conta no provedor'} helperText={settings.provider === 'gemini' ? 'Cole a chave da Gemini API criada no Google AI Studio.' : 'Cole somente a API key do provedor escolhido.'} value={key} onChangeText={setKey} secureTextEntry autoComplete="off" textContentType="none" autoCapitalize="none" autoCorrect={false} />
        {settings.has_key && <PrimaryButton label="Manter chave atual" variant="secondary" disabled={!!busy} onPress={()=>{setKey('');setEditingKey(false);}} />}
      </>}
      <Text style={ui.muted}>O site envia as consultas ao provedor escolhido e guarda a chave de forma criptografada.</Text>
      {settings.has_key && <PrimaryButton label={advanced?'Ocultar opção de remover':'Opção para remover a chave'} variant="secondary" disabled={!!busy} onPress={()=>setAdvanced(v=>!v)} />}
      <PrimaryButton label={settings.has_key && !editingKey?'Salvar preferências':'Salvar chave e preferências'} loading={busy === 'settings'} disabled={!!busy || !loaded} onPress={() => action('settings', () => save())} />
      {advanced && settings.has_key && <PrimaryButton label="Remover chave deste provedor" variant="secondary" disabled={!!busy} loading={busy === 'remove'} onPress={() => action('remove', () => save(true))} />}
    </Card>
    </View><View style={{flex:1,width:width>=1000?undefined:'100%'}}><ModelSettings onPendingChange={onModelPending} settings={settings} onSaved={setSettings} busy={busy} setBusy={setBusy} catalogEpoch={catalogEpoch} enabled={loaded && !key && settings.provider === savedProvider} /></View></View></>}
    {section==='executor' && <Card><HelpHeading title="Executar no meu computador" help="account#executor" /><View accessibilityLiveRegion="polite">{executor.status==='connecting'?<Busy text={executor.message}/>:<Notice text={executor.message} error={executor.status==='unavailable'}/>}</View>
      {Platform.OS==='web' && <>
        {executor.saved && executor.status==='unavailable' && <PrimaryButton label="Tentar reconectar" disabled={!!busy} loading={busy==='reconnect'} onPress={()=>action('reconnect',async()=>{await reconnectExecutor();setChangeExecutor(false);})}/>}
        {executor.status==='connected' && <PrimaryButton label={changeExecutor?'Manter conexão atual':'Trocar código do executor'} variant="secondary" disabled={!!busy} onPress={()=>{setChangeExecutor(v=>!v);setConnectionKey('');}}/>}
        {(executor.status==='connected'||executor.saved) && <PrimaryButton label="Desconectar e esquecer chave" variant="secondary" disabled={!!busy} onPress={()=>{disconnectExecutor();setChangeExecutor(false);setConnectionKey('');}}/>}
        {executor.status!=='connecting' && (executor.status!=='connected'||changeExecutor) && <><TextField label="Código de conexão mostrado pelo executor" helperText="Copie o código completo: ele já inclui a conexão correta. Guardamos neste navegador para reconectar ao atualizar o Code. Se reiniciar o executor, cole o novo código. Este não é o token da IA." autoCorrect={false} value={connectionKey} onChangeText={setConnectionKey} secureTextEntry autoCapitalize="none" autoComplete="off" textContentType="none"/><PrimaryButton label="Conectar executor" loading={busy==='connect'} disabled={!!busy||!connectionKey.trim()} onPress={()=>action('connect',async()=>{await connectExecutor(connectionKey);setConnectionKey('');setChangeExecutor(false);})}/></>}
      </>}
      <Text style={ui.text}>Baixe o executor, extraia o ZIP e siga o guia incluído. Você precisa de Python 3.11 ou mais recente e das ferramentas da linguagem que quiser usar. Python e JavaScript também rodam no navegador.</Text>
      <Notice text="A execução local não é isolada: o código pode acessar arquivos e a rede com suas permissões. Execute apenas código em que confia." />
      <PrimaryButton label="Baixar executor e guia" variant="secondary" disabled={!!busy} onPress={() => action('download', async () => { await Linking.openURL(site().executorUrl); })} />
      {Platform.OS !== 'web' && <Notice text="Conecte o executor usando a app no navegador do computador." />}
    </Card>}
    {section==='data' && <>    <Card><Text style={ui.h2}>{user?.name}</Text><Text style={ui.text}>Usuário: {user?.username}</Text><Text style={ui.badge}>{user?.can_teach ? 'Professor e aluno' : 'Aluno'}</Text><PrimaryButton label="Verificar conexão com o site" variant="secondary" loading={busy === 'health'} disabled={!!busy} onPress={() => action('health', async () => { const h = await api<{ ok: boolean; crypto: boolean }>('health', token); setHealth(h.ok && h.crypto ? 'Conexão e proteção de chaves disponíveis.' : 'A hospedagem precisa de suporte a criptografia.'); })} />{health && <Notice text={health} />}</Card>
    <Card><HelpHeading title="Seus dados" help="account#privacy" /><PrimaryButton label="Exportar meus dados" variant="secondary" loading={busy === 'export'} disabled={!!busy} onPress={() => action('export', async () => { await exportData(await api('account/export', token)); showFeedback({ title: 'Exportação preparada', message: 'Guarde o arquivo JSON com seus dados.', tone: 'success' }); })} /><PrimaryButton label="Sair da conta" variant="secondary" loading={busy === 'logout'} disabled={!!busy} onPress={() => action('logout', async () => { await codeState.flushDraft(); await logout(); })} /></Card>
    <PrimaryButton label={deleteOpen?'Ocultar exclusão de dados':'Opções para apagar meus dados'} variant="secondary" disabled={!!busy} onPress={()=>setDeleteOpen(v=>!v)} />
    {deleteOpen && <Card><HelpHeading title="Apagar meus dados do Code" help="account#privacy" /><Text style={ui.text}>Remove suas tentativas, inscrições e chaves dos provedores deste plugin. Se você criou eventos, exclua-os primeiro. Sua conta WordPress continua disponível. Para excluir a conta deste site, fale com seu responsável.</Text><TextField label="Digite sua senha para confirmar" helperText="Use a senha da sua conta WordPress para confirmar." value={password} onChangeText={setPassword} secureTextEntry /><TextField label="Digite APAGAR" helperText="Escreva APAGAR em letras maiúsculas para confirmar a exclusão definitiva dos seus dados do Code." autoCorrect={false} value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" /><PrimaryButton label="Apagar definitivamente meus dados do Code" variant="danger" loading={busy === 'delete'} disabled={!!busy || confirmation !== 'APAGAR' || !password} onPress={() => action('delete', async () => { await api('account/delete', token, { password, confirmation }); disconnectExecutor(); await restore(); router.replace('/'); })} /></Card>}</>}
  </Page>;
}
