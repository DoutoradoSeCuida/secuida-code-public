import { useState } from 'react';
import { Text, View } from 'react-native';
import { Archive, referenceOf, referenceText } from '../lib/import-review';
import { PrimaryButton } from './PrimaryButton';
import { HelpHeading, Notice, ui } from './Page';
export function ReferenceContent({archive}:{archive:Archive}) {
  const ref=referenceOf(archive); const [summaryOpen,setSummaryOpen]=useState(false);
  const fields=[['Origem da solução',ref.origin],['Verificação informada na fonte',ref.verification],['Complexidade',ref.complexity],['Casos limite',ref.edgeCases],['Critérios de avaliação',ref.criteria],['Complemento da fonte · confira o que pertence ao enunciado',ref.complement],['Adaptação para treinamento',ref.adaptation]];
  return <View style={ui.column}><HelpHeading title="Solução · só para o professor" help="teacher#source" />
    {!ref.available && <Notice text="Esta questão não tem solução de referência preenchida. Confira a fonte antes de usar. Você ainda pode importá-la como rascunho para revisão." />}
    {ref.partial && <Notice text="Há apenas um resumo da solução. A planilha não traz explicação detalhada nem código de referência para esta questão." />}
    {!!ref.detail && <View style={ui.column}><Text style={ui.h2}>Explicação detalhada e passos</Text><Text selectable style={ui.text}>{ref.detail}</Text></View>}
    {!!ref.code && <View style={ui.column}><Text style={ui.h2}>Código de referência{ref.language?` · ${ref.language}`:''}</Text><Text selectable style={ui.code}>{ref.code}</Text>{!!ref.codeOrigin && <Text selectable style={ui.muted}>Origem do código: {ref.codeOrigin}</Text>}{!!ref.license && <Text selectable style={ui.muted}>Licença: {ref.license}</Text>}</View>}
    {!!ref.summary && ref.summary.trim()!==ref.detail.trim() && <View style={ui.column}>{(!!ref.detail||!!ref.code) && <PrimaryButton label={summaryOpen?'Fechar resumo da planilha':'Ver resumo da planilha'} variant="secondary" onPress={()=>setSummaryOpen(v=>!v)} />}{(!ref.detail&&!ref.code || summaryOpen) && <><Text style={ui.h2}>Resumo da solução</Text><Text selectable style={ui.text}>{ref.summary}</Text></>}</View>}
    <Text style={ui.muted}>Uso exclusivo do professor. Confira a origem e os testes; a presença de uma referência não certifica sua correção. Este material não é enviado pelo tutor ao aluno.</Text>
    {fields.filter(([,value])=>!!value).map(([label,value])=><View key={label} style={ui.column}><Text style={ui.h2}>{label}</Text><Text selectable style={ui.text}>{value}</Text></View>)}
    {!!archive.Dicas?.length && <View style={ui.column}><Text style={ui.h2}>Dicas da fonte · privadas</Text>{[...archive.Dicas].sort((a,b)=>Number(a.ordem_dica)-Number(b.ordem_dica)).map((row,i)=><Text key={i} selectable style={ui.text}>{row.ordem_dica || i+1}. {referenceText(row.texto_dica) || 'Não informada'}</Text>)}</View>}
  </View>;
}
