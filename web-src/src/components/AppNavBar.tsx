import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../providers/AuthProvider';
import { useCode } from '../providers/CodeProvider';
import { useFeedback } from '../providers/FeedbackProvider';
import { canTrain } from '../lib/event-state';

export function AppNavBar() {
  const {user}=useAuth();const state=useCode();const {showFeedback}=useFeedback();const insets=useSafeAreaInsets();
  const enabled=!!canTrain(state.detail,state.loading,state.error);
  const items: {title:string;icon:ComponentProps<typeof Ionicons>['name'];path:'/'|'/train'|'/ranking'|'/teacher'|'/admin';disabled?:boolean}[]=[{title:'Eventos',icon:'calendar-outline',path:'/'},{title:'Desafios',icon:'code-slash-outline',path:'/train',disabled:!enabled},{title:'Ranking',icon:'trophy-outline',path:'/ranking',disabled:!enabled},...(user?.can_teach?[{title:'Professor',icon:'school-outline',path:'/teacher'} as const]:[]),...(user?.can_manage_teachers?[{title:'Administrador',icon:'shield-checkmark-outline',path:'/admin'} as const]:[])];
  async function go(path:'/'|'/train'|'/ranking'|'/teacher'|'/admin') {try{await state.flushDraft();router.dismissTo(path);}catch(e){showFeedback({title:'Seu código ainda não foi salvo',message:(e as Error).message,tone:'error',durationMs:10000});}}
  return <View accessibilityLabel="Navegação principal" style={{flexDirection:'row',borderTopWidth:1,borderTopColor:'#e3e8ed',backgroundColor:'#fff',paddingTop:5,paddingBottom:Math.max(8,insets.bottom),minHeight:66}}>{items.map(item=><Pressable key={item.path} accessibilityRole="tab" accessibilityLabel={item.disabled?`${item.title} indisponível: selecione um evento publicado`:item.title} accessibilityState={{selected:item.path==='/teacher',disabled:!!item.disabled}} disabled={item.disabled} onPress={()=>void go(item.path)} style={{flex:1,minHeight:48,alignItems:'center',justifyContent:'center',opacity:item.disabled?.4:1}}><Ionicons name={item.icon} size={23} color={item.path==='/teacher'?'#2456c7':'#6e777e'}/><Text numberOfLines={1} style={{fontSize:10,color:item.path==='/teacher'?'#2456c7':'#6e777e'}}>{item.title}</Text></Pressable>)}</View>;
}
