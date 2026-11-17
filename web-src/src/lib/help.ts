export const helpPages = {
  events: { title: 'Eventos', anchors: ['join','select','teams','invites','classroom','schedule','archive'] },
  train: { title: 'Treinar', anchors: ['editor','tests','hints','submit','claims','assessment','statement','language','input','autosave','rules','classroom','schedule'] },
  ranking: { title: 'Ranking', anchors: ['points','time','badges','race','reports','classroom'] },
  teacher: { title: 'Professor', anchors: ['access','create','import','classify','review','delete','teams','assessment','source','select','manage','questions','reviewlist','prepare','schedule','collaboration','evaluators','queue','classroom','archive','import-select'] },
  admin: { title:'Administrador', anchors:['requests','teachers'] },
  monitor: {title:'Acompanhamento',anchors:['matrix','incidents','access']},
  account: { title: 'Conta', anchors: ['access','ai','executor','privacy','gemini','models','reasoning','keys','test'] },
} as const;
export function helpTarget(value: string) {
  const [key, requested] = value.split('#'); const page = key in helpPages ? key as keyof typeof helpPages : 'events';
  const anchors = helpPages[page].anchors as readonly string[];
  return { page, anchor: requested && anchors.includes(requested) ? requested : anchors[0], title: helpPages[page].title };
}
