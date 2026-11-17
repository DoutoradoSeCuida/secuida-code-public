import type { ChallengeData, Language, Level } from '../types/sdk';
const allowed = ['python','c','cpp','java','javascript'];
export function parseImport(text: string): ChallengeData[] {
  if (text.length > 2000000) throw new Error('Importe um arquivo com até 2 MB.');
  const source = text.replace(/^\uFEFF/, '').trim();
  let items: any[];
  if (source.startsWith('[')) { items = JSON.parse(source); }
  else {
    const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
    const separator = source.split(/\r?\n/)[0].includes(';') ? ';' : ',';
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (c === '"') { if (quoted && source[i+1] === '"') { cell += '"'; i++; } else if (quoted || !cell) quoted = !quoted; else throw new Error('Aspas inválidas na planilha.'); }
      else if (!quoted && (c === separator || c === '\n')) { row.push(cell.replace(/\r$/, '')); cell = ''; if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = []; } }
      else cell += c;
    }
    if (quoted) throw new Error('Existe um campo com aspas não fechadas.');
    row.push(cell.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row);
    const headers = rows.shift()?.map(s => s.trim()) || [];
    if (!headers.includes('title') || !headers.includes('statement')) throw new Error('A planilha precisa das colunas title e statement. Veja o modelo na ajuda.');
    items = rows.map(cells => { if (cells.length !== headers.length) throw new Error('Há uma linha com número incorreto de colunas.'); return Object.fromEntries(headers.map((h,i) => [h,cells[i]])); });
  }
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('Importe entre 1 e 100 desafios por vez.');
  return items.map((v,i) => {
    if (!v || typeof v !== 'object' || typeof v.title !== 'string' || typeof v.statement !== 'string' || !v.title.trim() || !v.statement.trim()) throw new Error(`Desafio ${i+1}: título e enunciado são obrigatórios.`);
    const level = v.level || 'easy'; if (!['easy','medium','hard'].includes(level)) throw new Error(`Desafio ${i+1}: use easy, medium ou hard.`);
    const tests = typeof v.tests === 'string' ? JSON.parse(v.tests || '[]') : v.tests || [];
    if (!Array.isArray(tests) || tests.length > 20 || tests.some(t => typeof t.input !== 'string' || typeof t.output !== 'string')) throw new Error(`Desafio ${i+1}: confira os testes.`);
    const languages = Array.isArray(v.languages) ? v.languages : typeof v.languages === 'string' && v.languages ? v.languages.split('|') : allowed;
    if (!languages.length || languages.some((l: string) => !allowed.includes(l))) throw new Error(`Desafio ${i+1}: linguagem desconhecida.`);
    return { title: v.title.trim(), statement: v.statement.trim(), level: level as Level, topics: String(v.topics || ''), languages: languages as Language[], tests, hint_policy: String(v.hint_policy || '') };
  });
}
