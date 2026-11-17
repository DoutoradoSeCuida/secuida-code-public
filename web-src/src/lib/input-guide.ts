import type { Language } from '../types/sdk';

// These are starting points for a single integer, not solutions to a challenge.
export const inputGuides: Record<Language, { hint: string; example: string }> = {
  python: { hint: 'Use input() para ler uma linha; converta com int() quando for um inteiro.', example: 'valor = int(input())\n' },
  javascript: { hint: 'Use readline() para ler uma linha; converta com Number() quando for um número.', example: 'const valor = Number(readline());\n' },
  c: { hint: 'Use scanf para ler a entrada padrão; por exemplo, %d lê um inteiro.', example: '#include <stdio.h>\n\nint main(void) {\n    int valor;\n    scanf("%d", &valor);\n    return 0;\n}\n' },
  cpp: { hint: 'Use cin para ler a entrada padrão; ele separa valores por espaços ou linhas.', example: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int valor;\n    cin >> valor;\n    return 0;\n}\n' },
  java: { hint: 'Use Scanner para ler a entrada padrão; nextInt() lê um inteiro.', example: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner entrada = new Scanner(System.in);\n        int valor = entrada.nextInt();\n    }\n}\n' },
};
