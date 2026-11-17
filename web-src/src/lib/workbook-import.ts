import { read, utils, WorkSheet } from 'xlsx';
import { unzipSync, strFromU8 } from 'fflate';
import type { ChallengeData, Language, Level } from '../types/sdk';
type Cell = string | number | boolean | null;
export type SourceRow = Record<string,Cell>;
export type ImportQuestion = { challenge: ChallengeData; source: { external_id:string; file_name:string; archive:Record<string,SourceRow[]> }; media: { id:string; mime:string; sha256:string; base64:string }[] };
const sheets=['Catalogo','Textos','Solucoes','Dicas','Exemplos','Fontes','Guia','Figuras','Midia'];
const text=(v: unknown)=>v===null || v===undefined ? '' : String(v);
function rows(sheet:WorkSheet,range:string,emptyCells:Set<string>): SourceRow[] {
  const matrix=utils.sheet_to_json<Cell[]>(sheet,{header:1,raw:true,defval:null,blankrows:true,range});
  const bounds=utils.decode_range(range);
  for(const address of emptyCells){const pos=utils.decode_cell(address);if(pos.r>=bounds.s.r && pos.r<=bounds.e.r && pos.c>=bounds.s.c && pos.c<=bounds.e.c && matrix[pos.r-bounds.s.r])matrix[pos.r-bounds.s.r][pos.c-bounds.s.c]=null;}
  const headers=(matrix.shift() || []).map(text);
  if(!headers.length || new Set(headers).size!==headers.length || headers.some(h=>!h || ['__proto__','constructor','prototype'].includes(h))) throw new Error('Cabeçalho inválido ou repetido na planilha.');
  return matrix.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i] ?? null])));
}
function nativeData(bytes:Uint8Array):{ranges:Record<string,string>;empty:Record<string,Set<string>>;owners:Record<string,string>} {
  let expanded=0;
  const parts=unzipSync(bytes,{filter:entry=>{expanded+=entry.originalSize;if(expanded>100_000_000)throw new Error('Conteúdo descompactado da planilha muito grande.');if(entry.name.startsWith('xl/externalLinks/'))throw new Error('A planilha contém dependências externas.');return entry.name==='xl/workbook.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(entry.name) || entry.name.startsWith('xl/tables/') && entry.name.endsWith('.xml') || entry.name.endsWith('.rels');}});
  const attrs=(tag:string)=>Object.fromEntries([...tag.matchAll(/\b([A-Za-z_:][\w:.-]*)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1],m[2]]));
  const xml=(path:string)=>parts[path]?strFromU8(parts[path]):'';
  const links=(path:string)=>[...xml(path).matchAll(/<(?:[A-Za-z_][\w.-]*:)?Relationship\b([^>]*)>/g)].map(m=>attrs(m[1]));
  const resolve=(owner:string,target:string)=>{const result:string[]=[];for(const part of (target.startsWith('/')?target.slice(1):owner.slice(0,owner.lastIndexOf('/')+1)+target).split('/')){if(part==='..')result.pop();else if(part && part!=='.')result.push(part);}return result.join('/');};
  const ranges:Record<string,string>={},tableNames:Record<string,string>={},empty:Record<string,Set<string>>={},owners:Record<string,string>={};
  for(const path of Object.keys(parts)){
    const content=xml(path);
    if(path.endsWith('.rels')){if(/TargetMode\s*=\s*["']External["']|Type\s*=\s*["'][^"']*\/hyperlink["']/.test(content))throw new Error('A planilha contém links ou dependências externas.');continue;}
    if(!path.startsWith('xl/tables/'))continue;
    const a=attrs(content.match(/<(?:[A-Za-z_][\w.-]*:)?table\b([^>]*)>/)?.[1] || '');
    if(!a.name || !/^[A-Z]+\d+:[A-Z]+\d+$/.test(a.ref || '') || ranges[a.name])throw new Error('Tabela nativa inválida ou repetida.');ranges[a.name]=a.ref;tableNames[path]=a.name;
  }
  const workbookLinks=links('xl/_rels/workbook.xml.rels');
  for(const match of xml('xl/workbook.xml').matchAll(/<(?:[A-Za-z_][\w.-]*:)?sheet\b([^>]*)>/g)){
    const sheet=attrs(match[1]),link=workbookLinks.find(r=>r.Id===sheet['r:id']);if(!link)throw new Error('Relação de aba ausente.');
    const path=resolve('xl/workbook.xml',link.Target),content=xml(path);empty[sheet.name]=new Set();
    for(const cell of content.matchAll(/<(?:[A-Za-z_][\w.-]*:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?c>)/g)){
      const a=attrs(cell[1]);if(['str','d'].includes(a.t) && !/<(?:[A-Za-z_][\w.-]*:)?v\b[^>]*>[^<]+<\//.test(cell[2] || ''))empty[sheet.name].add(a.r);
    }
    const relPath=path.slice(0,path.lastIndexOf('/')+1)+'_rels/'+path.slice(path.lastIndexOf('/')+1)+'.rels';
    for(const rel of links(relPath))if(rel.Type?.endsWith('/table')){const name=tableNames[resolve(path,rel.Target)];if(name)owners[name]=sheet.name;}
  }
  return {ranges,empty,owners};
}
function parts(group:SourceRow[],field:string,order:string): string {
  const sorted=[...group].sort((a,b)=>Number(a[order])-Number(b[order]));
  if(sorted.some((r,i)=>!Number.isInteger(Number(r[order])) || Number(r[order])!==i+1)) throw new Error(`Partes ausentes ou duplicadas em ${field}.`);
  return sorted.map(r=>text(r[field])).join('');
}
export function parseWorkbook(bytes: Uint8Array,fileName:string): ImportQuestion[] {
  if(bytes.byteLength>20_000_000) throw new Error('Use uma planilha XLSX de até 20 MB.');
  const native=nativeData(bytes);const {ranges}=native;
  const book=read(bytes,{type:'array',cellFormula:false,cellHTML:false,cellText:false,bookVBA:false});
  for(const name of sheets) if(!book.Sheets[name]) throw new Error(`Esta planilha precisa da aba ${name}. Use a base INTERIF ou Outras Maratonas.`);
  const data:Record<string,SourceRow[]>={};
  const tables:Record<string,string[]>={Catalogo:['CatalogoQuestoes'],Textos:['TextosQuestoes'],Solucoes:['SolucoesQuestoes'],Dicas:['DicasQuestoes'],Exemplos:['ExemplosQuestoes'],Fontes:['FontesCadernos'],Guia:['GuiaBase','GuiaImportacao'],Figuras:['FigurasIncorporadas'],Midia:['MidiaBase64']};
  for(const name of sheets) {const table=tables[name].find(t=>ranges[t]);if(!table || native.owners[table]!==name)throw new Error(`Tabela nativa ausente na aba ${name}.`);data[name]=rows(book.Sheets[name],ranges[table],native.empty[name] || new Set());}
  if(!data.Catalogo.length || data.Catalogo.length>500) throw new Error('Importe entre 1 e 500 questões por planilha.');
  for(const field of ['id','titulo','enunciado','nivel','entrada','saida']) if(!(field in data.Catalogo[0])) throw new Error(`Coluna ${field} ausente no Catalogo.`);
  const ids=new Set<string>();
  for(const row of data.Catalogo) { const id=text(row.id);if(!id || ids.has(id))throw new Error(`ID vazio ou repetido: ${id}.`);ids.add(id); }
  for(const row of data.Catalogo){for(const flag of ['permitir_geracao_sem_revisao','avaliacao_automatica_habilitada'])if(typeof row[flag]!=='boolean')throw new Error(`${text(row.id)}: ${flag} deve ser booleano nativo.`);if(typeof row.nivel!=='number' || !Number.isInteger(row.nivel))throw new Error('Nível deve ser inteiro nativo.');if(row.equivalente_a && !ids.has(text(row.equivalente_a)))throw new Error('Equivalência aponta para questão inexistente.');}
  for(const name of ['Textos','Solucoes','Dicas','Exemplos']) for(const r of data[name]) if(!ids.has(text(r.id))) throw new Error(`${name}: referência a questão inexistente ${text(r.id)}.`);
  for(const r of data.Exemplos) if(typeof r.numero_exemplo!=='number' || !Number.isInteger(r.numero_exemplo) || r.numero_exemplo<1 || !('entrada_bloco' in r) || !('saida_bloco' in r) || [r.entrada_bloco,r.saida_bloco].some(v=>v!==null && typeof v!=='string'))throw new Error('Identificação ou campos de exemplo inválidos.');
  const figureIds=new Set<string>();for(const r of data.Figuras){if(!ids.has(text(r.questao_id)) || figureIds.has(text(r.figura_id)))throw new Error('Figura órfã ou repetida.');figureIds.add(text(r.figura_id));}
  const textKeys=new Set<string>();for(const r of data.Textos){const key=`${r.id}:${r.ordem}`;if(textKeys.has(key))throw new Error('Bloco de texto repetido.');textKeys.add(key);}
  const media=new Map<string,{id:string;mime:string;sha256:string;base64:string}>();
  for(const id of new Set(data.Midia.map(r=>text(r.figura_id)))) {
    const group=data.Midia.filter(r=>text(r.figura_id)===id),first=group[0];
    if(group.some(r=>Number(r.partes_total)!==group.length || r.sha256!==first.sha256 || r.mime!==first.mime)) throw new Error(`Mídia incompleta: ${id}.`);
    const base64=parts(group,'base64','parte');
    const fig=data.Figuras.find(r=>text(r.figura_id)===id);if(!fig || fig.sha256!==first.sha256 || fig.mime!==first.mime)throw new Error(`Metadados divergentes entre Figuras e Midia: ${id}.`);
    if(!['image/png','image/jpeg'].includes(text(first.mime)) || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || !/^[a-f0-9]{64}$/.test(text(first.sha256))) throw new Error(`Imagem inválida: ${id}.`);
    media.set(id,{id,mime:text(first.mime),sha256:text(first.sha256),base64});
  }
  if(media.size!==figureIds.size)throw new Error('Figuras e Midia não possuem os mesmos identificadores.');
  return data.Catalogo.map(row=>{
    const id=text(row.id),n=Number(row.nivel);if(![1,2,3,4,5].includes(n))throw new Error(`${id}: nível deve estar entre 1 e 5.`);
    const level:Level=n<=2?'easy':n===3?'medium':'hard';
    const archive:Record<string,SourceRow[]>={Catalogo:[row]};
    for(const name of ['Textos','Solucoes','Dicas','Exemplos']) archive[name]=data[name].filter(r=>text(r.id)===id);
    if(archive.Solucoes.length!==1 || !archive.Exemplos.length)throw new Error(`${id}: solução ou exemplos ausentes ou repetidos.`);
    const hints=[...archive.Dicas].sort((a,b)=>Number(a.ordem_dica)-Number(b.ordem_dica));if(hints.length!==3 || hints.some((h,i)=>h.ordem_dica!==i+1 || h.texto_dica!==row[`dica_${i+1}`]))throw new Error(`${id}: dicas precisam ser 1, 2 e 3, sem divergências.`);
    archive.Figuras=data.Figuras.filter(r=>text(r.questao_id)===id);
    archive.Fontes=data.Fontes;
    archive.Guia=data.Guia;
    const imageIds=text(row.figuras_ids).split(';').map(s=>s.trim()).filter(Boolean);
    if(new Set(imageIds).size!==imageIds.length || archive.Figuras.length!==imageIds.length)throw new Error(`${id}: conjunto de figuras divergente.`);
    const images=imageIds.map(imageId=>{const image=media.get(imageId);if(!image || !archive.Figuras.some(r=>text(r.figura_id)===imageId))throw new Error(`${id}: figura ausente ${imageId}.`);return image;});
    const exampleNumbers=[...new Set(archive.Exemplos.map(r=>Number(r.numero_exemplo)))].sort((a,b)=>a-b);if(exampleNumbers.some((n,i)=>n!==i+1))throw new Error(`${id}: numeração de exemplos não consecutiva.`);
    const examples=exampleNumbers.map(number=>{
      const group=archive.Exemplos.filter(r=>Number(r.numero_exemplo)===number);
      return {input:parts(group,'entrada_bloco','parte'),output:parts(group,'saida_bloco','parte')};
    });
    const statement=[text(row.enunciado),...(['entrada','saida','restricoes'] as const).filter(k=>text(row[k])).map(k=>`${({entrada:'Entrada',saida:'Saída',restricoes:'Restrições'})[k]}\n${text(row[k])}`)].join('\n\n');
    const outputKind=text(row.tipo_saida).includes('tolerância')?'numeric':text(row.tipo_saida).includes('construtiva')?'constructive':text(row.tipo_saida)==='exata'?'exact':text(row.tipo_saida)?'unconfirmed':'exact';
    const warnings=[text(row.pendencias),...(['numeric','constructive'].includes(outputKind)?['Saída especial: tolerância declarada ou conferência de cada resultado pela IA do professor.']:[])].filter(Boolean);
    if(!text(row.titulo).trim() || !statement.trim())throw new Error(`${id}: título e enunciado são obrigatórios.`);
    return {challenge:{title:text(row.titulo),statement,level,topics:text(row.temas || row.tema_principal),languages:['python','c','cpp','java','javascript'] as Language[],tests:examples.map(t=>({...t})),examples,
      attribution:[text(row.competicao) || `INTERIF ${text(row.ano)} · ${text(row.fase)}`,text(row.autor_pergunta),text(row.licenca),Number(row.versao_conteudo)===2?'Adaptação para treinamento. O enunciado vigente prevalece sobre figuras históricas.':''].filter(Boolean).join(' · '),
      figures:images.map(image=>({id:image.id,mime:image.mime})),
      import_info:{external_id:id,source_level:n,source_difficulty:text(row.dificuldade),source_status:text(row.status_revisao),review_status:'provided',tests_origin:'provided_examples',comparison_origin:row.tipo_saida?'declared':'examples_default',output_kind:outputKind,comparison_declared:!!row.tipo_saida,warnings}},
      source:{external_id:id,file_name:fileName,archive},media:images};
  });
}
