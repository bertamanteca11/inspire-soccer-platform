import { normalizeIdentity } from './schema';
import { previewMatches, type AnalyticsMatch, type PlayerFact } from './analytics';
import type { Preview } from './types';

export type PlayerDirectory = { id: string; name: string; display_name: string; shirt_number?: number | null };
export type SessionDirectory = { id: string; name: string; session_date: string; type: string; opponent?: string | null };
export type ReviewedLink = { source_key: string; player_id: string; namespace: string };
export type Mapping = { players: Record<string, string>; sessions: Record<string, string> };
export type ImportPayload = { version: 1; namespace: string; season: string; filename: string; fileHash: string;
  matches: AnalyticsMatch[]; provenance: { sourceCells: Preview['sourceCells']; issues: Preview['issues'] } };
export type ImportChange = { round: number; kind: 'new' | 'unchanged' | 'changed'; changedPlayers: number; removedPlayers: number; previousRevision: number; matchId: string | null };

export const validUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function sourcePlayerKey(fullName: string) { return normalizeIdentity(fullName); }
export function playerCandidates(fullName: string, directory: PlayerDirectory[]) {
  const key = normalizeIdentity(fullName);
  return directory.filter(p => normalizeIdentity(p.name) === key || normalizeIdentity(p.display_name) === key);
}
export function reviewedMapping(links: ReviewedLink[], namespace: string): Record<string, string> {
  const grouped = new Map<string, Set<string>>();
  for (const link of links.filter(l => l.namespace === namespace)) grouped.set(link.source_key, new Set([...(grouped.get(link.source_key) || []), link.player_id]));
  return Object.fromEntries([...grouped].filter(([, ids]) => ids.size === 1).map(([key, ids]) => [key, [...ids][0]]));
}
export function prepareImport(input: { preview: Preview; namespace: string; season: string; filename: string; fileHash: string;
  mapping: Mapping; players: PlayerDirectory[]; sessions: SessionDirectory[]; existing: AnalyticsMatch[] }) {
  const errors: string[] = [];
  if (!/^[a-z0-9][a-z0-9_-]{1,59}$/.test(input.namespace)) errors.push('Indica una serie estable de 2–60 caracteres (p. ej., liga).');
  if (!/^20\d{2}-20\d{2}$/.test(input.season) || Number(input.season.slice(5)) !== Number(input.season.slice(0, 4)) + 1) errors.push('Temporada inválida.');
  if (!/^[a-f0-9]{64}$/i.test(input.fileHash)) errors.push('Falta la huella del archivo.');
  if (input.preview.issues.some(i => i.severity === 'error')) errors.push('Resuelve los errores del libro antes de publicar.');
  const matches = previewMatches(input.preview, input.season, input.namespace);
  const sessionIds = new Set<string>();
  for (const match of matches) {
    if (match.date && ![input.season.slice(0, 4), input.season.slice(5)].includes(match.date.slice(0, 4))) errors.push(`J${match.round}: fecha fuera de la temporada seleccionada.`);
    const sessionId = input.mapping.sessions[String(match.round)];
    const session = input.sessions.find(s => s.id === sessionId);
    if (!session || !validUuid(sessionId) || session.session_date !== match.date || !['league_match', 'friendly_match', 'scrimmage', 'tryout'].includes(session.type)) errors.push(`J${match.round}: selecciona una sesión de partido de la misma fecha.`);
    if (sessionId && sessionIds.has(sessionId)) errors.push('Dos partidos no pueden vincularse a la misma sesión.');
    if (sessionId) sessionIds.add(sessionId);
    match.sessionId = sessionId || null;
    const seen = new Set<string>();
    for (const fact of match.players) {
      const id = input.mapping.players[fact.sourceKey];
      if (!id || !validUuid(id) || !input.players.some(p => p.id === id)) errors.push(`${fact.fullName}: falta una identidad revisada válida.`);
      if (id && seen.has(id)) errors.push(`J${match.round}: dos observaciones apuntan al mismo jugador.`);
      if (id) seen.add(id);
      fact.playerId = id || null; fact.playerKey = id || fact.playerKey;
    }
  }
  const changes = matches.map(match => {
    const previous = input.existing.find(m => m.namespace === input.namespace && m.season === input.season && m.round === match.round);
    const comparison = (m: AnalyticsMatch) => stableJson({ date: m.date, opponent: m.opponent, venue: m.venue,
      goalsFor: m.goalsFor, goalsAgainst: m.goalsAgainst, manualMvp: m.manualMvp, manualMvpReason: m.manualMvpReason,
      notes: m.notes, field: m.field, fcfReference: m.fcfReference, coach: m.coach, teams: m.teams,
      sessionId: m.sessionId, players: [...m.players].sort((a, b) => (a.playerId || '').localeCompare(b.playerId || '')) });
    return { round: match.round, kind: !previous?.active ? 'new' : comparison(previous) === comparison(match) ? 'unchanged' : 'changed',
      changedPlayers: match.players.filter(p => stableJson(p) !== stableJson(previous?.players.find(old => old.playerId === p.playerId))).length,
      removedPlayers: previous?.players.filter(p => !match.players.some(next => next.playerId === p.playerId)).length || 0,
      previousRevision: previous?.revision || 0, matchId: previous?.id || null } as ImportChange;
  });
  const expectedVersions = Object.fromEntries(changes.map(change => [String(change.round), change.previousRevision]));
  const payload: ImportPayload = { version: 1, namespace: input.namespace, season: input.season,
    filename: input.filename, fileHash: input.fileHash, matches,
    provenance: { sourceCells: input.preview.sourceCells, issues: input.preview.issues } };
  return { errors: [...new Set(errors)], matches, changes, expectedVersions, payload };
}

export function mergeImport(existing: AnalyticsMatch[], incoming: AnalyticsMatch[]) {
  return [...existing.filter(old => !incoming.some(next => next.namespace === old.namespace && next.season === old.season && next.round === old.round)), ...incoming];
}
