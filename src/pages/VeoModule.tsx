import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui';
import { VeoBars, VeoTrend } from '../components/VeoCharts';
import { useVeo } from '../veo/VeoContext';
import { rankPlayers, rankingValue, seasonAnalytics, type ComputedFact, type PlayerSeason, type RankingMetric, type SeasonAnalytics } from '../veo/analytics';
import { normalizeIdentity } from '../veo/schema';
import { sumKnown } from '../veo/calculations';
import { METRIC_LABELS } from '../veo/schema';
import { VeoImportAdmin } from './VeoImportAdmin';
import '../styles/veo-analytics.css';

export const veoNumber = (n: number | null | undefined, digits = 2) => n == null ? 'Pendiente' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits }).format(n);
export const veoMoney = (n: number | null) => n === null ? 'No calculable' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n / 100);
const tabs = [['dashboard', 'Resumen VEO'], ['matches', 'Partidos'], ['players', 'Jugadores'], ['rankings', 'Clasificación y comparación'], ['bonuses', 'Primas'], ['import', 'Importación']] as const;
type Section = typeof tabs[number][0];
const labels: Record<string, string> = { ...METRIC_LABELS, minutes: 'Minutos efectivos', fcfMinutes: 'Minutos FCF', veoMinutes: 'Minutos VEO', index: 'Índice VEO' };

