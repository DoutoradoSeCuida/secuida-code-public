import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Race } from '../../src/components/Race';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Notice, ui } from '../../src/components/Page';
import { useEventSession } from '../../src/components/EventSession';
import { useCode } from '../../src/providers/CodeProvider';
import { projectionPanelHeight } from '../../src/lib/race-layout';
import { projectionEvents, projectionPosition } from '../../src/lib/projection';

type Mode = 'side' | 'rotate';
export default function Projection() {
  const session=useEventSession();const insets=useSafeAreaInsets();const {width}=useWindowDimensions();const {events,detail}=useCode();const params=useLocalSearchParams<{config?:string}>();
  const [areaHeight,setAreaHeight]=useState(0);
  const available=projectionEvents(events,events.map(e=>e.id));
  const [selected,setSelected]=useState<string[]>(()=>detail?.event.id?[detail.event.id]:[]);
  const [draft,setDraft]=useState<string[]>(selected);const [mode,setMode]=useState<Mode>('side');const [draftMode,setDraftMode]=useState<Mode>('side');
  const [seconds,setSeconds]=useState(15);const [draftSeconds,setDraftSeconds]=useState(15);const [config,setConfig]=useState(params.config==='1');const [position,setPosition]=useState(0);const [full,setFull]=useState(false);const [error,setError]=useState('');
  const shown=projectionEvents(events,selected);
  useEffect(()=>{if(!selected.length && detail?.event.data.teams_mode){setSelected([detail.event.id]);}},[detail?.event.id]);
  useEffect(()=>{setPosition(0);},[selected.join('|'),mode]);
  useEffect(()=>{if(mode!=='rotate'||shown.length<2||config)return;const timer=setInterval(()=>setPosition(p=>projectionPosition(p,shown.length)),seconds*1000);return()=>clearInterval(timer);},[mode,shown.length,seconds,config]);
  useEffect(()=>{if(Platform.OS!=='web' || typeof document==='undefined')return;const changed=()=>setFull(!!document.fullscreenElement);document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
  function openConfig(){setDraft(selected);setDraftMode(mode);setDraftSeconds(seconds);setError('');setConfig(true);}
  async function toggleFullscreen(){if(Platform.OS!=='web' || typeof document==='undefined')return;try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else throw new Error();setError('');}catch{setError('Não foi possível abrir em tela cheia. Você pode ampliar a janela do navegador e tentar novamente.');}}
  async function back(){if(!session.screenWanted&&Platform.OS==='web' && typeof document!=='undefined' && document.fullscreenElement){try{await document.exitFullscreen();}catch{}}router.back();}
  const visible=mode==='rotate' && shown.length?[shown[position%shown.length]]:shown;
  return <View style={{flex:1,backgroundColor:'#0a182e',paddingTop:insets.top+8,paddingBottom:insets.bottom+8}}>
    <View style={{paddingHorizontal:12,gap:10,paddingBottom:8}}><View style={[ui.row,{justifyContent:'space-between'}]}><Text style={{color:'#fff',fontSize:22,fontWeight:'800',flexGrow:1}}>Projeção da corrida</Text><PrimaryButton label="Configurar projeção" variant="secondary" onPress={openConfig}/>{Platform.OS==='web' && !session.screenWanted && <PrimaryButton label={full?'Sair da tela cheia':'Tela cheia'} variant="secondary" onPress={toggleFullscreen}/>}<PrimaryButton label="Voltar ao evento" variant="secondary" onPress={back}/></View>
      {error && <Notice text={error} error/>}
      {!shown.length && <Notice text="Escolha ao menos um evento publicado com equipes para projetar."/>}
      {mode==='rotate' && shown.length>1 && <Text style={{color:'#c5d8ec'}}>Evento {position%shown.length+1} de {shown.length} · alternando a cada {seconds} segundos</Text>}
      </View><View style={{flex:1,minHeight:0,paddingHorizontal:12}} onLayout={e=>setAreaHeight(e.nativeEvent.layout.height)}><ScrollView style={{flex:1,minHeight:0}} contentContainerStyle={{flexGrow:1}}><View style={{flexDirection:width>=900 && mode==='side'?'row':'column',flexWrap:'wrap',gap:12,alignItems:'stretch'}}>{visible.map(event=><View key={event.id} style={{width:width>=900 && mode==='side' && visible.length>1?'49%':'100%',minWidth:0}}><Race projection frameHeight={projectionPanelHeight(areaHeight,Math.ceil(visible.length/(width>=900&&mode==='side'?2:1)))} projectionEvent={event}/></View>)}</View>
    </ScrollView></View>
    <Modal visible={config} transparent animationType="fade" onRequestClose={()=>setConfig(false)}><View style={{flex:1,backgroundColor:'#091729bb',justifyContent:'center',padding:16}}><View accessibilityViewIsModal style={{backgroundColor:'#fff',borderRadius:16,padding:18,width:'100%',maxWidth:620,maxHeight:'90%',alignSelf:'center',gap:12}}>
      <Text accessibilityRole="header" style={ui.h2}>Configurar projeção</Text><Text style={ui.muted}>Escolha os eventos que você pode acompanhar. Cada corrida mantém sua própria pontuação.</Text>
      <ScrollView style={{flexShrink:1}} contentContainerStyle={{gap:4}}>{!available.length && <Text style={ui.muted}>Nenhum evento publicado com equipes disponível.</Text>}{available.map(e=><Pressable key={e.id} accessibilityRole="checkbox" accessibilityState={{checked:draft.includes(e.id)}} onPress={()=>setDraft(old=>old.includes(e.id)?old.filter(id=>id!==e.id):[...old,e.id])} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:8,borderBottomWidth:1,borderColor:'#e1e9e4'}}><Text style={{fontSize:21,color:'#2456c7'}}>{draft.includes(e.id)?'☑':'□'}</Text><Text style={[ui.text,{flex:1}]}>{e.data.title}</Text></Pressable>)}</ScrollView>
      <Text style={{fontWeight:'800',color:'#172b3a'}}>Como exibir</Text><View style={ui.row}>{([{id:'side',label:'Lado a lado'},{id:'rotate',label:'Alternar eventos'}] as const).map(x=><Pressable key={x.id} accessibilityRole="radio" accessibilityState={{checked:draftMode===x.id}} onPress={()=>setDraftMode(x.id)} style={{minHeight:44,justifyContent:'center',borderRadius:9,borderWidth:1,borderColor:draftMode===x.id?'#2456c7':'#bac8be',backgroundColor:draftMode===x.id?'#e8efff':'#fff',paddingHorizontal:12}}><Text style={{color:'#173a85',fontWeight:'700'}}>{x.label}</Text></Pressable>)}</View>
      {draftMode==='rotate' && <><Text style={{fontWeight:'800',color:'#172b3a'}}>Alternar a cada</Text><View style={ui.row}>{[5,10,15,30,60].map(n=><Pressable key={n} accessibilityRole="radio" accessibilityState={{checked:draftSeconds===n}} onPress={()=>setDraftSeconds(n)} style={{minHeight:44,justifyContent:'center',borderRadius:9,borderWidth:1,borderColor:draftSeconds===n?'#2456c7':'#bac8be',backgroundColor:draftSeconds===n?'#e8efff':'#fff',paddingHorizontal:12}}><Text style={{color:'#173a85',fontWeight:'700'}}>{n} s</Text></Pressable>)}</View></>}
      <PrimaryButton label="Aplicar configuração" disabled={!draft.length || !draft.some(id=>available.some(e=>e.id===id))} onPress={()=>{setSelected(draft);setMode(draftMode);setSeconds(draftSeconds);setConfig(false);}}/><PrimaryButton label="Cancelar" variant="secondary" onPress={()=>setConfig(false)}/>
    </View></View></Modal>
  </View>;
}
