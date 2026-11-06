import { STORED_SCORE_FIELDS } from './evaluationScores';

// Compare the reviewed sporting fields, not server-maintained timestamps/totals.
// Keep every stored row: duplicate rows must never collapse into a valid snapshot.
export function evaluationSnapshot(rows: readonly Record<string, any>[]): string {
  return JSON.stringify(rows.map(row => ({
    id: row.id, session_id: row.session_id, player_id: row.player_id,
    evaluated: row.evaluated === true, not_applicable: row.not_applicable === true,
    comment: row.comment || null,
    scores: STORED_SCORE_FIELDS.map(field => [field, row[field] ?? null, row.na_fields?.[field] === true]),
  })).sort((a,b) => String(a.id).localeCompare(String(b.id)) || String(a.player_id).localeCompare(String(b.player_id))));
}
