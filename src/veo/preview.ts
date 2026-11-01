import { calculateBonus, effectiveMinutes, excelRound, passingStats, performanceIndex, sumKnown } from './calculations';
import { METRIC_LABELS, normalizeIdentity, SUMMARY_PAIRS, TEAM_PAIRS } from './schema';
import { cachedNumber, isBlank } from './values';
import { bonusStartRound, inferSeason } from './analytics';
import type { CalculatedObservation, Comparison, Issue, Match, MatchPreview, Observation, Parameters,
  Preview, RosterPlayer, SourceCell, TeamStats, Totals } from './types';

type Parsed = {
  roster: RosterPlayer[]; matches: Match[]; observations: Observation[]; teams: TeamStats[];
  parameters: Parameters | null; parameterCells: SourceCell[]; sourceCells: SourceCell[];
  sheets: Preview['sheets']; issues: Issue[];
};

export function pilotChecks(match: Match, players: CalculatedObservation[], totals: Totals): Comparison[] {
  if (match.round !== 5 || match.date !== '2026-10-18' || !normalizeIdentity(match.opponent || '').includes('alzamora')) return [];
  // Regression references ONLY. All actual values come from parsed source data.
  const eloy = players.filter(p => normalizeIdentity(p.roster?.fullName || '') === 'eloy ocana ble');
  const checks: [string, number, number | null][] = [
    ['Observaciones', 23, totals.observations], ['Convocados', 20, totals.calledUp],
    ['Participantes', 15, totals.participants], ['Titulares', 11, totals.starters],
    ['Minutos FCF', 990, totals.fcfMinutes], ['Minutos efectivos', 1089, totals.effectiveMinutes],
    ['Goles individuales', 3, totals.goals], ['Goles Inspire (FCF)', 3, match.goalsFor],
    ['Goles rival (FCF)', 3, match.goalsAgainst], ['Amarillas', 1, totals.yellowCards],
    ['Distancia (km)', 112.9, totals.distanceKm], ['Sprints', 70, totals.sprints],
    ['Índice Eloy', 61.1, eloy.length === 1 ? eloy[0].index : null],
    ['Primas del historial importado (€)', 30, totals.bonusCents === null ? null : totals.bonusCents / 100],
  ];
  return checks.map(([label, expected, actual]) => ({ label, expected, actual,
    matches: actual !== null && Math.abs(actual - expected) < 1e-7 }));
}

