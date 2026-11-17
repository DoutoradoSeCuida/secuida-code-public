import type { Language } from '../types/sdk';
export type Detection = { name: string; language?: Language } | null;
// Mask literals/comments before looking for syntax. Never execute or send the code.
function syntaxOnly(source: string) {
  return source.slice(0, 100000).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|#(?!include\b)[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/gm, text => text.replace(/[^\n]/g, ' '));
}
export function detectLanguage(source: string): Detection {
  const s = syntaxOnly(source);
  const candidates: { name: string; language?: Language; signals: RegExp[] }[] = [
    { name: 'PHP', signals: [/<\?php\b/, /\becho\s+\$\w+/, /\$\w+\s*=\s*\$/] },
    { name: 'C#', signals: [/\busing\s+System\s*[;.]/, /\bConsole\.(WriteLine|ReadLine)\s*\(/] },
    { name: 'Go', signals: [/^\s*package\s+main\b/m, /\bfunc\s+\w+\s*\(/] },
    { name: 'Rust', signals: [/\bfn\s+\w+\s*\([^)]*\)\s*(?:->[^{}]+)?\{/, /\b(?:println|vec)!\s*[([]/] },
    { name: 'Kotlin', signals: [/\bfun\s+main\s*\(/, /\bval\s+\w+\s*=\s*readln\s*\(/] },
    { name: 'TypeScript', signals: [/\binterface\s+\w+\s*\{/, /\b(?:let|const)\s+\w+\s*:\s*(?:number|string|boolean)\b/, /\btype\s+\w+\s*=\s*(?:number|string|boolean)\b/] },
    { name: 'Ruby', signals: [/^\s*require_relative\b/m, /^\s*def\s+\w+[^:\n]*\n[\s\S]*?^\s*end\b/m] },
    { name: 'C++', language: 'cpp', signals: [/^\s*#include\s*<\s*(?:iostream|vector|bits\/stdc\+\+\.h|algorithm)\s*>/m, /\bstd\s*::/, /\b(?:cout|cin)\s*(?:<<|>>)/, /\busing\s+namespace\s+std\b/] },
    { name: 'Java', language: 'java', signals: [/\bpublic\s+class\s+\w+/, /\bSystem\.(?:out|in)\b/, /\bimport\s+java\./, /\bstatic\s+void\s+main\s*\(/] },
    { name: 'C', language: 'c', signals: [/^\s*#include\s*<\s*(?:stdio|stdlib|string)\.h\s*>/m, /\b(?:printf|scanf|puts|fgets)\s*\(/] },
    { name: 'Python', language: 'python', signals: [/^\s*(?:async\s+)?def\s+\w+\s*\([^\n]*\)\s*(?:->[^:\n]+)?\s*:/m, /^\s*(?:for|while|if|elif)\b[^\n]*:\s*$/m, /^\s*(?:from\s+\w+(?:\.\w+)*\s+import|import\s+(?:sys|math|collections)\b)/m, /\b(?:int|float|list|map)\s*\(\s*(?:input|map)\s*\(/] },
    { name: 'JavaScript', language: 'javascript', signals: [/\b(?:const|let)\s+\w+\s*=/, /\bfunction\s+\w*\s*\(/, /\bconsole\.log\s*\(/, /=>/, /\brequire\s*\(/] },
  ];
  const scored = candidates.map((c, i) => ({ ...c, score: c.signals.filter(r => r.test(s)).length, i })).filter(c => c.score > 0);
  // Specific dialects win over their shared base syntax (TS/JS, C++/C).
  const dialect = scored.find(c => !c.language || c.language === 'cpp');
  if (dialect) return { name: dialect.name, language: dialect.language };
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  if (!scored.length || (scored[1] && scored[0].score === scored[1].score)) return null;
  return { name: scored[0].name, language: scored[0].language };
}
export function languageFit(detected: Detection, selected: Language, allowed: Language[]) {
  if (!allowed.includes(selected)) return 'not-allowed';
  if (!detected) return 'unknown';
  if (!detected.language) return 'unsupported';
  if (!allowed.includes(detected.language)) return 'not-allowed';
  return detected.language === selected ? 'match' : 'different';
}
