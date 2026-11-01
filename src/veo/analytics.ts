import { calculateBonus, effectiveMinutes, excelRound, performanceIndex, passingStats, sumKnown, VERIFIED_PARAMETERS } from './calculations';
import { normalizeIdentity } from './schema';
import type { Bonus, Metrics, Preview, TeamStats } from './types';

export type PlayerFact = {
  playerKey: string; playerId: string | null; sourceKey: string; jersey: number | null;
  name: string; fullName: string; position: string | null; group: string | null;
  eligible: boolean | null; profile: string | null; calledUp: boolean; starter: boolean;
  fcfMinutes: number | null; veoMinutes: number | null; metrics: Metrics; notes: string | null;
};
export type AnalyticsMatch = {
  id: string; namespace: string; season: string; round: number; date: string; opponent: string;
  venue: string; goalsFor: number | null; goalsAgainst: number | null;
  manualMvp: string | null; manualMvpReason: string | null; notes: string | null;
  field: string | null; fcfReference: string | null; coach: string | null;
  sessionId: string | null; revision: number; batchId: string | null; active: boolean;
  teams: Pick<TeamStats, 'inspire' | 'opponent'>[]; players: PlayerFact[];
};
export type ComputedFact = PlayerFact & {
  match: AnalyticsMatch; minutes: number; participated: boolean; index: number | null;
  passingRate: number | null; bonus: Bonus | null; bonusExcluded: boolean;
};
export type PlayerSeason = {
  key: string; playerId: string | null; name: string; fullName: string;
  facts: ComputedFact[]; appearances: number; calledUp: number; starters: number;
  fcfMinutes: number | null; veoMinutes: number | null; minutes: number | null;
  totals: Metrics; averages: Metrics; maximumSpeed: number | null; weightedSpeed: number | null;
  passingRate: number | null; index: number | null; bonusCents: number | null;
};
export type SeasonAnalytics = {
  matches: AnalyticsMatch[]; facts: ComputedFact[]; players: PlayerSeason[];
  bonusStart: number | null; missingRounds: number[]; historyComplete: boolean;
  bonusCents: number | null;
};

export function inferSeason(preview: Pick<Preview, 'sourceCells'>): string | null {
  for (const cell of preview.sourceCells.filter(c => c.address === 'A1')) {
    const match = /\b(20\d{2})\s*[\/–-]\s*(20\d{2}|\d{2})\b/.exec(String(cell.value));
    if (match) return `${match[1]}-${match[2].length === 2 ? match[1].slice(0, 2) + match[2] : match[2]}`;
  }
  return null;
}

export function bonusStartRound(season: string): number | null {
  // Explicit confirmed rule, independent of the sporting-statistics period.
  return season === '2026-2027' ? 5 : null;
}

export function previewMatches(preview: Preview, season = inferSeason(preview) || 'Sin temporada', namespace = 'local'): AnalyticsMatch[] {
  return preview.matches.map(({ match, players, teams }) => ({
    id: `local:${namespace}:${season}:${match.round}:${match.row}`, namespace, season,
    round: match.round ?? 0, date: match.date || '', opponent: match.opponent || 'Sin rival',
    venue: match.venue || '', goalsFor: match.goalsFor, goalsAgainst: match.goalsAgainst,
    manualMvp: match.manualMvp, manualMvpReason: match.manualMvpReason, notes: match.notes,
    field: match.field, fcfReference: match.fcfReference, coach: match.coach,
    sessionId: null, revision: 0, batchId: null, active: true,
    teams: teams.map(({ inspire, opponent }) => ({ inspire, opponent })),
    players: players.map(p => ({
      playerKey: `local:${normalizeIdentity(p.roster?.fullName || '') || `row-${p.row}`}`,
      playerId: null, sourceKey: normalizeIdentity(p.roster?.fullName || ''),
      jersey: p.jersey, name: p.name || 'Sin identificar', fullName: p.roster?.fullName || '',
      position: p.roster?.position || null, group: p.roster?.group || null,
      eligible: p.roster?.cleanSheetEligible ?? null, profile: p.profile,
      calledUp: p.calledUp === true, starter: p.starter === true,
      fcfMinutes: p.fcfMinutes, veoMinutes: p.veoMinutes, metrics: { ...p.metrics }, notes: p.notes,
    })),
  }));
}

const mean = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};