export function buildPreview(parsed: Parsed): Preview {
  const issues = [...parsed.issues];
  const bonusStart = bonusStartRound(inferSeason(parsed) || '');
  const add = (severity: Issue['severity'], code: string, sheet: string, cell: string, message: string) => {
    issues.push({ severity, code, sheet, cell, message });
  };
  add('warning', 'imported-history-only', 'Instrucciones', 'A29',
    'Importes calculados, no pagos. En 2026–2027 los contadores empiezan en J5: J1–J4 nunca acumulan primas. La integridad de J5 en adelante depende de los partidos importados.');
  add('info', 'unmapped-identities', 'Plantilla', 'A1',
    'Ningún jugador o partido se ha vinculado a UUIDs de Supabase. Las coincidencias dentro del libro no confirman identidades externas.');
  const cachedStrings = parsed.sourceCells.filter(c => c.formula && typeof c.value === 'string' && cachedNumber(c.value) !== null).length;
  if (cachedStrings) add('warning', 'text-formula-caches', '', '',
    `${cachedStrings} resultados de fórmulas están guardados como texto. Se comparan como referencia; no se ejecutan fórmulas Excel ni se usan esas cachés como entradas.`);

  const observations: CalculatedObservation[] = parsed.observations.map(input => {
    const minutes = input.valid ? effectiveMinutes(input.calledUp, input.fcfMinutes, input.veoMinutes) : null;
    const participated = minutes === null ? null : minutes > 0;
    const passing = passingStats(input.metrics.passes, input.metrics.successfulPasses);
    const missingIndexInputs = Object.keys(parsed.parameters?.weights || {}).filter(key => {
      if (key === 'failedPasses' || key === 'successfulPasses') return false;
      return input.metrics[key as keyof Observation['metrics']] === null;
    });
    if (input.metrics.successfulPasses === null) missingIndexInputs.push('successfulPasses (se usa el total de pases)');
    if (input.metrics.passes === null) missingIndexInputs.push('passes');
    if (participated && missingIndexInputs.length) add('warning', 'partial-index', 'Datos por partido', `AP${input.row}`,
      `${input.name || 'Jugador'}: índice con entradas pendientes (${missingIndexInputs.map(key => METRIC_LABELS[key] || 'Pases exitosos (se usa el total)').join(', ')}). La fórmula aporta cero por los datos ausentes; las entradas se conservan vacías.`);
    if (participated && bonusStart !== null && input.round! >= bonusStart && (input.metrics.goals === null || input.metrics.assists === null)) add('warning', 'incomplete-bonus-input', 'Datos por partido', `N${input.row}`,
      'Participante con goles o asistencias pendientes: las primas y los contadores posteriores no pueden verificarse.');
    if (participated === false && bonusStart !== null && input.round! >= bonusStart && ((input.metrics.goals ?? 0) > 0 || (input.metrics.assists ?? 0) > 0)) add('warning', 'events-without-participation', 'Datos por partido', `N${input.row}`,
      'Hay goles/asistencias sin participación. Revisa las fuentes antes de calcular primas.');
    if (input.notes && /gol.*acta|paradas\s*=|\+1 gol/i.test(input.notes)) add('info', 'manual-correction', 'Datos por partido', `BA${input.row}`,
      'Corrección manual conservada tal como está. No se añade ninguna acción leyendo la nota.');
    return { ...input, effectiveMinutes: minutes, participated, ...passing,
      index: input.valid ? performanceIndex(input.metrics, participated, parsed.parameters) : null,
      missingIndexInputs, bonus: null };
  });
  if (bonusStart === null) add('warning', 'unsupported-bonus-season', 'Instrucciones', 'A1', 'No hay una regla de primas aprobada para esta temporada. Las estadísticas deportivas permanecen disponibles.');
  const bonusesBlocked = !parsed.parameters || bonusStart === null || issues.some(i => i.severity === 'error'
    || i.code === 'incomplete-bonus-input' || i.code === 'events-without-participation');
  if (!bonusesBlocked && parsed.parameters) {
    const previous = new Map<number, { clean: number; goals: number; assists: number }>();
    const byRound = new Map(parsed.matches.map(match => [match.round, match]));
    // Same ordering as SUMIFS(... jornada, "<" & currentJornada), not dates.
    for (const row of [...observations].sort((a, b) => a.round! - b.round! || a.row - b.row)) {
      const match = byRound.get(row.round)!;
      if (row.round! < bonusStart!) {
        row.bonus = { previousCleanSheets: 0, previousGoals: 0, previousAssists: 0, cleanSheetOccurrence: 0, cleanSheetCents: 0, goalsCents: 0, assistsCents: 0, totalCents: 0 };
        continue;
      }
      const counts = previous.get(row.jersey!) || { clean: 0, goals: 0, assists: 0 };
      row.bonus = calculateBonus({ previousCleanSheets: counts.clean, previousGoals: counts.goals,
        previousAssists: counts.assists, eligible: row.roster?.cleanSheetEligible ?? null,
        minutes: row.effectiveMinutes, goalsFor: match.goalsFor, goalsAgainst: match.goalsAgainst,
        goals: row.metrics.goals, assists: row.metrics.assists }, parsed.parameters);
      previous.set(row.jersey!, { clean: counts.clean + row.bonus.cleanSheetOccurrence,
        goals: counts.goals + (row.metrics.goals ?? 0), assists: counts.assists + (row.metrics.assists ?? 0) });
    }
  }
  const total = (rows: CalculatedObservation[]): Totals => ({
    observations: rows.length, calledUp: rows.filter(p => p.calledUp).length,
    participants: rows.filter(p => p.participated).length, starters: rows.filter(p => p.starter).length,
    fcfMinutes: sumKnown(rows.map(p => p.fcfMinutes)), effectiveMinutes: sumKnown(rows.map(p => p.effectiveMinutes)),
    goals: sumKnown(rows.map(p => p.metrics.goals)), yellowCards: sumKnown(rows.map(p => p.metrics.yellowCards)),
    distanceKm: sumKnown(rows.map(p => p.metrics.distanceKm)), sprints: sumKnown(rows.map(p => p.metrics.sprints)),
    bonusCents: bonusesBlocked ? null : sumKnown(rows.map(p => p.bonus?.totalCents ?? null)),
  });
  const compare = (sheet: string, address: string, calculated: number | null, label: string) => {
    const source = parsed.sourceCells.find(c => c.sheet === sheet && c.address === address);
    if (!source) return;
    const cached = cachedNumber(source.value);
    if (calculated === null && cached === null) return;
    // The file stores formatted display values (e.g. "78%"), not full precision.
    const string = typeof source.value === 'string' ? source.value.trim() : '';
    let tolerance = 1e-7;
    if (string.endsWith('%')) tolerance = 0.00500001;
    else if (string && !string.includes('€') && /^-?\d+(?:[.,]\d+)?$/.test(string)) {
      const decimals = string.split(/[.,]/)[1]?.length || 0;
      tolerance = 0.5 * 10 ** -decimals + 1e-7;
    }
    if (calculated === null || cached === null || Math.abs(calculated - cached) > tolerance) add('warning', 'reconciliation', sheet, address,
      `${label}: cálculo local ${calculated ?? 'pendiente'}; Excel ${String(source.value ?? 'vacío')}. No se sobrescribe la fuente.`);
  };
  if (!issues.some(i => i.severity === 'error')) {
    for (const p of observations) {
      const values: Record<string, number | null> = { L: p.effectiveMinutes,
        M: p.participated === null ? null : Number(p.participated), AI: p.failedPasses,
        AJ: p.passingRate, AP: p.index };
      if (p.bonus) Object.assign(values, { AS: p.bonus.cleanSheetOccurrence, AT: p.bonus.previousCleanSheets,
        AU: p.bonus.cleanSheetCents / 100, AV: p.bonus.previousGoals, AW: p.bonus.goalsCents / 100,
        AX: p.bonus.previousAssists, AY: p.bonus.assistsCents / 100, AZ: p.bonus.totalCents / 100 });
      for (const [column, value] of Object.entries(values)) compare('Datos por partido', `${column}${p.row}`, value, `${p.name || 'Jugador'} · ${column}`);
    }
  }
  const matches: MatchPreview[] = parsed.matches.map(match => {
    const players = observations.filter(p => p.round === match.round);
    const teams = parsed.teams.filter(t => t.round === match.round);
    const totals = total(players);
    const blocked = issues.some(i => i.severity === 'error');
    if (match.goalsFor === null || match.goalsAgainst === null) add('warning', 'pending-result', 'Partidos', `E${match.row}`,
      'Resultado pendiente: la regla del libro no paga primas hasta conocer victoria o empate.');
    if (players.length && totals.goals !== null && match.goalsFor !== null && totals.goals !== match.goalsFor) add('warning', 'goal-mismatch', 'Partidos', `E${match.row}`,
      `Los goles individuales (${totals.goals}) difieren del acta (${match.goalsFor}). Revisa posibles correcciones o goles sin asignar.`);
    if (!blocked) {
      const result = match.goalsFor === null || match.goalsAgainst === null ? null : match.goalsFor >= match.goalsAgainst ? 1 : 0;
      const cachedPaid = parsed.sourceCells.find(c => c.sheet === 'Partidos' && c.address === `P${match.row}`);
      if (cachedPaid && !isBlank(cachedPaid.value) && normalizeIdentity(String(cachedPaid.value)) !== (result === 1 ? 'si' : 'no')) add('warning', 'reconciliation', 'Partidos', `P${match.row}`, 'La caché de pago difiere del resultado FCF.');
      for (const team of teams) reconcileTeam(match, team, players, compare, add);
      const rank = players.filter(p => p.index !== null).sort((a, b) => b.index! - a.index!);
      const manualSecond = /segundo\s*:\s*([^.;]+)/i.exec(match.manualMvpReason || '')?.[1];
      if (manualSecond && rank[1]?.name && normalizeIdentity(manualSecond) !== normalizeIdentity(rank[1].name)) add('warning', 'manual-ranking', 'Partidos', `N${match.row}`,
        `La nota indica segundo «${manualSecond.trim()}»; el índice sitúa segundo a ${rank[1].name} (${rank[1].index}). La nota manual se conserva.`);
      if (match.manualMvp && rank[0]?.name && normalizeIdentity(match.manualMvp) !== normalizeIdentity(rank[0].name)) add('warning', 'manual-ranking', 'Partidos', `M${match.row}`, 'El MVP manual no coincide con el índice mayor.');
    }
    return { match, players, teams, totals, blocked, pilot: blocked ? [] : pilotChecks(match, players, totals) };
  });
  if (!issues.some(i => i.severity === 'error')) reconcileSummary(parsed, observations, compare, add);
  return { version: 'veo-preview-v1', sheets: parsed.sheets, roster: parsed.roster, matches,
    observations, parameters: parsed.parameters, parameterCells: parsed.parameterCells,
    sourceCells: parsed.sourceCells, issues, bonusesBlocked };
}

