import type { EventRecord } from '../types/sdk';

// The server supplies the authorized events; only published team races can be projected.
export function projectionEvents(events: EventRecord[], selected: string[]): EventRecord[] {
  return events.filter(e => e.data.status === 'published' && !!e.data.teams_mode && selected.includes(e.id));
}
export function projectionPosition(current: number, count: number): number {
  return count > 0 ? (current + 1) % count : 0;
}