export function VeoModule({ initialSection = 'dashboard' }: { initialSection?: Section }) {
  const context = useVeo();
  const [section, setSection] = useState<Section>(initialSection);
  const currentSection = section === 'import' && context.role !== 'admin' ? 'dashboard' : section;
  const [season, setSeason] = useState(''), [namespace, setNamespace] = useState('');
  const seasons = [...new Set(context.matches.filter(m => m.active).map(m => m.season))].sort().reverse();
  const namespaces = [...new Set(context.matches.filter(m => m.active && m.season === season).map(m => m.namespace))].sort();
  useEffect(() => { if (!seasons.includes(season)) setSeason(seasons[0] || ''); }, [seasons.join('|'), season]);
  useEffect(() => { if (!namespaces.includes(namespace)) setNamespace(namespaces[0] || ''); }, [namespaces.join('|'), namespace]);
  const analytics = useMemo(() => seasonAnalytics(context.matches, season, namespace || undefined, context.source !== 'local' || !context.local?.preview.bonusesBlocked), [context.matches, season, namespace, context.source, context.local]);
  if (!['admin', 'coach'].includes(context.role)) return <Card><p role="alert">VEO está disponible para administradores autenticados y entrenadores autorizados.</p></Card>;
  return <div className="veo-module stack">
    <section className="veo-hero"><span className="kicker">INSPIRE SOCCER · ANALYTICS</span><h2>El partido, con perspectiva</h2><p>Datos VEO y acta FCF. Una lectura independiente de la evaluación del entrenador.</p>
      <div className="veo-source-controls"><label>Origen<select value={context.source} onChange={e => context.setSource(e.target.value as 'local' | 'published')}><option value="published">Datos publicados</option><option value="local">Excel local · sin publicar</option></select></label>
        <label>Temporada<select value={season} onChange={e => setSeason(e.target.value)}><option value="">Seleccionar</option>{seasons.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Serie<select value={namespace} onChange={e => setNamespace(e.target.value)}><option value="">Seleccionar</option>{namespaces.map(s => <option key={s}>{s}</option>)}</select></label></div>
    </section>
    <nav className="veo-tabs" aria-label="Secciones VEO">{tabs.filter(([key]) => key !== 'import' || context.role === 'admin').map(([key, label]) => <button key={key} className={currentSection === key ? 'active' : ''} aria-current={currentSection === key ? 'page' : undefined} onClick={() => setSection(key)}>{label}</button>)}</nav>
    {context.source === 'local' && <p className="veo-local-notice">Excel local en memoria · sin publicación ni identidades confirmadas en Supabase.</p>}
    {context.status === 'loading' && <p role="status">Comprobando datos VEO publicados… El Excel local sigue disponible.</p>}
    {context.status === 'ready' && <p role="status">Base VEO conectada · {context.remote.matches.filter(m => m.active).length} partidos publicados.</p>}
    {context.status !== 'ready' && context.status !== 'loading' && <Card><p role={context.status === 'error' ? 'alert' : 'status'}>{context.error || 'VEO no está activado.'}</p><p>Puedes analizar el Excel en Importación sin ejecutar migraciones. La publicación solo se habilita tras activar el esquema.</p><button className="secondary" onClick={() => void context.reload()}>Volver a comprobar</button></Card>}
    {context.source === 'local' && context.local?.preview.issues.some(i => i.severity === 'error') && <p role="alert" className="error">El archivo contiene errores: las estadísticas pueden ser parciales y no son publicables.</p>}
    {currentSection === 'import' ? <VeoImportAdmin/> : !analytics.matches.length ? <Card><h3>Sin partidos para esta selección</h3><p>No se muestran estadísticas ficticias. {context.role === 'admin' ? 'Abre Importación y selecciona el Excel para explorar todas las secciones localmente.' : 'El administrador puede publicar partidos revisados cuando la base esté activada.'}</p>{context.role === 'admin' && <button className="primary" onClick={() => setSection('import')}>Abrir importación</button>}</Card>
      : currentSection === 'dashboard' ? <Dashboard analytics={analytics}/>
      : currentSection === 'matches' ? <Matches analytics={analytics}/>
      : currentSection === 'players' ? <Players analytics={analytics}/>
      : currentSection === 'rankings' ? <Rankings analytics={analytics}/>
      : <Bonuses analytics={analytics}/>}
  </div>;
}

function Kpis({ values }: { values: [string, string][] }) {
  return <div className="veo-kpis">{values.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}
function Dashboard({ analytics: a }: { analytics: SeasonAnalytics }) {
  const results = { wins: 0, draws: 0, losses: 0, pending: 0 };
  for (const m of a.matches) { if (m.goalsFor === null || m.goalsAgainst === null) results.pending++; else if (m.goalsFor > m.goalsAgainst) results.wins++; else if (m.goalsFor === m.goalsAgainst) results.draws++; else results.losses++; }
  const top = rankPlayers(a.players, 'index').slice(0, 5);
  const teams = a.matches.map(m => m.teams[0]?.inspire).filter(Boolean);
  const passRows = teams.filter(t => t.passes !== null && t.successfulPasses !== null);
  const passes = sumKnown(passRows.map(t => t.passes));
  return <>
    <Kpis values={[
      ['Partidos analizados', String(a.matches.length)], ['Jugadores con observaciones', String(a.players.length)],
      ['Goles a favor', veoNumber(sumKnown(a.matches.map(m => m.goalsFor)))], ['Goles recibidos', veoNumber(sumKnown(a.matches.map(m => m.goalsAgainst)))],
      ['Participaciones', String(a.facts.filter(f => f.participated).length)], ['Minutos efectivos', veoNumber(sumKnown(a.facts.map(f => f.minutes)))],
    ]}/>
    <div className="veo-columns"><Card><h3>Balance de resultados</h3><p>{results.wins} victorias · {results.draws} empates · {results.losses} derrotas · {results.pending} pendientes</p><VeoTrend label="Goles por partido" data={[...a.matches].sort((x, y) => x.date.localeCompare(y.date)).map(m => ({ name: `J${m.round}`, value: m.goalsFor }))}/></Card>
      <Card><h3>Destacados por índice VEO</h3><p>Media de índices de partidos jugados. No es la nota del entrenador.</p><VeoBars label="Índice medio" data={top.map(r => ({ name: r.player.name, value: r.value }))}/>{top.map((row, i) => <p key={row.player.key}>{i + 1}. {row.player.name} · <strong>{veoNumber(row.value)}</strong> · {row.player.appearances} partido(s)</p>)}</Card></div>
    <Card><h3>Equipo · estadísticas manuales disponibles</h3><Kpis values={[
      ['Pases de equipo', veoNumber(sumKnown(teams.map(t => t.passes)))], ['Precisión ponderada por pases', passes ? `${veoNumber((sumKnown(passRows.map(t => t.successfulPasses)) || 0) / passes * 100)} %` : 'Pendiente'],
      ['Intentos totales', veoNumber(sumKnown(teams.map(t => t.attempts)))], ['Distancia individual acumulada (km)', veoNumber(sumKnown(a.facts.map(f => f.metrics.distanceKm)))],
    ]}/><p>Los totales manuales de equipo no se sustituyen por sumas de jugadores. Las observaciones ausentes se excluyen, no se convierten en cero.</p></Card>
  </>;
}

function Matches({ analytics: a }: { analytics: SeasonAnalytics }) {
  const [id, setId] = useState(a.matches[0]?.id || '');
  const match = a.matches.find(m => m.id === id) || a.matches[0];
  const facts = a.facts.filter(f => f.match.id === match.id);
  const ranked = [...facts].filter(f => f.index !== null).sort((x, y) => y.index! - x.index!);
  const side = match.teams[0];
  const manualSecond = /segundo\s*:\s*([^.;]+)/i.exec(match.manualMvpReason || '')?.[1]?.trim();
  return <>
    <Card><h3>Partidos importados</h3><label>Seleccionar partido<select value={match.id} onChange={e => setId(e.target.value)}>{a.matches.map(m => <option key={m.id} value={m.id}>J{m.round} · {m.date} · {m.opponent}</option>)}</select></label><p>J{match.round} · {match.date} · {match.venue} · {match.opponent} · {match.goalsFor ?? '?'}–{match.goalsAgainst ?? '?'}</p>
      <p>{match.sessionId ? `Sesión revisada · revisión ${match.revision}` : 'Sesión de Supabase sin vincular (datos locales)'}</p>
      {match.notes && <details><summary>Notas originales</summary><p className="veo-notes">{match.notes}</p></details>}
      <p><strong>MVP manual:</strong> {match.manualMvp || 'No indicado'}. {match.manualMvpReason}</p>
      {match.manualMvp && ranked[0] && normalizeIdentity(match.manualMvp) !== normalizeIdentity(ranked[0].name) && <p className="veo-local-notice">El MVP manual difiere del mayor índice calculado; se conserva la anotación original.</p>}
      {ranked[0] && <p><strong>Mayor índice:</strong> {ranked[0].name} ({veoNumber(ranked[0].index)}). Las anotaciones manuales se conservan aunque difieran.</p>}
      {manualSecond && ranked[1] && normalizeIdentity(ranked[1].name) !== normalizeIdentity(manualSecond) && <p className="veo-local-notice">Discrepancia: la nota dice segundo {manualSecond}; el índice sitúa segundo a {ranked[1].name}. No se corrige la anotación automáticamente.</p>}
    </Card>
    <div className="veo-columns"><Card><h3>Equipo frente a rival</h3>{side ? <div className="veo-table-wrap"><table><thead><tr><th>Métrica manual</th><th>Inspire</th><th>Rival</th></tr></thead><tbody>{Object.keys(side.inspire).map(key => <tr key={key}><td>{METRIC_LABELS[key] || key}</td><td>{veoNumber(side.inspire[key] === null ? null : side.inspire[key] * (key === 'possession' ? 100 : 1))}{key === 'possession' ? ' %' : ''}</td><td>{veoNumber(side.opponent[key] === null ? null : side.opponent[key] * (key === 'possession' ? 100 : 1))}{key === 'possession' ? ' %' : ''}</td></tr>)}
      <tr><td>Precisión de pase</td><td>{side.inspire.passes && side.inspire.successfulPasses !== null ? `${veoNumber(side.inspire.successfulPasses / side.inspire.passes * 100)} %` : 'Pendiente'}</td><td>{side.opponent.passes && side.opponent.successfulPasses !== null ? `${veoNumber(side.opponent.successfulPasses / side.opponent.passes * 100)} %` : 'Pendiente'}</td></tr>
      </tbody></table></div> : <p>Sin estadísticas manuales de equipo.</p>}</Card><Card><h3>Ranking del partido</h3><VeoBars label="Índice VEO" data={ranked.slice(0, 6).map(f => ({ name: f.name, value: f.index! }))}/>{ranked.map((f, i) => <p key={f.playerKey}>{i + 1}. {f.name}: {veoNumber(f.index)}</p>)}</Card></div>
    <Card><h3>Participación y datos individuales</h3><FactTable facts={facts}/></Card>
  </>;
}

export function FactTable({ facts }: { facts: ComputedFact[] }) {
  return <div className="veo-table-wrap"><table><thead><tr><th>Jugador / partido</th><th>Convocado</th><th>FCF / VEO / efectivos</th><th>Índice</th><th>Goles / asist.</th><th>Distancia</th><th>Pase</th><th>Detalle</th></tr></thead><tbody>{facts.map(f => <tr key={`${f.match.id}-${f.playerKey}`}><td>{f.name}<br/>J{f.match.round} · {f.match.date}</td><td>{f.calledUp ? 'Sí' : 'No'}</td><td>{veoNumber(f.fcfMinutes)} / {veoNumber(f.veoMinutes)} / {veoNumber(f.minutes)}</td><td>{veoNumber(f.index)}</td><td>{veoNumber(f.metrics.goals)} / {veoNumber(f.metrics.assists)}</td><td>{veoNumber(f.metrics.distanceKm)} km</td><td>{f.passingRate === null ? 'Pendiente' : `${veoNumber(f.passingRate * 100)} %`}</td><td><details><summary>Métricas y notas</summary>{Object.entries(f.metrics).map(([metric, value]) => <p key={metric}>{METRIC_LABELS[metric]}: {veoNumber(value)}</p>)}<p className="veo-notes">{f.notes || 'Sin notas'}</p><p>Perfil original: {f.profile || 'Sin perfil'}</p>{Object.values(f.metrics).some(v => v === null) && <p>Entradas pendientes: el índice aplica la fórmula del libro sin completar la fuente.</p>}</details></td></tr>)}</tbody></table></div>;
}

function Players({ analytics: a }: { analytics: SeasonAnalytics }) {
  const [key, setKey] = useState(new URLSearchParams(window.location.search).get('player') || a.players[0]?.key || '');
  const [match, setMatch] = useState('all');
  const filtered = match === 'all' ? a : seasonAnalytics(a.matches.filter(m => m.id === match), a.matches[0]?.season || '');
  const player = filtered.players.find(p => p.key === key) || filtered.players[0];
  return <Card><h3>Analítica individual VEO</h3><div className="veo-source-controls"><label>Jugador<select value={player?.key || ''} onChange={e => setKey(e.target.value)}>{a.players.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label><label>Partido (estadísticas deportivas)<select value={match} onChange={e => setMatch(e.target.value)}><option value="all">Toda la temporada importada</option>{a.matches.map(m => <option key={m.id} value={m.id}>J{m.round} · {m.opponent}</option>)}</select></label></div>
    {player ? <PlayerDetail player={player}/> : <p>Sin observaciones para el jugador y filtro seleccionado.</p>}
  </Card>;
}
export function PlayerDetail({ player: p }: { player: PlayerSeason }) {
  return <><h3>{p.fullName || p.name}</h3><p>Datos VEO independientes de asistencia y evaluación del entrenador. Medias por partido jugado con dato disponible.</p>
    <Kpis values={[
      ['Participaciones', String(p.appearances)], ['Minutos FCF', veoNumber(p.fcfMinutes)], ['Minutos VEO', veoNumber(p.veoMinutes)],
      ['Minutos efectivos', veoNumber(p.minutes)], ['Goles', veoNumber(p.totals.goals)], ['Asistencias', veoNumber(p.totals.assists)], ['Índice medio VEO', veoNumber(p.index)],
    ]}/>
    <VeoTrend label="Evolución del índice VEO" data={[...p.facts].sort((a, b) => a.match.date.localeCompare(b.match.date)).map(f => ({ name: `J${f.match.round}`, value: f.index }))}/>
    <div className="veo-table-wrap"><table><thead><tr><th>Métrica</th><th>Total / agregado</th><th>Media por partido con dato</th><th>Cobertura</th></tr></thead><tbody>{Object.keys(p.totals).map(metric => <tr key={metric}><td>{METRIC_LABELS[metric]}</td><td>{veoNumber(rankingValue(p, metric as RankingMetric))}</td><td>{metric === 'maxSpeedKmh' ? 'Máximo, no suma' : metric === 'averageSpeedKmh' ? 'Media ponderada por minutos' : veoNumber(p.averages[metric as keyof typeof p.averages])}</td><td>{p.facts.filter(f => f.participated && f.metrics[metric as keyof typeof p.totals] !== null).length} partido(s)</td></tr>)}</tbody></table></div>
    <h4>Histórico individual</h4><FactTable facts={p.facts}/>
  </>;
}

function Rankings({ analytics: a }: { analytics: SeasonAnalytics }) {
  const [metric, setMetric] = useState<RankingMetric>('index'), [mode, setMode] = useState<'total' | 'average'>('total');
  const [first, setFirst] = useState(a.players[0]?.key || ''), [second, setSecond] = useState(a.players[1]?.key || '');
  const ranked = rankPlayers(a.players, metric, mode);
  const left = a.players.find(p => p.key === first), right = a.players.find(p => p.key === second);
  return <><Card><h3>Clasificaciones deportivas</h3><div className="veo-source-controls"><label>Métrica del ranking<select value={metric} onChange={e => setMetric(e.target.value as RankingMetric)}>{Object.entries(labels).filter(([key]) => !['attempts', 'possession', 'conversion', 'failedPasses'].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Agregación<select value={mode} onChange={e => setMode(e.target.value as 'total' | 'average')}><option value="total">Total / agregado de la métrica</option><option value="average">Media por partido jugado con dato</option></select></label></div>
    <p>Sin datos no equivale a cero. Velocidad máxima: mejor registro; velocidad media: ponderada por minutos; precisión: pases exitosos / pases con dato de éxito; índice: media de partidos jugados. Las demás medias usan partidos jugados con esa métrica disponible.</p>
    <VeoBars label={labels[metric]} data={ranked.slice(0, 6).map(r => ({ name: r.player.name, value: metric === 'passingRate' ? r.value * 100 : r.value }))}/>
    <div className="veo-table-wrap"><table><thead><tr><th>Puesto</th><th>Jugador</th><th>{labels[metric]}</th><th>Participaciones</th></tr></thead><tbody>{ranked.map((r, i) => <tr key={r.player.key}><td>{i + 1}</td><td>{r.player.name}</td><td>{veoNumber(metric === 'passingRate' ? r.value * 100 : r.value)}{metric === 'passingRate' ? ' %' : ''}</td><td>{r.player.appearances}</td></tr>)}</tbody></table></div>
    {!ranked.length && <p>No hay observaciones para esta métrica.</p>}
    </Card><Card><h3>Comparar jugadores</h3><div className="veo-source-controls">{[['Jugador A', first, setFirst], ['Jugador B', second, setSecond]].map(([label, value, setter]) => <label key={label as string}>{label as string}<select value={value as string} onChange={e => (setter as typeof setFirst)(e.target.value)}><option value="">Seleccionar</option>{a.players.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>)}</div>
    {left && right ? <div className="veo-table-wrap"><table><thead><tr><th>Métrica</th><th>{left.name}</th><th>{right.name}</th></tr></thead><tbody>{(['index', 'minutes', 'goals', 'assists', 'distanceKm', 'sprints', 'maxSpeedKmh', 'passingRate', 'tackles', 'interceptions', 'recoveries'] as RankingMetric[]).map(key => <tr key={key}><td>{labels[key]}</td><td>{veoNumber(key === 'passingRate' ? (left.passingRate === null ? null : left.passingRate * 100) : rankingValue(left, key))}{key === 'passingRate' ? ' %' : ''}</td><td>{veoNumber(key === 'passingRate' ? (right.passingRate === null ? null : right.passingRate * 100) : rankingValue(right, key))}{key === 'passingRate' ? ' %' : ''}</td></tr>)}</tbody></table></div> : <p>Selecciona dos jugadores con observaciones.</p>}
    </Card></>;
}

function Bonuses({ analytics: a }: { analytics: SeasonAnalytics }) {
  return <>
    <Card><h3>Primas calculadas · no son pagos</h3><p>Temporada 2026–2027: contadores desde J5 inclusive. J1–J4 se excluyen solo de primas. 10 € por las primeras siete ocurrencias y 20 € desde la octava, por jugador y categoría. Derrotas acumulan goles y asistencias pero no pagan. P0 exige elegibilidad y más de 65 minutos efectivos.</p>
      <p className="veo-local-notice">{a.bonusStart === null ? 'Temporada sin regla de primas aprobada: importes no calculables.' : a.historyComplete ? `Sin huecos entre J5 y J${Math.max(...a.matches.map(m => m.round))}. Esto no certifica que la temporada esté finalizada ni que no falten partidos futuros.` : `Historial incompleto desde J5. Jornadas faltantes: ${a.missingRounds.join(', ') || 'sin partidos elegibles'}. Importes provisionales con los datos disponibles.`}</p>
      <p>Total calculado: <strong>{veoMoney(a.bonusCents)}</strong></p>
    </Card>
    <Card><h3>Desglose por jugador</h3><div className="veo-table-wrap"><table><thead><tr><th>Jugador</th><th>Goles</th><th>Asistencias</th><th>P0</th><th>Total calculado</th></tr></thead><tbody>{a.players.map(p => <tr key={p.key}><td>{p.name}</td><td>{p.facts.some(f => !f.bonus) ? 'Pendiente' : veoMoney(sumKnown(p.facts.map(f => f.bonus!.goalsCents)))}</td><td>{p.facts.some(f => !f.bonus) ? 'Pendiente' : veoMoney(sumKnown(p.facts.map(f => f.bonus!.assistsCents)))}</td><td>{p.facts.some(f => !f.bonus) ? 'Pendiente' : veoMoney(sumKnown(p.facts.map(f => f.bonus!.cleanSheetCents)))}</td><td>{veoMoney(p.bonusCents)}</td></tr>)}</tbody></table></div></Card>
    <Card><h3>Por partido y explicación del importe</h3>{a.matches.map(match => {
      const rows = a.facts.filter(f => f.match.id === match.id);
      return <details key={match.id}><summary>J{match.round} · {match.opponent} · {rows.some(f => !f.bonus) ? 'No calculable' : veoMoney(sumKnown(rows.map(f => f.bonus!.totalCents)))}</summary>
        {rows.map(f => <p key={f.playerKey}><strong>{f.name}: {veoMoney(f.bonus?.totalCents ?? null)}</strong> · {f.bonusExcluded ? 'Excluido: jornada anterior a J5.' : !f.bonus ? 'Faltan datos para verificar contadores.' : `Previos: ${f.bonus.previousGoals} goles, ${f.bonus.previousAssists} asistencias, ${f.bonus.previousCleanSheets} P0. Ahora: ${f.metrics.goals ?? '?'} goles, ${f.metrics.assists ?? '?'} asistencias y ${f.bonus.cleanSheetOccurrence} P0 elegible. Goles ${veoMoney(f.bonus.goalsCents)}, asistencias ${veoMoney(f.bonus.assistsCents)}, P0 ${veoMoney(f.bonus.cleanSheetCents)}. ${match.goalsFor === null || match.goalsAgainst === null ? 'Resultado pendiente: no genera importe.' : match.goalsFor < match.goalsAgainst ? 'Derrota: acumula sin generar importe.' : 'Victoria/empate: aplica base o tramo desde la octava ocurrencia.'}`}</p>)}
      </details>;
    })}</Card>
  </>;
}
