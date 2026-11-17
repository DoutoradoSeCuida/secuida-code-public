import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { detectLanguage, languageFit } from '../lib/language-detect';
import { Language, languageNames } from '../types/sdk';
import { Choice } from './Choice';
import { HelpHeading, ui } from './Page';
import { PrimaryButton } from './PrimaryButton';
export function LanguageTools({ code, language, allowed, available, disabled, onChange, onExecutor,compact=false,connecting=false }: { code: string; language: Language; allowed: Language[]; available: Language[]; disabled: boolean; onChange: (value: Language) => void; onExecutor: () => void; compact?:boolean;connecting?:boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [sample, setSample] = useState(code);
  useEffect(() => { const timer = setTimeout(() => setSample(code), 400); return () => clearTimeout(timer); }, [code]);
  const detected = useMemo(() => detectLanguage(sample), [sample]); const fit = languageFit(detected, language, allowed);
  const checking = code !== sample;
  const message = checking ? 'Identificando a linguagem…' : !code.trim() ? 'Escreva ou cole seu código. Vamos tentar identificar a linguagem.' : !detected ? 'Ainda não foi possível identificar. Confira a seleção em Alterar linguagem.' : fit === 'unsupported' ? `Parece ${detected.name}. Esta linguagem ainda não é suportada. Use uma das linguagens deste desafio para testar e entregar.` : fit === 'not-allowed' ? `Parece ${detected.name}, mas esta linguagem não está permitida neste desafio. Veja as opções em Alterar linguagem.` : fit === 'different' ? `Parece ${detected.name}. Sua tentativa está configurada como ${languageNames[language]}. Confira o código ou use Alterar linguagem.` : `Parece ${detected.name} · aceita neste desafio.`;
  return <View style={{ gap: compact?3:10 }}><View style={{flexDirection:'row',alignItems:'center',gap:8}}><View style={{flex:1}}><HelpHeading title={compact?languageNames[language]:"Linguagem"} help="train#language" /></View><Pressable accessibilityRole="button" accessibilityLabel={expanded?'Fechar seleção de linguagem':'Alterar linguagem'} accessibilityState={{expanded}} onPress={()=>setExpanded(v=>!v)} style={{minHeight:44,justifyContent:'center',paddingHorizontal:10}}><Text style={{color:'#2456c7',fontSize:14,fontWeight:'700'}}>{expanded?'Fechar seleção':'Alterar linguagem'}</Text></Pressable></View>
    <View accessibilityLiveRegion="polite" style={{ borderLeftWidth: 3, borderLeftColor: ['unsupported','not-allowed','different'].includes(fit) ? '#9a650f' : '#17705f', paddingLeft: 12, gap: 8 }}>
      {(!compact || checking || fit!=='match') && <Text style={[ui.text,compact && {fontSize:12,lineHeight:17}]}>{message}</Text>}
      {!checking && detected?.language && allowed.includes(detected.language) && !available.includes(detected.language) && <Text style={ui.muted}>{connecting?'Conferindo as linguagens do executor…':`${detected.name} está permitida no desafio, mas não está disponível para execução neste dispositivo. Seu código está preservado.`}</Text>}
    </View>
    {expanded && <><Choice label="Disponíveis para executar agora" value={language} options={available.map(value => ({ value, label: languageNames[value] }))} disabled={disabled} onChange={onChange} />
    {!available.length && <Text style={ui.muted}>Nenhuma linguagem permitida neste desafio está disponível para execução neste dispositivo.</Text>}
    {connecting && <Text style={ui.muted}>Reconectando ao executor… As linguagens serão atualizadas ao confirmar a conexão.</Text>}
    {!connecting && allowed.some(value => !available.includes(value)) && <><Text style={ui.muted}>Outras linguagens permitidas neste desafio: {allowed.filter(value => !available.includes(value)).map(value => languageNames[value]).join(' · ')}. Para executá-las, prepare e conecte o executor no computador.</Text><PrimaryButton label="Preparar executor" variant="secondary" disabled={disabled} onPress={onExecutor} /></>}
    <Text style={ui.muted}>A identificação é uma sugestão. Ao mudar de linguagem, seu código será preservado.</Text></>}
  </View>;
}
