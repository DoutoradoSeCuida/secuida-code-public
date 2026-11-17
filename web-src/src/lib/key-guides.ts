import type { AISettings } from '../types/sdk';
// Sources checked on 2026-10-26; see spec/keys-plan.json.
export const keyGuides: Record<AISettings['provider'], {name:string;signup:string;keys:string;steps:string[];note:string}> = {
  nvidia: {
    name:'NVIDIA Build', signup:'https://build.nvidia.com/', keys:'https://build.nvidia.com/settings/api-keys',
    steps:[
      'Entre no NVIDIA Build ou crie sua conta. Conclua as verificações solicitadas pelo site.',
      'Abra a página de chaves e procure Get API Key ou Generate API Key. Você também pode abrir um modelo do catálogo e usar View Code para gerar a chave.',
      'Gere a chave e copie somente o valor dela, sem copiar o exemplo de código.',
    ],
    note:'O acesso de avaliação e os limites dependem da NVIDIA e da sua conta.',
  },
  openai: {
    name:'OpenAI Platform', signup:'https://platform.openai.com/', keys:'https://platform.openai.com/api-keys',
    steps:[
      'Entre na plataforma OpenAI ou crie sua conta.',
      'Abra API keys, confira o projeto selecionado e escolha Create new secret key.',
      'Dê um nome à chave, confirme a criação e copie o valor exibido.',
    ],
    note:'O uso da API tem cobrança própria. Confira saldo, faturamento e limites antes de enviar análises.',
  },
  gemini: {
    name:'Google AI Studio', signup:'https://aistudio.google.com/', keys:'https://aistudio.google.com/apikey',
    steps:[
      'Abra o Google AI Studio e entre com sua conta Google.',
      'Abra API keys. Copie uma chave existente ou escolha Create API key para gerar outra.',
      'Se solicitado, escolha ou crie um projeto e copie a chave da Gemini API.',
    ],
    note:'A disponibilidade gratuita e os limites variam conforme o modelo e a sua conta.',
  },
};