type Compare = (sheet: string, address: string, value: number | null, label: string) => void;
type AddIssue = (severity: Issue['severity'], code: string, sheet: string, cell: string, message: string) => void;

function reconcileTeam(match: Match, team: TeamStats, players: CalculatedObservation[], compare: Compare, add: AddIssue) {
  for (const [left, right, label, metric] of TEAM_PAIRS) {
    if (!['goals', 'conversion', 'passingRate'].includes(metric)) continue;
    for (const [column, side, goals] of [[left, team.inspire, match.goalsFor], [right, team.opponent, match.goalsAgainst]] as const) {
      const value = metric === 'goals' ? goals : metric === 'conversion'
        ? goals === null || !side.attempts ? null : goals / side.attempts
        : side.passes && side.successfulPasses !== null ? side.successfulPasses / side.passes : null;
      compare('Equipo', `${column}${team.row}`, value, label);
    }
  }
  if (team.inspire.possession !== null && team.opponent.possession !== null && Math.abs(team.inspire.possession + team.opponent.possession - 1) > 0.01) add('warning', 'possession-total', 'Equipo', `N${team.row}`, 'Las posesiones no suman aproximadamente el 100 %.');
  for (const side of [team.inspire, team.opponent]) {
    if (side.passes !== null && side.successfulPasses !== null && side.successfulPasses > side.passes) add('warning', 'team-passes', 'Equipo', `P${team.row}`, 'Pases buenos superiores a pases de equipo.');
  }
  const columns = ['AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL'];
  const sums = [players.filter(p => p.participated).length,
    ...(['distanceKm', 'sprints', 'highIntensityRuns', 'tackles', 'interceptions', 'recoveries', 'duels', 'dribbles'] as const)
      .map(key => sumKnown(players.map(p => p.metrics[key])) ?? 0)];
  columns.forEach((column, i) => compare('Equipo', `${column}${team.row}`, sums[i], 'Suma de jugadores'));
  for (const key of ['shots', 'corners', 'throwIns', 'fouls', 'passes', 'successfulPasses'] as const) {
    const sum = sumKnown(players.map(p => p.metrics[key]));
    const manual = team.inspire[key];
    if (sum !== null && manual !== null && sum !== manual) add('info', 'team-player-difference', 'Equipo', `A${team.row}`,
      `${METRIC_LABELS[key]}: equipo manual ${manual}, suma individual ${sum}. Son fuentes separadas; no se fuerza igualdad.`);
  }
}

