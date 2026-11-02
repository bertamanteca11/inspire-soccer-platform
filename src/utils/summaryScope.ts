import type { AttendanceRecord } from './attendance';
import { uniqueAttendanceRecords } from './attendance';

export type SummarySession = {
  id: string; name: string; session_date: string; status: string; type: string;
  is_test?: boolean | null;
  records_only_confirmed?: boolean | null;
};
export type SummaryScope = { mode: 'history' | 'period' | 'session'; from: string; to: string; sessionIds: string[] };

// A tryout is real sporting activity, not automatically disposable test data.
// No name heuristic or production UUID is used to classify records.
export function operationalExclusion(session: SummarySession): string | null {
  if (session.status !== 'completed') return session.status === 'archived' ? 'Archivada' : session.status === 'planned' ? 'Planificada' : 'Estado no completado';
  if (session.is_test === true || ['test', 'trial', 'demo'].includes(session.type)) return 'Sesión de prueba';
  if (!['training', 'league_match', 'friendly_match', 'scrimmage', 'tryout'].includes(session.type)) return 'Tipo sin revisar';
  return null;
}

export function sessionsInScope(sessions: readonly SummarySession[], scope: SummaryScope): SummarySession[] {
  if (scope.mode === 'history') return [...sessions];
  const ids = new Set(scope.sessionIds);
  if (scope.mode === 'session') return sessions.filter(s => ids.has(s.id));
  if (scope.from && scope.to && scope.from > scope.to) return [];
  return sessions.filter(s => ids.has(s.id) && !operationalExclusion(s)
    && (!scope.from || s.session_date >= scope.from) && (!scope.to || s.session_date <= scope.to));
}

export function recordsInScope<T extends { session_id?: string; player_id?: string }>(
  records: readonly T[], sessions: readonly SummarySession[], mode: SummaryScope['mode'], playerId = '',
): T[] {
  const ids = new Set(sessions.map(s => s.id));
  // History also preserves records whose session is inaccessible or missing.
  return records.filter(r => (mode === 'history' || !!r.session_id && ids.has(r.session_id))
    && (!playerId || r.player_id === playerId));
}

export function attendanceTrace(sessions: readonly SummarySession[], rows: readonly AttendanceRecord[], playerId = '') {
  const records = uniqueAttendanceRecords(rows).filter(r => !playerId || r.player_id === playerId);
  return sessions.map(session => {
    const attendance = records.filter(r => r.session_id === session.id);
    const players = attendance.map(r => r.player_id);
    return { session, attendance, duplicate: new Set(players).size !== players.length };
  });
}

export function summaryCardTotals(cards: readonly { player_id: string; type: string; players?: { display_name?: string } | null }[]) {
  const grouped = new Map<string, { player_id: string; display_name: string; yellow_cards: number; red_cards: number; total_cards: number }>();
  for (const card of cards) {
    const total = grouped.get(card.player_id) || { player_id: card.player_id, display_name: card.players?.display_name || 'Jugador', yellow_cards: 0, red_cards: 0, total_cards: 0 };
    total.yellow_cards += card.type === 'yellow' ? 1 : card.type === 'double_yellow' ? 2 : 0;
    total.red_cards += ['straight_red', 'double_yellow'].includes(card.type) ? 1 : 0;
    total.total_cards++;
    grouped.set(card.player_id, total);
  }
  return [...grouped.values()];
}