export function seasonAnalytics(input: readonly AnalyticsMatch[], season: string, namespace?: string, financialAllowed = true): SeasonAnalytics {
  const matches = input.filter(m => m.active && m.season === season && (!namespace || m.namespace === namespace))
    .sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
  const start = bonusStartRound(season);
  const rounds = new Set(matches.filter(m => start !== null && m.round >= start).map(m => m.round));
  const last = rounds.size ? Math.max(...rounds) : (start ?? 1) - 1;
  const missingRounds = start === null ? [] : Array.from({ length: Math.max(0, last - start + 1) }, (_, i) => start + i).filter(r => !rounds.has(r));
  const previous = new Map<string, { clean: number; goals: number; assists: number; incomplete: boolean }>();
  const facts: ComputedFact[] = [];
  for (const match of matches) for (const player of match.players) {
    const minutes = effectiveMinutes(player.calledUp, player.fcfMinutes, player.veoMinutes) ?? 0;
    const participated = minutes > 0;
    const counterKey = `${match.namespace}:${player.playerKey}`;
    const counts = previous.get(counterKey) || { clean: 0, goals: 0, assists: 0, incomplete: false };
    const excluded = start !== null && match.round < start;
    const missing = (participated && (player.metrics.goals === null || player.metrics.assists === null || player.eligible === null))
      || (!participated && ((player.metrics.goals ?? 0) > 0 || (player.metrics.assists ?? 0) > 0));
    let bonus: Bonus | null = null;
    if (financialAllowed && start !== null && !excluded && !counts.incomplete && !missing) {
      bonus = calculateBonus({ previousCleanSheets: counts.clean, previousGoals: counts.goals,
        previousAssists: counts.assists, eligible: player.eligible, minutes,
        goalsFor: match.goalsFor, goalsAgainst: match.goalsAgainst,
        goals: player.metrics.goals, assists: player.metrics.assists });
    } else if (financialAllowed && excluded) {
      bonus = { previousCleanSheets: 0, previousGoals: 0, previousAssists: 0,
        cleanSheetOccurrence: 0, cleanSheetCents: 0, goalsCents: 0, assistsCents: 0, totalCents: 0 };
    }
    if (!excluded && start !== null) previous.set(counterKey, {
      clean: counts.clean + (player.eligible === true && match.goalsAgainst === 0
        && minutes > VERIFIED_PARAMETERS.cleanSheetMinutes ? 1 : 0), goals: counts.goals + (player.metrics.goals ?? 0),
      assists: counts.assists + (player.metrics.assists ?? 0), incomplete: counts.incomplete || missing,
    });
    facts.push({ ...player, match, minutes, participated, index: performanceIndex(player.metrics, participated, VERIFIED_PARAMETERS),
      passingRate: passingStats(player.metrics.passes, player.metrics.successfulPasses).passingRate,
      bonus, bonusExcluded: excluded });
  }
  const grouped = new Map<string, ComputedFact[]>();
  for (const fact of facts) grouped.set(fact.playerKey, [...(grouped.get(fact.playerKey) || []), fact]);
  const players: PlayerSeason[] = [...grouped.entries()].map(([key, rows]) => {
    const totals = Object.fromEntries(Object.keys(rows[0].metrics).map(metric => [metric, sumKnown(rows.map(f => f.metrics[metric as keyof Metrics]))])) as Metrics;
    const averages = Object.fromEntries(Object.keys(totals).map(metric => [metric, mean(rows.filter(f => f.participated).map(f => f.metrics[metric as keyof Metrics]))])) as Metrics;
    const speeds = rows.map(f => f.metrics.maxSpeedKmh).filter((v): v is number => v !== null);
    const weighted = rows.filter(f => f.minutes > 0 && f.metrics.averageSpeedKmh !== null);
    const passRows = rows.filter(f => f.metrics.successfulPasses !== null);
    const passes = sumKnown(passRows.map(f => f.metrics.passes));
    return { key, playerId: rows[0].playerId, name: rows[rows.length - 1].name, fullName: rows[0].fullName,
      facts: rows, appearances: rows.filter(f => f.participated).length, calledUp: rows.filter(f => f.calledUp).length,
      starters: rows.filter(f => f.starter).length, fcfMinutes: sumKnown(rows.map(f => f.fcfMinutes)),
      veoMinutes: sumKnown(rows.map(f => f.veoMinutes)), minutes: sumKnown(rows.map(f => f.minutes)),
      totals, averages, maximumSpeed: speeds.length ? Math.max(...speeds) : null,
      weightedSpeed: weighted.length ? weighted.reduce((sum, f) => sum + f.metrics.averageSpeedKmh! * f.minutes, 0) / weighted.reduce((sum, f) => sum + f.minutes, 0) : null,
      passingRate: passes ? (sumKnown(passRows.map(f => f.metrics.successfulPasses)) ?? 0) / passes : null,
      index: mean(rows.map(f => f.index)) === null ? null : excelRound(mean(rows.map(f => f.index))!, 1),
      bonusCents: rows.some(f => f.bonus === null) ? null : rows.reduce((sum, f) => sum + f.bonus!.totalCents, 0),
    };
  });
  return { matches, facts, players, bonusStart: start, missingRounds,
    historyComplete: start !== null && rounds.size > 0 && missingRounds.length === 0,
    bonusCents: facts.some(f => f.bonus === null) ? null : sumKnown(facts.map(f => f.bonus!.totalCents)) };
}

export type RankingMetric = keyof Metrics | 'minutes' | 'fcfMinutes' | 'veoMinutes' | 'index' | 'passingRate';
export function rankingValue(player: PlayerSeason, metric: RankingMetric, mode: 'total' | 'average' = 'total'): number | null {
  if (metric === 'maxSpeedKmh') return player.maximumSpeed;
  if (metric === 'averageSpeedKmh') return player.weightedSpeed;
  if (['minutes', 'fcfMinutes', 'veoMinutes', 'index', 'passingRate'].includes(metric)) return player[metric as 'minutes' | 'index' | 'passingRate'];
  return (mode === 'average' ? player.averages : player.totals)[metric as keyof Metrics];
}
export function rankPlayers(players: readonly PlayerSeason[], metric: RankingMetric, mode: 'total' | 'average' = 'total') {
  return players.map(player => ({ player, value: rankingValue(player, metric, mode) }))
    .filter((row): row is { player: PlayerSeason; value: number } => row.value !== null)
    .sort((a, b) => b.value - a.value || a.player.fullName.localeCompare(b.player.fullName, 'es'));
}
