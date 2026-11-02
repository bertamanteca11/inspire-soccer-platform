import type { AttendanceRecord } from './attendance';
import { uniqueAttendanceRecords } from './attendance';

export type AttendanceDraft = { status: string; notes: string };
export function attendanceDraft(rows: readonly (AttendanceRecord & { notes?: string | null })[], sessionId: string, playerId: string): AttendanceDraft {
  const matches = uniqueAttendanceRecords(rows).filter(r => r.session_id === sessionId && r.player_id === playerId);
  // Conflicting database records require review; never pick an arbitrary one.
  return matches.length === 1 ? { status: matches[0].status || '', notes: matches[0].notes || '' } : { status: '', notes: '' };
}
