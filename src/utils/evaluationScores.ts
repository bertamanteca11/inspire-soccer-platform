// N/A applies to individual qualities, not the whole player.
export const SCORE_FIELDS = ['tactical_discipline','effort_commitment','decision_making','mentality_attitude','coachability'] as const;
export function isFieldNA(e: any, field: string): boolean { return Boolean(e?.not_applicable || e?.na_fields?.[field] === true); }
export function fieldScore(e: any, field: string): number | null {
  if (!e || isFieldNA(e,field) || e[field] == null) return null;
  const n=Number(e[field]); return Number.isFinite(n)?n:null;
}
export function evaluationTotal(e: any): number | null {
  if (!e || e.not_applicable) return null;
  const scores=SCORE_FIELDS.map(k=>fieldScore(e,k)).filter((n):n is number=>n!==null);
  return scores.length?Number((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(2)):null;
}
