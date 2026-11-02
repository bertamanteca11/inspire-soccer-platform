import { playerPerformanceAverages } from '../utils/evaluationEligibility';
import { loadHistoricalEvaluations } from '../lib/evaluationHistory';
import type { SportingEvaluation } from '../utils/evaluationEligibility';
import { ATTENDANCE_METRICS, attendanceStats, attendanceRanking } from '../utils/attendance';
import { AttendanceBreakdown } from '../components/AttendanceBreakdown';
import { OFFICIAL_PERFORMANCE_LABEL } from '../utils/performance';
import { evaluationTotal, fieldScore } from '../utils/evaluationScores';
import { useEffect, useState } from 'react';
import type { Evaluation } from '../types';
import type { AppSession, PlayerCardTotal } from '../utils/appTypes';
import { ratingFields } from '../utils/appTypes';
import { formatDate, translateAttendance, translateSessionType } from '../utils/formatters';
import { getCardWarnings, getRatingCounts } from '../utils/stats';
import { Card, PageTitle } from '../components/ui';
import { loadSummaryData, type SummaryData } from '../lib/summary';
import { attendanceTrace, operationalExclusion, recordsInScope, sessionsInScope, summaryCardTotals, type SummaryScope } from '../utils/summaryScope';

const emptyData: SummaryData = { sessions: [], attendance: [], evaluations: [], cards: [], players: [] };
export function SummaryPage({ initialSessionId = '' }: { initialSessionId?: string } = {}) {
  const [data, setData] = useState<SummaryData>(emptyData);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<SummaryScope['mode']>(initialSessionId ? 'session' : 'period');
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState(initialSessionId), [playerId, setPlayerId] = useState('');
  const [originals, setOriginals] = useState<SportingEvaluation[]>([]), [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  useEffect(() => {
    let cancelled = false; setOriginals([]); setHistoryError('');
    if (mode === 'period' || mode === 'session' && !sessionId) { setHistoryLoading(false); return; }
    setHistoryLoading(true);
    loadHistoricalEvaluations(playerId,mode === 'session' ? sessionId : '').then(rows => { if(!cancelled)setOriginals(rows); })
      .catch(error => { if(!cancelled)setHistoryError(String(error)); }).finally(() => { if(!cancelled)setHistoryLoading(false); });
    return () => { cancelled = true; };
  },[mode,sessionId,playerId]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setData(emptyData);
    loadSummaryData().then(result => {
      if (cancelled) return;
      setData(result); setSessionId(current => result.sessions.some(s => s.id === current) ? current : result.sessions[0]?.id || '');
      setLoading(false);
    }).catch(failure => {
      if (!cancelled) { setError(failure instanceof Error ? failure.message : 'No se pudo leer el resumen.'); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [attempt]);
  const scopedSessions = sessionsInScope(data.sessions, { mode, from, to, sessionIds: mode === 'session' ? [sessionId] : selectedIds });
  const attendance = recordsInScope(data.attendance, scopedSessions, mode, playerId);
  const evaluations = recordsInScope(data.evaluations, scopedSessions, mode, playerId);
  const cards = recordsInScope(data.cards, scopedSessions, mode, playerId);
  const trace = attendanceTrace(scopedSessions, attendance, playerId);
  const validDates = !from || !to || from <= to;
  const candidates = data.sessions.filter(s => (!from || s.session_date >= from) && (!to || s.session_date <= to));
  const unresolved = playerId ? trace.filter(row => !row.attendance.length).length : 0;
  const unlinked = attendance.filter(a => !data.sessions.some(s => s.id === a.session_id));
  const excluded = (data.excluded || []).filter(e => (!playerId || e.row.player_id === playerId) && (mode === 'history' || scopedSessions.some(s => s.id === e.row.session_id)));
  return <div className="stack">
    <PageTitle title="Resumen" subtitle="Asistencia registrada y sesiones que contribuyen a cada total."/>
    <div className="segmented">
      <button className={mode === 'period' ? 'selected' : ''} onClick={() => setMode('period')}>Periodo y sesiones</button>
      <button className={mode === 'history' ? 'selected' : ''} onClick={() => setMode('history')}>Historial completo</button>
      <button className={mode === 'session' ? 'selected' : ''} onClick={() => setMode('session')}>Por sesión</button>
    </div>
    {loading ? <p role="status">Cargando resumen completo…</p> : error ? <Card><p role="alert">No se pudo cargar el resumen: {error}</p><button onClick={() => setAttempt(n => n + 1)}>Volver a cargar</button></Card> : <>
      <Card>
        <p>{mode === 'history' ? 'Historial completo de asistencia y tarjetas: incluye registros históricos, sesiones planificadas, archivadas y de prueba. No es el total operativo oficial.' : mode === 'session' ? 'Detalle histórico de una sesión. Consultarla no la incorpora al total operativo.' : 'Total operativo del periodo: solo sesiones completadas que selecciones explícitamente como actividad real. No hay sesiones incluidas automáticamente.'}</p>
        <p className="muted">{OFFICIAL_PERFORMANCE_LABEL}. Se conserva la exclusión de Solo registros en las puntuaciones; la asistencia no recibe ese corte.</p>
        <label>Jugador del resumen<select value={playerId} onChange={e => setPlayerId(e.target.value)}><option value="">Todo el equipo</option>{data.players.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
        {mode === 'period' && <>
          <label>Desde<input type="date" value={from} onChange={e => { setFrom(e.target.value); setSelectedIds([]); }}/></label>
          <label>Hasta<input type="date" value={to} onChange={e => { setTo(e.target.value); setSelectedIds([]); }}/></label>
          {!validDates && <p role="alert">La fecha inicial debe ser anterior o igual a la final.</p>}
          <p>Revisa cada sesión antes de incluirla. Un tryout real no es un registro de prueba. Si una sesión de prueba no tiene una marca explícita, déjala sin seleccionar. Esta selección no modifica la base de datos.</p>
          <button onClick={() => setSelectedIds([])}>Quitar selección de sesiones</button>
          <fieldset><legend>Sesiones revisadas para el total operativo</legend>
            {validDates && candidates.map(s => { const reason = operationalExclusion(s); return <label key={s.id} style={{ display: 'block' }}>
              <input type="checkbox" checked={selectedIds.includes(s.id) && !reason} disabled={!!reason} onChange={e => setSelectedIds(ids => e.target.checked ? [...ids, s.id] : ids.filter(id => id !== s.id))}/>
              {s.name} · {formatDate(s.session_date)} · {translateSessionType(s.type)} · {reason || 'Completada; confirmar actividad real'} · {s.id}
            </label>; })}
            {validDates && !candidates.length && <p>No hay sesiones en este periodo.</p>}
          </fieldset>
        </>}
      </Card>
      {mode !== 'session' && !scopedSessions.length && <p role="status">No hay sesiones incluidas. Ninguna ausencia o presencia se infiere de esta selección.</p>}
      {mode !== 'session' ? <GlobalSummary evaluations={evaluations} attendance={attendance} attendanceError="" cardTotals={summaryCardTotals(cards)}/> : <SessionSummary sessions={data.sessions} selectedSessionId={sessionId} setSelectedSessionId={setSessionId} evaluations={evaluations} attendance={attendance} attendanceError="" cards={cards}/>}
      <Card><h3>Sesiones y registros incluidos</h3><p>{scopedSessions.length} sesiones · {attendanceStats(attendance).recorded} registros de asistencia · {cards.length} tarjetas en este ámbito.</p>
        {!!excluded.length && <details><summary>{excluded.length} evaluaciones fuera del cómputo</summary>{excluded.map((e,i) => <p key={i}>{e.row.player_id} · {e.row.session_id}: {e.reason}. El registro original se conserva.</p>)}</details>}
        {playerId && <p>{unresolved} sesiones sin registro para este jugador. Sin registro no significa presente ni ausente.</p>}
        <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Sesión</th><th>Fecha / estado</th><th>Registros de asistencia</th></tr></thead><tbody>{trace.map(({ session, attendance: rows, duplicate }) => <tr key={session.id}>
          <td>{session.name}<small style={{ display: 'block' }}>{session.id}</small></td><td>{formatDate(session.session_date)} · {session.status}{operationalExclusion(session) && <p>{operationalExclusion(session)}</p>}</td>
          <td>{rows.length ? <details><summary>{rows.length} registros</summary>{rows.map((row, index) => <p key={row.id || index}>{row.players?.display_name || data.players.find(p => p.id === row.player_id)?.display_name || row.player_id}: {translateAttendance(row.status || '')} · registro {row.id || 'sin ID'}</p>)}</details> : 'Sin registro — no suma presencia ni ausencia'}
            {duplicate && <p role="alert">Hay varios registros para un jugador y sesión. Se muestran las filas almacenadas; revisa la discrepancia antes de interpretar el total.</p>}</td>
        </tr>)}</tbody></table></div>
        {!!unlinked.length && <p role="alert">{unlinked.length} registros históricos sin sesión accesible. Se conservan en el historial completo y no se incluyen en el periodo operativo.</p>}
      </Card>
      {mode !== 'period' && <Card><h3>Evaluaciones originales conservadas</h3><p>Incluye sesiones archivadas y registros no elegibles. Son datos históricos, no el ranking operativo. El total almacenado se muestra solo como referencia; no sustituye el cálculo vigente.</p>
        {historyLoading ? <p role="status">Leyendo evaluaciones originales…</p> : historyError ? <p role="alert">No se pudo leer el historial de evaluaciones: {historyError}</p> : <details><summary>{originals.length} evaluaciones originales</summary>
          {originals.map(row => <div key={row.id}><strong>{row.players?.display_name || row.player_id}</strong><p>{data.sessions.find(s=>s.id===row.session_id)?.name || row.session_id} · Registro {row.id} · Total almacenado: {row.total_score ?? 'Sin dato'}</p>
            {ratingFields.map(([field,label]) => <p key={field}>{label}: {row[field] ?? 'Sin dato'}{row.not_applicable || row.na_fields?.[field] === true ? ' (N/A)' : ''}</p>)}<p>{row.comment || ''}</p>
          </div>)}
        </details>}
      </Card>}
    </>}
  </div>;
}
function SessionSummary({ sessions, selectedSessionId, setSelectedSessionId, evaluations, attendance, attendanceError, cards }: any) { const recordsOnly = Boolean(sessions.find((s: AppSession) => s.id === selectedSessionId)?.records_only_confirmed); const confirmedEvaluations = recordsOnly ? [] : evaluations.filter((e: Evaluation) => e.evaluated && !e.not_applicable); const byScore = [...confirmedEvaluations].filter((e: Evaluation) => evaluationTotal(e)!==null).sort((a: any,b: any) => Number(evaluationTotal(b))-Number(evaluationTotal(a))); const counts = getRatingCounts(confirmedEvaluations); return <div className="stack"><select value={selectedSessionId} onChange={e => setSelectedSessionId(e.target.value)}>{sessions.map((s: AppSession) => <option key={s.id} value={s.id}>{s.name} · {formatDate(s.session_date)}</option>)}</select>{recordsOnly && <Card><p>Solo registros · sin evaluación deportiva. Se mantienen las asistencias y tarjetas.</p></Card>}<Card className="summary-hero"><div><p className="kicker">Evaluaciones</p><h2>{confirmedEvaluations.filter((e: Evaluation) => evaluationTotal(e) !== null).length}</h2></div><div><p className="kicker">Asistencias</p><h2>{attendanceError ? '-' : attendanceStats(attendance).recorded}</h2></div></Card><Card><AttendanceBreakdown rows={attendance} error={attendanceError}/></Card><Card><p className="kicker">3 jugadores destacados</p>{byScore.slice(0,3).map((e: any,i: number) => <div className="top-row" key={e.id}><span className="rank">#{i+1}</span><strong>{e.players?.display_name}</strong><span>{evaluationTotal(e) ?? "N/A"}</span></div>)}</Card><Card><p className="kicker">Tarjetas sesión</p>{cards.length === 0 && <p>Sin tarjetas.</p>}{cards.map((c: any) => <div className="card-alert" key={c.id}><strong>{c.players?.display_name}</strong><span>{c.type}</span></div>)}</Card><Card><p className="kicker">Balance rendimiento equipo</p>{ratingFields.map(([field,label]) => { const high = counts.high[field] || 0; const low = counts.low[field] || 0; const total = Math.max(confirmedEvaluations.filter((e: Evaluation) => fieldScore(e, field) !== null).length, 1); return <div className="summary-bar" key={field}><div className="summary-top"><strong>{label}</strong><span>{high} altas · {low} bajas</span></div><div className="bar-track"><div className="bar-high" style={{ width: `${(high/total)*100}%` }} /><div className="bar-low" style={{ width: `${(low/total)*100}%` }} /></div></div>; })}</Card></div>; }
function GlobalSummary({ evaluations, attendance, attendanceError, cardTotals }: any) {
  const cards = getCardWarnings(cardTotals);
  const players = playerPerformanceAverages(evaluations);
  return <div className="stack">
    <Card><p className="kicker">Tarjetas del ámbito</p>{cards.map(c => <div className="card-alert" key={c.player_id}><strong>{c.display_name}</strong><span>{c.yellow_cards} amarillas · {c.red_cards} rojas</span></div>)}</Card>
    <Card><p className="kicker">Mejores jugadores del ámbito</p>{players.slice(0,8).map((p,i) => <div className="top-row" key={p.player_id}><span className="rank">#{i+1}</span><strong>{p.name}</strong><span>{p.average.toFixed(2)}</span></div>)}{!players.length && <p>Sin evaluaciones elegibles con puntuaciones.</p>}</Card>
    <Card><p className="kicker">Top por disciplina</p>{ratingFields.map(([field,label]) => {
      const ranked = players.map(p => { const values = p.fields[field] || []; return { ...p, mean: values.length ? values.reduce((a,b)=>a+b,0)/values.length : null }; })
        .filter(p => p.mean !== null).sort((a,b) => b.mean!-a.mean! || a.name.localeCompare(b.name,'es') || a.player_id.localeCompare(b.player_id));
      const top = ranked[0]; return <p key={field}><strong>{label}:</strong> {top ? top.name + ' · ' + top.mean!.toFixed(2) : '-'}</p>;
    })}</Card>
    <Card><p className="kicker">Asistencia del ámbito</p><AttendanceBreakdown rows={attendance} error={attendanceError}/>{!attendanceError && ATTENDANCE_METRICS.map(([metric,label]) => { const top = attendanceRanking(attendance,metric)[0]; return <p key={metric}><strong>{label}:</strong> {top ? top.name+' · '+top.count : '-'}</p>; })}</Card>
  </div>;
}
