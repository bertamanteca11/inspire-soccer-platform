import type { Player } from '../types';
import type { AppSession } from './appTypes';
import { attendanceDraft, type AttendanceDraft } from './attendanceDrafts';
import type { Attendance } from '../types';

export type CallupChoice = { status: string; evaluable: boolean };
export function usesDraftDefaults(session: AppSession): boolean {
  return session.draft_defaults_version === 1;
}
export function defaultCallup(player: Player): CallupChoice {
  return { status: player.status === 'trial' ? 'trial' : player.status === 'guest' ? 'guest_not_evaluable' : 'called_up', evaluable: player.status !== 'guest' };
}
export function callupDraft(session: AppSession, player: Player, rows: (CallupChoice & { player_id: string })[]): CallupChoice | null {
  const matches = rows.filter(row => row.player_id === player.id);
  if (matches.length === 1) return { status: matches[0].status, evaluable: matches[0].evaluable };
  if (matches.length || session.callup_confirmed || !usesDraftDefaults(session) || !['active','injured','trial','guest'].includes(player.status)) return null;
  return defaultCallup(player);
}
export function operationalAttendanceDraft(session: AppSession, playerId: string, rows: Attendance[], called: boolean): AttendanceDraft {
  const matches = rows.filter(row => row.session_id === session.id && row.player_id === playerId);
  if (matches.length) return attendanceDraft(rows, session.id, playerId);
  return { status: usesDraftDefaults(session) && session.callup_confirmed && !session.attendance_confirmed && called ? 'present' : '', notes: '' };
}
export function attendanceSnapshot(rows: { player_id: string; status: string; notes?: string | null }[]): string {
  return JSON.stringify(rows.map(row => ({ player_id: row.player_id, status: row.status, notes: row.notes || null })).sort((a,b) => a.player_id.localeCompare(b.player_id)));
}
