import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { keyGuides } from '../lib/key-guides';
import type { AISettings } from '../types/sdk';
import { PrimaryButton } from './PrimaryButton';
import { HelpHeading, Notice, ui } from './Page';
export function KeyGuide({provider,disabled}:{provider:AISettings['provider'];disabled:boolean}) {
  const [expanded,setExpanded]=useState(false);
  const guide=keyGuides[provider];const [busy,setBusy]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('');
  async function open(kind:'signup'|'keys') {
    setBusy(kind);setError('');setMessage('');
    try {await WebBrowser.openBrowserAsync(guide[kind],{windowName:'_blank'});setMessage('Depois de copiar a chave no site oficial, volte a esta tela para continuar. Se o site não abrir, permita a nova janela e tente novamente.');}
    catch {setError('Não foi possível abrir o site oficial. Confira sua conexão e tente novamente.');}
    finally {setBusy('');}
  }
  function link(kind:'signup'|'keys',label:string) {
    return <Link href={guide[kind] as `https://${string}`} target="_blank" rel="noopener noreferrer" accessibilityState={{disabled:disabled || !!busy}} onPress={event=>{
      if(disabled || busy){event.preventDefault();return;}
      if(Platform.OS!=='web'){event.preventDefault();void open(kind);}
      else setMessage('Depois de copiar a chave no site oficial, volte a esta tela para continuar.');
    }} style={{padding:16,minHeight:52,borderRadius:12,borderWidth:1,borderColor:'#aab9ad',backgroundColor:'#fff',color:'#172b3a',textAlign:'center',fontSize:15,fontWeight:'800',opacity:disabled || busy?.length ? .55 : 1}}>{busy===kind?'Abrindo site oficial…':label}</Link>;
  }
  return <View style={ui.column}>
    <PrimaryButton label={expanded?'Ocultar tutorial da chave':`Não tenho chave: como obter na ${guide.name}?`} variant="secondary" disabled={disabled} onPress={()=>setExpanded(v=>!v)} />
    {expanded && <><HelpHeading title={`Como obter sua chave · ${guide.name}`} help="account#keys" />
    <Text style={ui.muted}>A chave de acesso também pode aparecer como API key ou token no site do provedor.</Text>
    {guide.steps.map((step,i)=><Text key={i} selectable style={ui.text}>{i+1}. {step}</Text>)}
    {link('signup',`Cadastrar ou entrar · ${guide.name}`)}
    {link('keys',`Abrir página de chaves · ${guide.name}`)}
    <Text style={ui.muted}>Os botões abrem o site oficial em outra página. {guide.note}</Text>
    {error && <Notice text={error} error />}{message && <Notice text={message} />}
    <Notice text="Com a chave copiada, cole no campo abaixo e toque em Salvar chave e preferências. Depois, consulte os modelos disponíveis e escolha um para suas análises." />
    </>}
  </View>;
}
