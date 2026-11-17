import type { EventDetail } from '../types/sdk';

export type ImportReceipt = { id: string; status: 'created' | 'existing' };
export type ImportClaim = { index: number; externalId: string; receipt: ImportReceipt };

export function importReceipt(value: unknown): ImportReceipt {
  const r = value as Partial<ImportReceipt> | null;
  if (!r || typeof r.id !== 'string' || !/^[a-f0-9]{64}$/.test(r.id) || !['created', 'existing'].includes(r.status || '')) {
    throw new Error('O site não confirmou o envio da questão. Retome a importação para conferir sem duplicar.');
  }
  return r as ImportReceipt;
}

export function confirmImports(detail: EventDetail, eventId: string, claims: ImportClaim[]) {
  if (detail.event.id !== eventId) throw new Error('A conferência retornou outro evento. Selecione novamente o evento correto.');
  const records = new Map(detail.challenges.map(c => [c.id, c]));
  const confirmed: number[] = [], missing: number[] = [];
  for (const claim of claims) {
    const c = records.get(claim.receipt.id);
    if (c?.kind === 'challenge' && c.parent === eventId && c.data.import_info?.external_id === claim.externalId) confirmed.push(claim.index);
    else missing.push(claim.index);
  }
  return { confirmed, missing };
}
