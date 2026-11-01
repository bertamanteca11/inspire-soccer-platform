import type { Bonus, IndexMetric, Metrics, Parameters } from './types';

export const VERIFIED_PARAMETERS: Parameters = {
  baseCents: 1000, doubledCents: 2000, doubleFrom: 8, cleanSheetMinutes: 65,
  comparisonMargin: 0.1, teamAverageMinutes: 10,
  weights: { goals: 10, assists: 6, chances: 3, shots: 2, tackles: 2,
    interceptions: 2, recoveries: 2, saves: 3, dribbles: 1,
    successfulPasses: 0.2, failedPasses: -0.1, yellowCards: -3, redCards: -8 },
};

// Excel ROUND ties go away from zero, unlike Math.round on negative numbers.
export function excelRound(value: number, decimals = 0): number {
  const scale = 10 ** decimals;
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON * Math.max(1, Math.abs(value))) * scale) / scale;
}

export function effectiveMinutes(calledUp: boolean | null, fcf: number | null, veo: number | null): number | null {
  if (calledUp === null) return null;
  return calledUp ? (veo ?? fcf ?? 0) : 0;
}

export function passingStats(passes: number | null, successful: number | null) {
  return {
    failedPasses: passes === null || successful === null ? null : passes - successful,
    passingRate: passes === null || passes === 0 || successful === null ? null : successful / passes,
  };
}

export function performanceIndex(metrics: Metrics, participated: boolean | null, parameters: Parameters | null): number | null {
  if (!participated || !parameters) return null;
  const { weights } = parameters;
  const direct = Object.keys(weights).filter(key => key !== 'successfulPasses' && key !== 'failedPasses') as Exclude<IndexMetric, 'successfulPasses' | 'failedPasses'>[];
  let score = direct.reduce((total, key) => total + (metrics[key] ?? 0) * weights[key], 0);
  if (metrics.successfulPasses === null) score += (metrics.passes ?? 0) * weights.successfulPasses;
  else score += metrics.successfulPasses * weights.successfulPasses
    + ((metrics.passes ?? 0) - metrics.successfulPasses) * weights.failedPasses;
  return excelRound(score, 1);
}

export function occurrenceBonusCents(previous: number, current: number, paid: boolean, parameters = VERIFIED_PARAMETERS): number {
  if (![previous, current].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Contadores de primas inválidos.');
  if (!paid) return 0;
  const offset = parameters.doubleFrom - 1;
  const doubled = Math.max(0, previous + current - offset) - Math.max(0, previous - offset);
  return current * parameters.baseCents + doubled * (parameters.doubledCents - parameters.baseCents);
}

export function calculateBonus(input: {
  previousCleanSheets: number; previousGoals: number; previousAssists: number;
  eligible: boolean | null; minutes: number | null; goalsFor: number | null;
  goalsAgainst: number | null; goals: number | null; assists: number | null;
}, parameters = VERIFIED_PARAMETERS): Bonus {
  const paid = input.goalsFor !== null && input.goalsAgainst !== null && input.goalsFor >= input.goalsAgainst;
  const cleanSheetOccurrence = input.eligible === true && input.goalsAgainst === 0
    && input.minutes !== null && input.minutes > parameters.cleanSheetMinutes ? 1 : 0;
  const cleanSheetCents = occurrenceBonusCents(input.previousCleanSheets, cleanSheetOccurrence, paid, parameters);
  const goalsCents = occurrenceBonusCents(input.previousGoals, input.goals ?? 0, paid, parameters);
  const assistsCents = occurrenceBonusCents(input.previousAssists, input.assists ?? 0, paid, parameters);
  return { previousCleanSheets: input.previousCleanSheets, previousGoals: input.previousGoals,
    previousAssists: input.previousAssists, cleanSheetOccurrence, cleanSheetCents,
    goalsCents, assistsCents, totalCents: cleanSheetCents + goalsCents + assistsCents };
}

// Missing data remains missing when ALL observations lack the metric.
export function sumKnown(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}
