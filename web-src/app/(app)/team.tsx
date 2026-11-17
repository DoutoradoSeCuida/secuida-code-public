import {useCallback} from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '../../src/providers/AuthProvider';
import { useCode } from '../../src/providers/CodeProvider';
import { useEventSession } from '../../src/components/EventSession';
import { participation } from '../../src/lib/participation';
import { eventWindow } from '../../src/lib/screen-activity';
import { Page, Busy, Notice, ui } from '../../src/components/Page';
import { Teams } from '../../src/components/Teams';
import { Participation } from '../../src/components/Participation';
import { PrimaryButton } from '../../src/components/PrimaryButton';
export default function Team() {
  const session=useEventSession();const state=useCode();const {user}=useAuth();const d=state.detail;const member=d?participation(d,user?.id).member:undefined;const ended=d?eventWindow(d.event.data,Date.now()).ended:false;
  useFocusEffect(useCallback(()=>{void state.reloadEvent().catch(()=>{});},[d?.event.id,state.reloadEvent]));
  return <Page title="Minha equipe" subtitle={d?.event.data.title} help="events#teams" focusKey={`${d?.event.id}:${d?.my_team_id}`} back={()=>router.replace('/')}>
    {state.loading && <Busy />}{state.error && <><Notice text={state.error} error /><PrimaryButton label="Tentar novamente" onPress={()=>state.refresh().catch(()=>{})} /></>}
    {!state.loading && !state.error && (!d || d.event.data.status!=='published') && <Notice text="Entre em um evento publicado na aba Eventos para escolher sua equipe." />}
    {!state.loading && !state.error && d?.event.data.status==='published' && <>{member && ended && <Notice text="Este evento está encerrado. Sua equipe e os resultados continuam disponíveis; não é possível iniciar novos desafios após o prazo."/>}{member && (!d.event.data.teams_mode || !!d.my_team_id) && <PrimaryButton label={ended?"Consultar desafios e resultados":"Ir para os desafios"} onPress={()=>{void session.enterScreen();router.replace('/train');}} />}{!member ? <Participation /> : d.event.data.teams_mode ? <Teams key={d.event.id} /> : <Text style={ui.text}>Este evento é individual. Você já pode treinar.</Text>}</>}
  </Page>;
}
