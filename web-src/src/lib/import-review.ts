import { specialSupported } from './special-output';
import type { ImportQuestion, SourceRow } from './workbook-import';
export type Archive = Record<string,SourceRow[]>;
const placeholders = new Set(['-','—','n/a','na','null','none','não informado','nao informado','não disponível','nao disponivel','a definir','pendente','todo']);
export function referenceText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return placeholders.has(text.trim().toLocaleLowerCase()) ? '' : text.trim() ? text : '';
}
export function referenceOf(archive: Archive) {
  const catalog = archive.Catalogo?.[0] || {}, solution = archive.Solucoes?.[0] || {};
  const summary = referenceText(catalog.solucao), detail = referenceText(solution.explicacao_pseudocodigo), code = referenceText(solution.codigo_oficial);
  return { summary, detail, code, available: !!(summary || detail || code), partial: !!summary && !detail && !code,
    language: referenceText(solution.linguagem_codigo || catalog.linguagem_codigo_referencia),
    origin: referenceText(solution.origem_solucao || catalog.origem_solucao), codeOrigin: referenceText(solution.origem_codigo), license: referenceText(solution.licenca || catalog.licenca),
    verification: referenceText(solution.verificacao_exemplo), complexity: referenceText(solution.complexidade || catalog.complexidade),
    edgeCases: referenceText(solution.casos_limite || catalog.casos_limite), criteria: referenceText(solution.criterios_avaliacao || catalog.criterios_avaliacao),
    complement: referenceText(catalog.complemento), adaptation: referenceText(catalog.correcao_aplicada),
  };
}
export type ReviewIssue = { code: 'missing_solution'|'partial_solution'|'source'|'comparator'|'special'|'examples'|'tests'|'review'; title: string; detail: string; extra: boolean };
export function reviewImport(item: ImportQuestion) {
  const reference=referenceOf(item.source.archive), info=item.challenge.import_info, issues:ReviewIssue[]=[];
  if(!reference.available)issues.push({code:'missing_solution',title:'Sem solução de referência',detail:'Não há resumo, explicação detalhada ou código de solução. Confira a fonte antes de usar. Importar não preenche esse material.',extra:true});
  else if(reference.partial)issues.push({code:'partial_solution',title:'Apenas resumo da solução',detail:'Há um resumo, mas não uma explicação detalhada ou código. Confira se a referência é suficiente para sua revisão.',extra:true});
  const catalog=item.source.archive.Catalogo?.[0] || {}, solution=item.source.archive.Solucoes?.[0] || {};
  const generated = new Set(['Defina o comparador de saída antes de publicar.','Exige correção especial antes da avaliação automática.','A fonte pede revisão antes do uso.','Saída especial: tolerância declarada ou conferência de cada resultado pela IA do professor.']);
  const notes=[...new Set([referenceText(catalog.pendencias),referenceText(solution.pendencia_fonte),...(info?.warnings || []).filter(w=>!generated.has(w)).map(referenceText)].filter(Boolean))];
  if(notes.length)issues.push({code:'source',title:'Observações fornecidas pela fonte',detail:notes.join('\n'),extra:true});
  if(!info || info.output_kind==='unconfirmed')issues.push({code:'comparator',title:'Comparação ainda não preparada',detail:'Aproveite os dados existentes. Tipos especiais declarados dependem de um corretor compatível.',extra:true});
  else if(!specialSupported(item.challenge))issues.push({code:'special',title:'Correção especial necessária',detail:'A comparação numérica precisa de tolerância explícita no enunciado. Várias respostas válidas são conferidas pela IA do professor.',extra:true});
  if(!item.challenge.examples?.length)issues.push({code:'examples',title:'Sem exemplos de entrada e saída',detail:'Confira como o enunciado apresenta o formato de entrada e saída. Exemplos são distintos dos testes de avaliação.',extra:true});
  if(!item.challenge.tests.length)issues.push({code:'tests',title:'Sem testes disponíveis',detail:'Aproveite os pares de entrada e saída da planilha automaticamente. Não é necessário redigitá-los.',extra:false});
  if(info?.review_status==='pending')issues.push({code:'review',title:'Dados no formato anterior',detail:'Use o aproveitamento automático dos dados já importados. A revisão de conteúdo pela IA é opcional.',extra:false});
  return {reference,issues,extras:issues.filter(i=>i.extra)};
}
export const reviewFilters = [
  {value:'all',label:'Todas'}, {value:'missing',label:'Sem solução'}, {value:'partial',label:'Apenas resumo'},
  {value:'attention',label:'Com alertas extras'}, {value:'comparator',label:'Definir comparador'},
  {value:'special',label:'Correção especial'}, {value:'examples',label:'Sem exemplos'},
  {value:'tests',label:'Sem testes de avaliação'}, {value:'clean',label:'Sem alertas extras'},
] as const;
export type ReviewFilter = typeof reviewFilters[number]['value'];
export function matchesReview(review:ReturnType<typeof reviewImport>,filter:ReviewFilter) {
  if(filter==='all')return true;
  if(filter==='missing')return !review.reference.available;
  if(filter==='partial')return review.reference.partial;
  if(filter==='attention')return !!review.extras.length;
  if(filter==='clean')return !review.extras.length;
  return review.issues.some(i=>i.code===filter);
}
