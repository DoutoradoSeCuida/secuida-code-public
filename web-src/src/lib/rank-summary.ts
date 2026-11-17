import type { RaceData } from '../types/sdk';
export function rankSummary(data: RaceData, userId: number, teamId?: string) {
  const individual=data.rows.find(row=>row.user_id===userId) || null;
  const team=teamId ? data.teams?.find(row=>row.id===teamId) || null : null;
  return {individual,team};
}
