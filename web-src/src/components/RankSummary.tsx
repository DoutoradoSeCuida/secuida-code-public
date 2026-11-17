import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { rankSummary } from '../lib/rank-summary';
import type { RaceData } from '../types/sdk';

export function RankSummary({eventId,token,userId,teamId,teamsMode,compact=false}:{compact?:boolean;eventId:string;token:string|null;userId:number;teamId?:string;teamsMode:boolean}) {
  const [data,setData]=useState<RaceData|null>(null);
  const [error,setError]=useState(false);
  const [loading,setLoading]=useState(false);
  const flight=useRef(false);
  async function load(){
    if(!token || flight.current)return;
    flight.current=true;
    setLoading(true);setError(false);
    try{setData(await api<RaceData>(`ranking?event_id=${encodeURIComponent(eventId)}`,token));}
    catch{setError(true);}
    finally{flight.current=false;setLoading(false);}
  }
  const {individual,team}=data ? rankSummary(data,userId,teamId) : {individual:null,team:null};
  return <View accessibilityLabel="Resumo da classificação deste evento" style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',columnGap:12,rowGap:2,paddingHorizontal:10,backgroundColor:'#edf3fa',borderRadius:8}}>
    {!data && <Text style={{fontSize:12,color:'#344b5e'}}>Classificação</Text>}
    {!!data?.rows.length && <Text style={{fontSize:12,color:'#344b5e'}}><Text style={{fontWeight:'800'}}>Você </Text>{individual?`${individual.position}º · ${individual.points} pts`:'sem classificação'}</Text>}
    {data && teamsMode && <Text style={{fontSize:12,color:'#344b5e',flexShrink:1}} numberOfLines={2}><Text style={{fontWeight:'800'}}>{team?.name || 'Equipe'} </Text>{team?`${team.position}º · ${team.points} pts`:teamId?'sem classificação':'ainda não escolhida'}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="Atualizar resumo da classificação" accessibilityState={{busy:loading,disabled:loading}} disabled={loading} onPress={load} style={{minWidth:44,minHeight:compact?36:44,alignItems:'center',justifyContent:'center'}}><Ionicons name={loading?"hourglass-outline":"refresh-outline"} size={18} color="#2456c7"/></Pressable>
    {error && <Text accessibilityLiveRegion="polite" style={{fontSize:12,color:'#985329'}}>Falha ao atualizar. Toque no ícone para tentar novamente.</Text>}
  </View>;
}
