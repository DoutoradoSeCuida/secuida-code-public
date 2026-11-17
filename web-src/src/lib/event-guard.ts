export class EventSwitchBlocked extends Error {
  constructor() { super('Há alterações ou uma prévia aberta no evento atual. Salve ou descarte antes de trocar de evento.'); this.name='EventSwitchBlocked'; }
}
export function createEventGuard() {
  const guards=new Set<()=>boolean>();
  return {
    register(guard:()=>boolean) { guards.add(guard); return ()=>guards.delete(guard); },
    check(current:string|undefined, target:string|undefined) {
      if (current && current!==target && [...guards].some(guard=>guard())) throw new EventSwitchBlocked();
    },
  };
}
