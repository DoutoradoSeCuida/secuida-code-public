import { useState } from 'react';
import { Text, View } from 'react-native';
import type { TestCase } from '../types/sdk';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';
import { ui } from './Page';
export function TestCases({value,onChange,examples=false,disabled=false}:{value:string;onChange:(value:string)=>void;examples?:boolean;disabled?:boolean}) {
  const [page,setPage]=useState(0); const items=JSON.parse(value) as TestCase[];
  const current=Math.min(page,Math.max(0,Math.ceil(items.length/3)-1));
  const noun=examples?'exemplo':'teste';
  function edit(index:number,key:'input'|'output',text:string){onChange(JSON.stringify(items.map((item,i)=>i===index?{...item,[key]:text}:item)));}
  return <View style={{gap:12}}><Text style={ui.h2}>{examples?'Exemplos do enunciado':'Testes de avaliação'}</Text><Text style={ui.muted}>{examples?'Mostram ao aluno como são a entrada e a saída.':'Cada teste contém os dados recebidos e a saída esperada. Os testes são públicos e usados na avaliação.'}</Text>
    {!items.length && <Text style={ui.muted}>{examples?'Nenhum exemplo adicionado.':'Nenhum teste preparado. Você pode salvar o rascunho e preparar antes de publicar.'}</Text>}
    {items.slice(current*3,current*3+3).map((item,n)=>{const i=current*3+n;return <View key={i} style={{gap:10,borderWidth:1,borderColor:'#d8e0d6',padding:12,borderRadius:12}}><Text style={ui.text}>{examples?'Exemplo':'Teste'} {i+1}</Text><TextField label={`Entrada do ${noun} ${i+1}`} helperText="Dados que o programa receberá, com as quebras de linha pedidas no enunciado. Não cole código aqui." multiline value={item.input} onChangeText={text=>edit(i,'input',text)} editable={!disabled} style={{minHeight:75,fontFamily:'monospace'}} /><TextField label={`Saída esperada do ${noun} ${i+1}`} helperText="Resultado correto para esta entrada, como o programa deve imprimir. Preserve espaços e quebras de linha." multiline value={item.output} onChangeText={text=>edit(i,'output',text)} editable={!disabled} style={{minHeight:75,fontFamily:'monospace'}} /><PrimaryButton label={`Remover ${noun} ${i+1}`} variant="secondary" disabled={disabled} onPress={()=>onChange(JSON.stringify(items.filter((_,j)=>j!==i)))} /></View>;})}
    <PrimaryButton label={examples?'Adicionar exemplo':'Adicionar teste'} variant="secondary" disabled={disabled || items.length>=50} onPress={()=>{onChange(JSON.stringify([...items,{input:'',output:''}]));setPage(Math.floor(items.length/3));}} />
    {items.length>3 && <View style={ui.row}><PrimaryButton label={`Ver ${examples?'exemplos':'testes'} anteriores`} variant="secondary" disabled={disabled||!current} onPress={()=>setPage(current-1)} /><Text style={ui.muted}>Página {current+1} de {Math.ceil(items.length/3)}</Text><PrimaryButton label={`Ver próximos ${examples?'exemplos':'testes'}`} variant="secondary" disabled={disabled || (current+1)*3>=items.length} onPress={()=>setPage(current+1)} /></View>}
  </View>;
}
