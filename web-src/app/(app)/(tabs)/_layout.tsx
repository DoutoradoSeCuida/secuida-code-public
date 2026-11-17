import { Tabs, router } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEventSession } from '../../../src/components/EventSession';
import { useAuth } from '../../../src/providers/AuthProvider';
import { useCode } from '../../../src/providers/CodeProvider';
import { useFeedback } from '../../../src/providers/FeedbackProvider';
import { canTrain } from '../../../src/lib/event-state';
export default function Layout() {
  const session=useEventSession();const { user } = useAuth(); const codeState=useCode();const {detail,loading,error}=codeState;const {showFeedback}=useFeedback();
  function leave(event:{preventDefault:()=>void},path:'/'|'/train'|'/ranking'|'/teacher'|'/admin',allowed=true){event.preventDefault();if(!allowed)return;if(path==='/train'||path==='/ranking')void session.enterScreen();void codeState.flushDraft().then(()=>router.navigate(path)).catch(e=>showFeedback({title:'Seu código ainda não foi salvo',message:e.message,tone:'error',durationMs:10000}));} const enabled=!!canTrain(detail,loading,error);
  const gate = {
    tabBarButton: (props: import('@react-navigation/bottom-tabs').BottomTabBarButtonProps) => <Pressable onPress={props.onPress} onLongPress={props.onLongPress} disabled={!enabled} accessibilityLabel={props['aria-label'] || props.accessibilityLabel} accessibilityRole="tab" aria-selected={props['aria-selected']} accessibilityState={{...props.accessibilityState,selected:props['aria-selected']===true,disabled:!enabled}} style={[props.style,{opacity:enabled?1:.4}]}>{props.children}</Pressable>,
  };
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#2456c7', tabBarStyle: { minHeight: 66, paddingBottom: 8, paddingTop: 5 } }}>
    <Tabs.Screen name="index" listeners={{tabPress:e=>leave(e,'/')}} options={{ title: 'Eventos', tabBarIcon: ({ color }) => <Ionicons name="calendar-outline" size={23} color={color} /> }} />
    <Tabs.Screen name="train" listeners={{tabPress:e=>{leave(e,'/train',enabled);}}} options={{ ...gate,title: 'Desafios', tabBarAccessibilityLabel:enabled?'Desafios':'Desafios indisponíveis: entre e selecione um evento publicado',tabBarIcon: ({ color }) => <Ionicons name="code-slash-outline" size={23} color={color} /> }} />
    <Tabs.Screen name="ranking" listeners={{tabPress:e=>{leave(e,'/ranking',enabled);}}} options={{ ...gate,title: 'Ranking',tabBarAccessibilityLabel:enabled?'Ranking':'Ranking indisponível: selecione um evento publicado', tabBarIcon: ({ color }) => <Ionicons name="trophy-outline" size={23} color={color} /> }} />
    <Tabs.Screen name="teacher" listeners={{tabPress:e=>leave(e,'/teacher')}} options={{ title: 'Professor', href: user?.can_teach ? undefined : null, tabBarIcon: ({ color }) => <Ionicons name="school-outline" size={23} color={color} /> }} />
    <Tabs.Screen name="admin" listeners={{tabPress:e=>leave(e,'/admin')}} options={{ title: 'Administrador', href: user?.can_manage_teachers ? undefined : null, tabBarIcon: ({ color }) => <Ionicons name="shield-checkmark-outline" size={23} color={color} /> }} />
  </Tabs>;
}
