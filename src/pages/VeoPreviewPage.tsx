import { useEffect, useRef, useState } from 'react';
import type { Role } from '../types';
import { Card, PageTitle } from '../components/ui';
import { readLocalVeoFile } from '../veo/client';
import { METRIC_LABELS, PLAYER_HEADERS } from '../veo/schema';
import { sumKnown } from '../veo/calculations';
import type { CalculatedObservation, MatchPreview, Preview, Severity, SourceCell, SourceRow } from '../veo/types';
import '../styles/veo-preview.css';

const format = (value: number | null, decimals = 2) => value === null ? 'Pendiente'
  : new Intl.NumberFormat('es-ES', { maximumFractionDigits: decimals }).format(value);
const money = (cents: number | null) => cents === null ? 'No calculable' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const flag = (value: boolean | null) => value === null ? 'Pendiente' : value ? 'Sí' : 'No';
const sourceValue = (cell: SourceCell) => cell.value === null || cell.value === '' ? 'Vacío' : String(cell.value);

export function VeoPreviewPage({ role, initial = null, onLoaded }: { role: Role; initial?: { preview: Preview; hash: string; filename: string } | null;
  onLoaded?: (value: { preview: Preview; hash: string; filename: string } | null) => void }) {
  const [result, setResult] = useState<{ preview: Preview; hash: string; filename: string } | null>(initial);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [selected, setSelected] = useState(0), [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [query, setQuery] = useState('');
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => {
    if (role !== 'admin') { controller.current?.abort(); setResult(null); setBusy(false); }
  }, [role]);

  async function selectFile(file: File | undefined) {
    if (!file || role !== 'admin') return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError(''); setResult(null); setSelected(0); setQuery(''); setSeverity('all');
    try {
      const loaded = await readLocalVeoFile(file, request.signal);
      if (!request.signal.aborted) { const value = { ...loaded, filename: file.name }; setResult(value); onLoaded?.(value); }
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : 'No se pudo analizar el archivo.');
    } finally { if (controller.current === request) setBusy(false); }
  }
  function clear() {
    controller.current?.abort(); controller.current = null;
    setResult(null); setError(''); setBusy(false);
    onLoaded?.(null);
    if (input.current) input.current.value = '';
  }
  if (role !== 'admin') return <Card><p role="alert">La previsualización VEO está disponible para administradores autenticados.</p></Card>;
  const preview = result?.preview;
  const match = preview?.matches[selected];
  const errors = preview?.issues.filter(issue => issue.severity === 'error').length || 0;
  const warnings = preview?.issues.filter(issue => issue.severity === 'warning').length || 0;
  const filteredIssues = preview?.issues.filter(issue => (severity === 'all' || issue.severity === severity)
    && `${issue.sheet} ${issue.cell} ${issue.message}`.toLowerCase().includes(query.toLowerCase())) || [];

  return <div className="veo-preview stack">
    <PageTitle title="VEO · Previsualización de Excel" subtitle="Análisis local del archivo. No publica ni modifica datos del equipo."/>
    <Card>
      <p>Selecciona el libro con Plantilla, Partidos, Datos por partido, Equipo, Resumen temporada e Instrucciones.</p>
      <label className="veo-file">Libro Excel (.xlsx, máximo 10 MB)
        <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy}
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void selectFile(file); }}/>
      </label>
      {(busy || result || error) && <button className="secondary" onClick={clear}>{busy ? 'Cancelar análisis' : 'Limpiar previsualización'}</button>}
      {busy && <p role="status" aria-live="polite">Analizando el archivo en este dispositivo…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <p className="muted">El archivo permanece en memoria y no se envía a Supabase. Al salir de esta pantalla se descarta. No se asignan UUIDs automáticamente.</p>
    </Card>
    {preview && result && <>
      <Card>
        <h3>{result.filename}</h3><p className="veo-hash">SHA-256: {result.hash}</p>
        <p role="status">{preview.matches.length} partido(s) · {preview.observations.length} observaciones · {errors} errores · {warnings} advertencias</p>
        {errors > 0 && <p role="alert" className="error">Hay errores de importación. Los totales pueden ser parciales y las primas no se calculan.</p>}
        <div className="veo-notice"><strong>Primas calculadas · desde J5 en 2026–2027</strong><p>No son pagos. J1–J4 nunca contribuyen a los contadores de primas. Revisa si hay huecos desde J5 entre los partidos importados. {preview.bonusesBlocked && 'El libro contiene incidencias que impiden verificar las primas.'}</p></div>
        <details><summary>Hojas y registros reales</summary><div className="veo-table-wrap"><table><thead><tr><th>Hoja</th><th>Rango leído</th><th>Registros / parámetros</th></tr></thead><tbody>
          {preview.sheets.map(sheet => <tr key={sheet.name}><td>{sheet.name}</td><td>{sheet.range}</td><td>{sheet.realRecords}</td></tr>)}
        </tbody></table></div></details>
      </Card>
      {preview.matches.length > 0 && <label>Partido del libro<select value={selected} onChange={event => setSelected(Number(event.target.value))}>
        {preview.matches.map((entry, index) => <option key={`${entry.match.row}-${index}`} value={index}>J{entry.match.round ?? '?'} · {entry.match.date ?? 'Fecha pendiente'} · {entry.match.opponent ?? 'Rival pendiente'}</option>)}
      </select></label>}
      {match && <MatchDetails entry={match}/>}
      <Card>
        <h3>Validación, avisos y discrepancias</h3>
        <div className="veo-filters"><label>Gravedad<select value={severity} onChange={event => setSeverity(event.target.value as Severity | 'all')}>
          <option value="all">Todas</option><option value="error">Errores</option><option value="warning">Advertencias</option><option value="info">Información</option>
        </select></label><label>Buscar incidencia<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Jugador, celda o mensaje"/></label></div>
        <p>{filteredIssues.length} incidencia(s)</p>
        <div className="veo-issues">{filteredIssues.map((issue, index) => <article key={`${issue.code}-${issue.sheet}-${issue.cell}-${index}`} className={`veo-issue ${issue.severity}`}>
          <strong>{issue.severity === 'error' ? 'Error' : issue.severity === 'warning' ? 'Advertencia' : 'Información'} · {issue.sheet || 'Libro'}{issue.cell ? `!${issue.cell}` : ''}</strong>
          <p>{issue.message}</p>
        </article>)}</div>
      </Card>
      <Card><h3>Plantilla e identidades</h3><p>Todas las identidades externas están pendientes de confirmación. El dorsal es una referencia del libro y puede cambiar.</p>
        <div className="veo-table-wrap"><table><thead><tr><th>Dorsal</th><th>Apodo</th><th>Nombre completo</th><th>Posición / grupo</th><th>Elegible P0</th><th>Notas originales</th></tr></thead><tbody>
          {preview.roster.map(player => <tr key={player.row}><td>{player.jersey ?? 'Pendiente'}</td><td>{player.name ?? 'Pendiente'}</td><td>{player.fullName ?? 'Pendiente'}</td><td>{player.position} / {player.group}</td><td>{flag(player.cleanSheetEligible)}</td><td>{player.notes || '—'}</td></tr>)}
        </tbody></table></div>
      </Card>
      <Card><h3>Reglas verificadas</h3><p>Los índices son VEO, independientes de la evaluación del entrenador. Las entradas ausentes se mantienen pendientes aunque su contribución al índice sea cero.</p>
        <p>VEO tiene prioridad incluso con cero minutos. P0 exige elegibilidad, portería a cero y más de 65 minutos. Las primas son 10 € por ocurrencia y 20 € desde la octava. Solo victorias y empates pagan; derrotas avanzan los contadores. El orden histórico sigue la jornada.</p>
        {!preview.parameters && <p className="error">Parámetros no verificables: índices y primas bloqueados.</p>}
        <div className="veo-table-wrap"><table><thead><tr><th>Celda</th><th>Valor original</th></tr></thead><tbody>{preview.parameterCells.map(cell => <tr key={cell.address}><td>Instrucciones!{cell.address}</td><td>{sourceValue(cell)}</td></tr>)}</tbody></table></div>
      </Card>
      <Card><details><summary>Inspeccionar celdas originales, fórmulas y cachés</summary><SourceInspector cells={preview.sourceCells}/></details></Card>
    </>}
  </div>;
}

