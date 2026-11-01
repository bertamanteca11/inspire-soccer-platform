// Read-only statistics. Never infer attendance from callups or missing records.
export type AttendanceRecord = {
  id?: string;
  player_id?: string;
  session_id?: string;
  status?: string | null;
  players?: { display_name?: string } | null;
};

export function isUnjustifiedAbsence(status?: string | null): boolean {
  return status === 'unjustified_absence' || status === 'injured_unjustified_absence';
}

export function isJustifiedAbsence(status?: string | null): boolean {
  return status === 'justified_absence' || status === 'injured_justified_absence';
}

// Collapse repeated copies of the SAME database row (e.g. a repeated join).
// Distinct stored IDs remain distinct explicit records; do not silently repair data.
export function uniqueAttendanceRecords<T extends AttendanceRecord>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter(row => {
    if (!row.id) return true;
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export function attendanceStats(rows: readonly AttendanceRecord[]) {
  const records = uniqueAttendanceRecords(rows);
  const count = (status: string) => records.filter(row => row.status === status).length;
  const present = count('present');
  const late = count('late');
  const justifiedLate = count('justified_late');
  const justifiedAbsences = records.filter(row => isJustifiedAbsence(row.status)).length;
  const unjustifiedAbsences = records.filter(row => isUnjustifiedAbsence(row.status)).length;
  const injuredPresent = count('injured_present');
  const injuredJustifiedAbsences = count('injured_justified_absence');
  const injuredUnjustifiedAbsences = count('injured_unjustified_absence');
  const legacyInjured = count('injured');
  const unrecorded = records.filter(row => !row.status).length;
  const knownStatuses = new Set(['present', 'late', 'justified_late',
    'justified_absence', 'unjustified_absence', 'injured_present',
    'injured_justified_absence', 'injured_unjustified_absence', 'injured']);
  const unknown = records.filter(row => row.status && !knownStatuses.has(row.status)).length;
  return { recorded: records.length, present, late, justifiedLate,
    lateTotal: late + justifiedLate, justifiedAbsences, unjustifiedAbsences,
    absences: justifiedAbsences + unjustifiedAbsences, injuredPresent,
    injuredJustifiedAbsences, injuredUnjustifiedAbsences, legacyInjured,
    unrecorded, unknown };
}

// Injury absence subtotals are explicitly identified as subsets, not added twice.
export const ATTENDANCE_METRICS = [
  ['present', 'Presente'],
  ['late', 'Tarde'],
  ['justifiedLate', 'Tarde justificado'],
  ['justifiedAbsences', 'Ausencias justificadas (incluye lesión)'],
  ['unjustifiedAbsences', 'Ausencias injustificadas (incluye lesión)'],
  ['injuredPresent', 'Lesionado presente (fisio)'],
  ['injuredJustifiedAbsences', 'De las justificadas: por lesión'],
  ['injuredUnjustifiedAbsences', 'De las injustificadas: por lesión'],
  ['legacyInjured', 'Lesionado sin especificar (estado antiguo)'],
  ['unrecorded', 'Registros sin estado'],
  ['unknown', 'Otros estados sin clasificar'],
] as const;

export type AttendanceMetric = typeof ATTENDANCE_METRICS[number][0];

export function attendanceRanking(rows: readonly AttendanceRecord[], metric: AttendanceMetric) {
  const grouped = new Map<string, { playerId: string; name: string; rows: AttendanceRecord[] }>();
  for (const row of uniqueAttendanceRecords(rows)) {
    if (!row.player_id) continue;
    if (!grouped.has(row.player_id)) grouped.set(row.player_id, {
      playerId: row.player_id, name: row.players?.display_name || 'Jugador', rows: [],
    });
    grouped.get(row.player_id)!.rows.push(row);
  }
  return [...grouped.values()].map(group => ({ playerId: group.playerId,
    name: group.name, count: attendanceStats(group.rows)[metric] }))
    .filter(row => row.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es')
      || a.playerId.localeCompare(b.playerId));
}

// Use actual returned length so a server page cap below 500 does not truncate
// the season. On error discard partial results rather than reporting partial totals.
export async function readAttendancePages<T extends AttendanceRecord>(
  readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let offset = 0; ; ) {
    const result = await readPage(offset, offset + 499);
    if (result.error) return { data: [], error: result.error };
    if (!result.data?.length) return { data: uniqueAttendanceRecords(rows), error: null };
    rows.push(...result.data);
    offset += result.data.length;
  }
}
