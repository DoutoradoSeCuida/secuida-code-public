import type { Attempt, Challenge, EventData } from '../types/sdk';

export function phaseProgress(event: EventData, challenges: Challenge[], attempts: Attempt[], userId: number) {
  if (event.classroom_version !== 1) return null;
  const warmup = event.phase !== 'official';
  const eligible = challenges.filter(c => warmup
    ? (event.warmup_ids || []).includes(c.id)
    : !(event.warmup_ids || []).includes(c.id) && !(event.hidden_ids || []).includes(c.id) && !(event.hidden_levels || []).includes(c.data.level));
  if (!eligible.length) return null;
  const own = eligible.map(c => attempts.find(a => a.owner === userId && a.data.challenge_id === c.id));
  const sent = own.filter(a => a?.data.status === 'submitted' || a?.data.status === 'validated' || a?.data.status === 'rejected').length;
  const pending = own.filter(a => a?.data.status === 'submitted').length;
  return { warmup, total: eligible.length, sent, pending, complete: sent === eligible.length };
}
