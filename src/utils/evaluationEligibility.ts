import { evaluationTotal, fieldScore, SCORE_FIELDS } from './evaluationScores';
import { isOfficialPerformanceSession } from './performance';

export type EligibilityRow = { id?: string; session_id?: string; player_id?: string; status?: string | null; evaluable?: boolean | null };
export type SportingSession = { id: string; session_date: string; type: string; status: string; records_only_confirmed?: boolean | null; is_test?: boolean | null };
export type SportingEvaluation = Record<string, any> & { id: string; session_id: string; player_id: string };

export function distinctRows<T extends { id?: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter(r => { if (!r.id) return true; if (seen.has(r.id)) return false; seen.add(r.id); return true; });
}
export function eligibilityReason(sessionId: string, playerId: string, callups: readonly EligibilityRow[], attendance: readonly EligibilityRow[]): string | null {
  const calls = distinctRows(callups).filter(r => r.session_id === sessionId && r.player_id === playerId);
  const visits = distinctRows(attendance).filter(r => r.session_id === sessionId && r.player_id === playerId);
  if (calls.length !== 1) return calls.length ? 'Convocatoria duplicada' : 'Sin convocatoria verificable';
  if (calls[0].evaluable !== true || !['called_up', 'trial'].includes(calls[0].status || '')) return 'Convocatoria no evaluable o sin confirmar su elegibilidad';
  if (visits.length !== 1) return visits.length ? 'Asistencia duplicada' : 'Sin asistencia verificable';
  if (!['present', 'late', 'justified_late'].includes(visits[0].status || '')) return 'Sin participación deportiva registrada';
  return null;
}
export function isSportingActivity(session?: SportingSession | null): boolean {
  return !!session && session.is_test !== true && ['training','league_match','friendly_match','scrimmage','tryout'].includes(session.type);
}
export function isOperationalPerformanceSession(session?: SportingSession | null): boolean {
  return isCompletedSportingSession(session) && isOfficialPerformanceSession(session);
}
export function isCompletedSportingSession(session?: SportingSession | null): boolean { return isSportingActivity(session) && session!.status === 'completed'; }

export function operationalStandouts<T extends { id?: string; session_id: string; player_id: string; category: string; rank?: number }>(rows: readonly T[], sessions: readonly SportingSession[]) {
  const unique = distinctRows(rows), sessionMap = new Map(sessions.map(s => [s.id,s]));
  return unique.filter(row => isOperationalPerformanceSession(sessionMap.get(row.session_id))
    && ['top','bottom'].includes(row.category) && [1,2].includes(row.rank || 0)
    && unique.filter(r => r.session_id === row.session_id && r.player_id === row.player_id).length === 1
    && unique.filter(r => r.session_id === row.session_id && r.category === row.category && r.rank === row.rank).length === 1);
}

export function countableEvaluations<T extends SportingEvaluation>(rows: readonly T[], sessions: readonly SportingSession[], callups: readonly EligibilityRow[], attendance: readonly EligibilityRow[]) {
  const unique = distinctRows(rows);
  const grouped = new Map<string, number>();
  for (const row of unique) { const key = row.session_id + ':' + row.player_id; grouped.set(key, (grouped.get(key) || 0) + 1); }
  const sessionMap = new Map(sessions.map(s => [s.id, s]));
  const index = (records: readonly EligibilityRow[]) => {
    const groups = new Map<string,EligibilityRow[]>();
    for (const record of distinctRows(records)) { const key = record.session_id + ':' + record.player_id; (groups.get(key) || (groups.set(key,[]), groups.get(key)!)).push(record); }
    return groups;
  };
  const calls = index(callups), visits = index(attendance);
  const evaluations: (T & { sessions: SportingSession; session: SportingSession })[] = [];
  const excluded: { row: T; reason: string }[] = [];
  for (const row of unique) {
    const session = sessionMap.get(row.session_id);
    const reason = grouped.get(row.session_id + ':' + row.player_id)! > 1 ? 'Evaluación duplicada'
      : !isOperationalPerformanceSession(session) ? 'Sesión fuera del rendimiento operativo'
      : row.evaluated !== true ? 'Evaluación sin confirmar'
      : eligibilityReason(row.session_id, row.player_id, calls.get(row.session_id+':'+row.player_id) || [], visits.get(row.session_id+':'+row.player_id) || [])
      || (evaluationTotal(row) === null ? 'Sin puntuaciones válidas o N/A' : null);
    if (reason || !session) excluded.push({ row, reason: reason || 'Sin sesión verificable' });
    else evaluations.push({ ...row, sessions: session, session });
  }
  return { evaluations, excluded };
}

export function playerPerformanceAverages(rows: readonly SportingEvaluation[]) {
  const grouped = new Map<string, { player_id: string; name: string; scores: number[]; fields: Record<string, number[]> }>();
  for (const row of rows) {
    const total = evaluationTotal(row);
    if (total === null) continue;
    const player = grouped.get(row.player_id) || { player_id: row.player_id, name: row.players?.display_name || row.player_id, scores: [] as number[], fields: {} as Record<string,number[]> };
    player.scores.push(total);
    for (const field of SCORE_FIELDS) { const score = fieldScore(row, field); if (score !== null) (player.fields[field] ||= []).push(score); }
    grouped.set(row.player_id, player);
  }
  return [...grouped.values()].map(p => ({ ...p, count: p.scores.length, average: p.scores.reduce((a,b) => a+b,0) / p.scores.length }))
    .sort((a,b) => b.average-a.average || a.name.localeCompare(b.name,'es') || a.player_id.localeCompare(b.player_id));
}

export function ratingLimit(value: unknown, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('Límite de puntuación inválido; revisar la sesión.');
  return value;
}
export function newEvaluationDraft() {
  return { evaluated: false, na_fields: Object.fromEntries(SCORE_FIELDS.map(field => [field,true])) };
}
