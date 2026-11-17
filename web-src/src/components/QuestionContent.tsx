import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { ChallengeData } from '../types/sdk';
import { api } from '../lib/api';
import { useAuth } from '../providers/AuthProvider';
import { Notice, ui } from './Page';
import { PrimaryButton } from './PrimaryButton';
export function QuestionContent({data,id,media=[]}:{data:ChallengeData;id?:string;media?:{id:string;mime:string;base64:string}[]}) {
  const {token}=useAuth();const [images,setImages]=useState<{id:string;uri:string}[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{setImages([]);setError('');},[id,data.title]);
  return <View style={ui.column}>
    <Text selectable style={ui.text}>{data.statement}</Text>
    {!!data.figures?.length && <><PrimaryButton label={images.length?'Recarregar figuras do enunciado':`Mostrar ${data.figures.length} figuras do enunciado`} variant="secondary" loading={busy} disabled={busy} onPress={async()=>{
      setBusy(true);setError('');try{const loaded=await Promise.all(data.figures!.map(async f=>{const local=media.find(m=>m.id===f.id);const r=local?{uri:`data:${local.mime};base64,${local.base64}`} : await api<{uri:string}>(`challenge/media?challenge_id=${encodeURIComponent(id || '')}&image_id=${encodeURIComponent(f.id)}`,token);return {id:f.id,uri:r.uri};}));setImages(loaded);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
    }} />{error && <Notice text={error} error />}{images.map(image=><View key={image.id}><Text style={ui.muted}>Figura {image.id}</Text><Image accessible accessibilityLabel={`Figura do enunciado ${image.id}`} source={{uri:image.uri}} resizeMode="contain" style={{width:'100%',height:300}} onError={()=>setError('Não foi possível mostrar uma figura. Use Recarregar figuras para tentar novamente.')} /></View>)}</>}
    {!!data.examples?.length && <><Text style={ui.h2}>Exemplos do enunciado</Text>{data.examples.map((example,i)=><View key={i} style={ui.column}><Text style={ui.muted}>Exemplo {i+1} · entrada</Text><Text selectable style={ui.code}>{example.input || '(entrada vazia)'}</Text><Text style={ui.muted}>Saída apresentada na fonte</Text><Text selectable style={ui.code}>{example.output || '(saída vazia)'}</Text></View>)}</>}
    {!!data.attribution && <Text selectable style={ui.muted}>{data.attribution}</Text>}
  </View>;
}
