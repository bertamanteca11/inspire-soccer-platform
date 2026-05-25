import type { Evaluation } from '../types';
import type { PlayerCardTotal } from './appTypes';
import { ratingFields } from './appTypes';

export function getRatingCounts(evaluations: Evaluation[]) {
  const result: { high: Record<string, number>; low: Record<string, number> } = { high: {}, low: {} };
  ratingFields.forEach(([field]) => {
    result.high[field] = evaluations.filter((e: any) => Number(e[field]) >= 4).length;
    result.low[field] = evaluations.filter((e: any) => Number(e[field]) > 0 && Number(e[field]) <= 2).length;
  });
  return result;
}

export function getCardWarnings(cardTotals: PlayerCardTotal[]) {
  return [...(cardTotals || [])]
    .filter((c) => Number(c.yellow_cards) >= 3 || Number(c.red_cards) >= 1 || Number(c.total_cards) > 0)
    .sort((a, b) => (Number(b.red_cards) * 10 + Number(b.yellow_cards)) - (Number(a.red_cards) * 10 + Number(a.yellow_cards)));
}

export function average(values: number[]) {
  const clean = values.filter(v => Number.isFinite(v));
  if (!clean.length) return 0;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}
