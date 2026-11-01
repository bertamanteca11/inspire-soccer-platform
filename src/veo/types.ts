export type Scalar = string | number | boolean | null;
export type Severity = 'error' | 'warning' | 'info';
export type SourceCell = {
  sheet: string; address: string; value: Scalar; formatted: string | null;
  formula: string | null; type: string | null;
};
export type SourceRow = { sheet: string; row: number; cells: Record<string, SourceCell> };
export type Issue = { severity: Severity; code: string; sheet: string; cell: string; message: string };
export type RosterPlayer = {
  row: number; jersey: number | null; name: string | null; fullName: string | null;
  position: string | null; group: string | null; birthYear: number | null;
  birthday: string | null; cleanSheetEligible: boolean | null; notes: string | null; source: SourceRow;
};
export type Match = {
  row: number; round: number | null; date: string | null; opponent: string | null;
  venue: string | null; goalsFor: number | null; goalsAgainst: number | null;
  field: string | null; fcfReference: string | null; coach: string | null;
  manualMvp: string | null; manualMvpReason: string | null; notes: string | null;
  supabaseSessionId: null; source: SourceRow;
};
export const METRIC_COLUMNS = {
  goals: 'N', assists: 'O', yellowCards: 'P', redCards: 'Q', distanceKm: 'R',
  averageSpeedKmh: 'S', maxSpeedKmh: 'T', sprints: 'U', highIntensityRuns: 'V',
  totalEvents: 'W', shots: 'X', chances: 'Y', tackles: 'Z', corners: 'AA',
  freeKicks: 'AB', throwIns: 'AC', fouls: 'AD', penalties: 'AE', goalKicks: 'AF',
  passes: 'AG', successfulPasses: 'AH', dribbles: 'AK', interceptions: 'AL',
  recoveries: 'AM', duels: 'AN', saves: 'AO',
} as const;
export type Metric = keyof typeof METRIC_COLUMNS;
export type Metrics = Record<Metric, number | null>;
export type IndexMetric = 'goals' | 'assists' | 'chances' | 'shots' | 'tackles'
  | 'interceptions' | 'recoveries' | 'saves' | 'dribbles' | 'successfulPasses'
  | 'failedPasses' | 'yellowCards' | 'redCards';
export type Parameters = {
  baseCents: number; doubledCents: number; doubleFrom: number; cleanSheetMinutes: number;
  comparisonMargin: number; teamAverageMinutes: number; weights: Record<IndexMetric, number>;
};
export type Observation = {
  row: number; round: number | null; jersey: number | null; roster: RosterPlayer | null;
  name: string | null; profile: string | null; calledUp: boolean | null;
  starter: boolean | null; fcfMinutes: number | null; veoMinutes: number | null;
  metrics: Metrics; notes: string | null; source: SourceRow; valid: boolean;
  identity: { status: 'unresolved' | 'ambiguous'; reasons: string[]; supabasePlayerId: null };
};
export type Bonus = {
  previousCleanSheets: number; previousGoals: number; previousAssists: number;
  cleanSheetOccurrence: number; cleanSheetCents: number; goalsCents: number;
  assistsCents: number; totalCents: number;
};
export type CalculatedObservation = Observation & {
  effectiveMinutes: number | null; participated: boolean | null;
  failedPasses: number | null; passingRate: number | null; index: number | null;
  missingIndexInputs: string[]; bonus: Bonus | null;
};
export type TeamStats = {
  row: number; round: number | null; source: SourceRow;
  inspire: Record<string, number | null>; opponent: Record<string, number | null>;
};
export type Totals = {
  observations: number; calledUp: number; participants: number; starters: number;
  fcfMinutes: number | null; effectiveMinutes: number | null; goals: number | null;
  yellowCards: number | null; distanceKm: number | null; sprints: number | null;
  bonusCents: number | null;
};
export type Comparison = { label: string; expected: number | null; actual: number | null; matches: boolean };
export type MatchPreview = {
  match: Match; players: CalculatedObservation[]; teams: TeamStats[]; totals: Totals;
  blocked: boolean; pilot: Comparison[];
};
export type Preview = {
  version: 'veo-preview-v1'; sheets: { name: string; range: string; realRecords: number }[];
  roster: RosterPlayer[]; matches: MatchPreview[]; observations: CalculatedObservation[];
  parameters: Parameters | null; parameterCells: SourceCell[];
  sourceCells: SourceCell[]; issues: Issue[]; bonusesBlocked: boolean;
};