function reconcileSummary(parsed: Parsed, observations: CalculatedObservation[], compare: Compare, add: AddIssue) {
  const sheet = 'Resumen temporada';
  const summaryRows = parsed.sourceCells.filter(c => c.sheet === sheet && /^A\d+$/.test(c.address)
    && Number(c.address.slice(1)) >= 5 && cachedNumber(c.value) !== null);
  const summaries: Record<string, number | null>[] = [];
  for (const source of summaryRows) {
    const jersey = cachedNumber(source.value);
    const row = Number(source.address.slice(1));
    const players = observations.filter(p => p.jersey === jersey);
    if (!parsed.roster.some(p => p.jersey === jersey)) add('warning', 'summary-roster', sheet, source.address, 'Dorsal del resumen sin correspondencia en Plantilla.');
    const played = players.filter(p => p.participated);
    const minutes = sumKnown(players.map(p => p.effectiveMinutes)) ?? 0;
    const values: Record<string, number | null> = {
      E: players.filter(p => p.calledUp).length, F: played.length,
      G: players.filter(p => p.starter).length, H: minutes,
      I: played.length ? excelRound(minutes / played.length) : null,
    };
    for (const [left, right, , metric] of SUMMARY_PAIRS) {
      values[left] = sumKnown(players.map(p => p.metrics[metric])) ?? 0; // Excel SUM semantics for reconciliation only.
      const available = played.map(p => p.metrics[metric]).filter((n): n is number => n !== null);
      values[right] = available.length ? available.reduce((a, b) => a + b, 0) / available.length : null;
    }
    const speeds = players.map(p => p.metrics.maxSpeedKmh).filter((n): n is number => n !== null);
    const passRows = players.filter(p => p.metrics.successfulPasses !== null);
    const totalPasses = sumKnown(passRows.map(p => p.metrics.passes));
    const indices = played.map(p => p.index).filter((n): n is number => n !== null);
    Object.assign(values, { AN: speeds.length ? Math.max(...speeds) : null,
      AO: totalPasses ? (sumKnown(passRows.map(p => p.metrics.successfulPasses)) ?? 0) / totalPasses : null,
      AP: sumKnown(players.map(p => p.metrics.yellowCards)) ?? 0,
      AQ: sumKnown(players.map(p => p.metrics.redCards)) ?? 0,
      AR: players.every(p => p.bonus !== null) ? players.reduce((sum, p) => sum + p.bonus!.cleanSheetOccurrence, 0) : null,
      AS: indices.length ? excelRound(indices.reduce((a, b) => a + b, 0) / indices.length, 1) : null,
      AT: players.length && players.every(p => p.bonus !== null) ? players.reduce((sum, p) => sum + p.bonus!.totalCents, 0) / 100 : null });
    for (const [col, value] of Object.entries(values)) {
      if (value === null && ['AR', 'AT'].includes(col)) continue;
      compare(sheet, `${col}${row}`, value, 'Resumen individual');
    }
    summaries.push({ ...values, isGoalkeeper: parsed.roster.find(p => p.jersey === jersey)?.group === 'POR' ? 1 : 0 });
  }
  for (const player of parsed.roster) if (!summaryRows.some(c => cachedNumber(c.value) === player.jersey)) add('warning', 'missing-summary', sheet, 'A5', `${player.name}: falta en Resumen temporada.`);
  const totalRow = parsed.sourceCells.find(c => c.sheet === sheet && /^B\d+$/.test(c.address) && normalizeIdentity(String(c.value)) === 'total equipo');
  const meanRow = parsed.sourceCells.find(c => c.sheet === sheet && /^B\d+$/.test(c.address) && normalizeIdentity(String(c.value)) === 'media equipo');
  if (totalRow) {
    const columns = ['E', 'F', 'G', 'H', ...SUMMARY_PAIRS.map(p => p[0]), 'AP', 'AQ', 'AR', 'AT'];
    for (const col of columns) {
      if (summaries.some(row => row[col] === null) && ['AR', 'AT'].includes(col)) continue;
      compare(sheet, `${col}${totalRow.address.slice(1)}`, sumKnown(summaries.map(row => row[col])), 'Total del resumen');
    }
    const speeds = summaries.map(row => row.AN).filter((n): n is number => n !== null);
    compare(sheet, `AN${totalRow.address.slice(1)}`, speeds.length ? Math.max(...speeds) : null, 'Velocidad máxima de temporada');
  }
  if (meanRow && parsed.parameters) for (const col of ['I', ...SUMMARY_PAIRS.map(p => p[1]), 'AO', 'AS']) {
    const rows = summaries.filter(row => row.isGoalkeeper === (col === 'AI' ? 1 : 0)
      && row.I !== null && row.I >= parsed.parameters!.teamAverageMinutes && row[col] !== null);
    compare(sheet, `${col}${meanRow.address.slice(1)}`, rows.length
      ? rows.reduce((sum, row) => sum + row[col]!, 0) / rows.length : null, 'Media de jugadores elegibles');
  }
  if (observations.length && observations.every(p => p.metrics.chances === null)) add('warning', 'missing-chances', sheet, 'V5',
    'No hay datos de ocasiones. El SUM del Excel muestra cero, pero la fuente permanece pendiente; no se interpreta como cero observado.');
}