function MatchDetails({ entry }: { entry: MatchPreview }) {
  const { match, totals } = entry;
  return <>
    <Card><h2>J{match.round ?? '?'} · {match.opponent}</h2>
      <p>{match.date} · {match.venue} · {match.goalsFor ?? '?'}–{match.goalsAgainst ?? '?'}</p>
      <p>Sesión de Supabase: sin vincular · UUIDs de jugadores: sin asignar</p>
      <div className="veo-metrics">{[
        ['Observaciones', format(totals.observations)], ['Convocados (Excel)', format(totals.calledUp)],
        ['Participantes', format(totals.participants)], ['Titulares', format(totals.starters)],
        ['Minutos FCF', format(totals.fcfMinutes)], ['Minutos efectivos', format(totals.effectiveMinutes)],
        ['Goles', format(totals.goals)], ['Amarillas', format(totals.yellowCards)],
        ['Distancia (km)', format(totals.distanceKm)], ['Sprints', format(totals.sprints)],
        ['Primas del historial', money(totals.bonusCents)],
      ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      {entry.blocked && <p className="error">Lectura con errores: revisa las incidencias antes de interpretar los totales.</p>}
      {match.notes && <details><summary>Notas originales del partido</summary><p className="veo-notes">{match.notes}</p></details>}
      {match.manualMvp && <p>MVP manual: {match.manualMvp}. {match.manualMvpReason}</p>}
    </Card>
    {entry.pilot.length > 0 && <Card><h3>Reconciliación del piloto Alzamora</h3><div className="veo-table-wrap"><table><thead><tr><th>Comprobación</th><th>Referencia</th><th>Calculado</th><th>Resultado</th></tr></thead><tbody>
      {entry.pilot.map(check => <tr key={check.label}><td>{check.label}</td><td>{format(check.expected)}</td><td>{format(check.actual)}</td><td className={check.matches ? 'success' : 'error'}>{check.matches ? 'Coincide' : 'Difiere / pendiente'}</td></tr>)}
    </tbody></table></div></Card>}
    <Card><h3>Observaciones por jugador</h3><p>«Sin UUID» significa que la identidad no está confirmada en Supabase. Las referencias VEO genéricas o reutilizadas se señalan para revisión.</p>
      <div className="veo-table-wrap"><table><thead><tr><th>Jugador</th><th>Perfil VEO</th><th>Convocado / titular</th><th>Min FCF</th><th>Min VEO</th><th>Min usados</th><th>Jugó</th><th>Índice</th><th>Primas provisionales</th><th>Inspección</th></tr></thead><tbody>
        {entry.players.map(player => <PlayerRow key={player.row} player={player}/>)}</tbody></table></div>
    </Card>
    <Card><h3>Equipo y rival · entradas manuales VEO</h3><p>Estas estadísticas se conservan separadas de las sumas individuales. Una diferencia no provoca ajustes automáticos.</p>
      {!entry.teams.length && <p>Sin registro de equipo para esta jornada.</p>}
      {entry.teams.map(team => <div key={team.row} className="veo-table-wrap"><table><thead><tr><th>Métrica</th><th>Inspire</th><th>Rival</th></tr></thead><tbody>
        {Object.keys(team.inspire).map(metric => <tr key={metric}><td>{METRIC_LABELS[metric] || metric}</td><td>{metric === 'possession' ? `${format(team.inspire[metric] === null ? null : team.inspire[metric] * 100)}${team.inspire[metric] === null ? '' : ' %'}` : format(team.inspire[metric])}</td><td>{metric === 'possession' ? `${format(team.opponent[metric] === null ? null : team.opponent[metric] * 100)}${team.opponent[metric] === null ? '' : ' %'}` : format(team.opponent[metric])}</td></tr>)}
        <tr><td>Goles (acta FCF)</td><td>{format(match.goalsFor)}</td><td>{format(match.goalsAgainst)}</td></tr>
        <tr><td>Conversión sobre intentos</td><td>{match.goalsFor === null || !team.inspire.attempts ? 'Pendiente' : `${format(match.goalsFor / team.inspire.attempts * 100)} %`}</td><td>{match.goalsAgainst === null || !team.opponent.attempts ? 'Pendiente' : `${format(match.goalsAgainst / team.opponent.attempts * 100)} %`}</td></tr>
        <tr><td>Precisión de pase</td><td>{team.inspire.successfulPasses === null || !team.inspire.passes ? 'Pendiente' : `${format(team.inspire.successfulPasses / team.inspire.passes * 100)} %`}</td><td>{team.opponent.successfulPasses === null || !team.opponent.passes ? 'Pendiente' : `${format(team.opponent.successfulPasses / team.opponent.passes * 100)} %`}</td></tr>
      </tbody></table></div>)}
      <details><summary>Sumas individuales y cobertura de datos</summary><p>Se suman solo entradas conocidas. «Pendiente» significa que no hay datos; los ceros explícitos sí cuentan como datos disponibles.</p>
        <div className="veo-table-wrap"><table><thead><tr><th>Métrica</th><th>Suma individual</th><th>Observaciones con dato</th></tr></thead><tbody>
          {(['goals', 'assists', 'distanceKm', 'sprints', 'highIntensityRuns', 'shots', 'chances', 'tackles', 'corners', 'freeKicks', 'throwIns', 'fouls', 'passes', 'successfulPasses', 'dribbles', 'interceptions', 'recoveries', 'duels', 'saves'] as const).map(metric => {
            const values = entry.players.map(player => player.metrics[metric]);
            return <tr key={metric}><td>{METRIC_LABELS[metric]}</td><td>{format(sumKnown(values))}</td><td>{values.filter(value => value !== null).length} / {entry.players.length}</td></tr>;
          })}
        </tbody></table></div>
      </details>
    </Card>
  </>;
}

function PlayerRow({ player }: { player: CalculatedObservation }) {
  return <tr><td>{player.jersey ?? '?'} · {player.name ?? 'Sin identificar'}<br/><small>{player.identity.status === 'ambiguous' ? 'Revisar perfil · sin UUID' : 'Sin UUID confirmado'}</small></td>
    <td>{player.profile || 'Pendiente'}</td><td>{flag(player.calledUp)} / {flag(player.starter)}</td>
    <td>{format(player.fcfMinutes)}</td><td>{format(player.veoMinutes)}</td><td>{format(player.effectiveMinutes)}</td><td>{flag(player.participated)}</td>
    <td>{player.index === null ? 'Sin índice' : format(player.index)}{player.participated && player.missingIndexInputs.length > 0 && <small> · entradas pendientes</small>}</td>
    <td>{money(player.bonus?.totalCents ?? null)}</td><td><details><summary>Ver datos · fila {player.row}</summary>
      {player.notes && <p className="veo-notes">{player.notes}</p>}
      <p>{player.identity.reasons.join(' ')}</p>
      <p>Pases fallidos: {format(player.failedPasses)} · Precisión: {player.passingRate === null ? 'Pendiente' : `${format(player.passingRate * 100)} %`}</p>
      {player.bonus && <p>Previos en el historial: {player.bonus.previousGoals} goles, {player.bonus.previousAssists} asistencias, {player.bonus.previousCleanSheets} P0. Importe: goles {money(player.bonus.goalsCents)}, asistencias {money(player.bonus.assistsCents)}, P0 {money(player.bonus.cleanSheetCents)}.</p>}
      <RowSource source={player.source}/>
    </details></td></tr>;
}

function RowSource({ source }: { source: SourceRow }) {
  return <table className="veo-source"><thead><tr><th>Celda / campo</th><th>Entrada o caché original</th></tr></thead><tbody>
    {Object.entries(source.cells).map(([column, cell], index) => <tr key={column}><td>{cell.address} · {PLAYER_HEADERS[index] || column}{cell.formula && ' (fórmula)'}</td><td>{sourceValue(cell)}</td></tr>)}
  </tbody></table>;
}

function SourceInspector({ cells }: { cells: SourceCell[] }) {
  const sheets = Array.from(new Set(cells.map(cell => cell.sheet)));
  const [sheet, setSheet] = useState(sheets[0] || ''), [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const filtered = cells.filter(cell => cell.sheet === sheet && `${cell.address} ${cell.value ?? ''} ${cell.formula ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <div><div className="veo-filters"><label>Hoja<select value={sheet} onChange={event => { setSheet(event.target.value); setPage(0); }}>{sheets.map(name => <option key={name}>{name}</option>)}</select></label>
    <label>Celda o contenido<input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }}/></label></div>
    <p>{filtered.length} celdas con contenido · página {page + 1}</p><div className="veo-table-wrap"><table><thead><tr><th>Celda</th><th>Valor original</th><th>Tipo</th><th>Fórmula original (no ejecutada)</th></tr></thead><tbody>
      {filtered.slice(page * 50, (page + 1) * 50).map(cell => <tr key={cell.address}><td>{cell.address}</td><td>{sourceValue(cell)}</td><td>{cell.type || 'Vacío'}</td><td><code>{cell.formula || 'Entrada manual'}</code></td></tr>)}
    </tbody></table></div><div className="row"><button className="secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button><button className="secondary" disabled={(page + 1) * 50 >= filtered.length} onClick={() => setPage(p => p + 1)}>Siguiente</button></div>
  </div>;
}
