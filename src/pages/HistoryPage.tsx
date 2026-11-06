import { attendanceStats } from '../utils/attendance';
import { loadAttendanceStatistics } from '../lib/attendance';
import { AttendanceBreakdown } from '../components/AttendanceBreakdown';
import { OFFICIAL_PERFORMANCE_LABEL } from '../utils/performance';
import { evaluationTotal } from '../utils/evaluationScores';
import { useEffect, useMemo, useRef, useState } from 'react';
import { readPerformancePages } from '../lib/performance';
import { countableEvaluations } from '../utils/evaluationEligibility';
import { supabase } from '../supabase';
import { Card, PageTitle } from '../components/ui';
import { formatDate, translateAttendance, translateSessionType, translateSessionStatus } from '../utils/formatters';
import { loadAllSessions } from '../lib/data';

export function HistoryPage() {
  const [attendanceError,setAttendanceError]=useState('');
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [callups, setCallups] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [suspensions, setSuspensions] = useState<any[]>([]);
  const [view, setView] = useState<'players' | 'cards' | 'summary'>('players');
  const [historyLoading,setHistoryLoading]=useState(false);
  const historyRequest=useRef(0);

  async function loadSessions() {
    try {
      const data = await loadAllSessions(); setSessions(data); setSelectedSessionId(data[0]?.id || '');
    } catch (error) { setSessions([]); setAttendanceError('No se pudo leer el catálogo histórico: ' + String(error)); }
  }

  async function loadHistory(sessionId: string) {
    if (!sessionId) return;
    const request=++historyRequest.current;
    setHistoryLoading(true);setAttendanceError('');setCallups([]);setAttendance([]);setEvaluations([]);setCards([]);setSuspensions([]);
    try {
      const [call,att,ev,ca,su]=await Promise.all([
        readPerformancePages<any>((a,b)=>supabase.from('callups').select('*,players(display_name,position,status)').eq('session_id',sessionId).order('id').range(a,b)),
        loadAttendanceStatistics({sessionId}),
        readPerformancePages<any>((a,b)=>supabase.from('evaluations').select('*,players(display_name)').eq('session_id',sessionId).order('id').range(a,b)),
        readPerformancePages<any>((a,b)=>supabase.from('cards').select('*,players(display_name)').eq('session_id',sessionId).order('id').range(a,b)),
        readPerformancePages<any>((a,b)=>supabase.from('suspensions').select('*,players(display_name)').eq('created_from_session_id',sessionId).order('id').range(a,b)),
      ]);
      if(request!==historyRequest.current)return;
      if(att.error)throw new Error(att.error.message);
      setCallups(call);setAttendance(att.data);setEvaluations(ev);setCards(ca);setSuspensions(su);
    }catch(error){if(request===historyRequest.current)setAttendanceError(String(error))}
    finally{if(request===historyRequest.current)setHistoryLoading(false)}
  }

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { if (selectedSessionId) void loadHistory(selectedSessionId);return()=>{historyRequest.current++}; }, [selectedSessionId]);

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  const playerRows = useMemo(() => {
    const ids = new Set<string>();
    callups.forEach(c => ids.add(c.player_id));
    attendance.forEach(a => ids.add(a.player_id));
    evaluations.forEach(e => ids.add(e.player_id));

    return Array.from(ids).map(id => {
      const c = callups.find(x => x.player_id === id);
      const a = attendance.find(x => x.player_id === id);
      const e = evaluations.find(x => x.player_id === id);
      const playerName = c?.players?.display_name || a?.players?.display_name || e?.players?.display_name || 'Jugador';

      return {
        player_id: id,
        name: playerName,
        callup: c ? translateCallup(c.status) : 'Sin registro',
        attendance: a ? translateAttendance(a.status) : 'Sin registro',
        total_score: selectedSession?.records_only_confirmed ? 'N/A' : (e?.evaluated ? (evaluationTotal(e) ?? 'N/A') : 'N/A'),
        evaluated: !selectedSession?.records_only_confirmed && e?.evaluated && evaluationTotal(e) !== null ? 'Sí' : 'No',
        tactical_discipline: selectedSession?.records_only_confirmed ? '-' : (e?.na_fields?.tactical_discipline || e?.not_applicable ? 'N/A' : (e?.tactical_discipline ?? '-')),
        effort_commitment: selectedSession?.records_only_confirmed ? '-' : (e?.na_fields?.effort_commitment || e?.not_applicable ? 'N/A' : (e?.effort_commitment ?? '-')),
        decision_making: selectedSession?.records_only_confirmed ? '-' : (e?.na_fields?.decision_making || e?.not_applicable ? 'N/A' : (e?.decision_making ?? '-')),
        mentality_attitude: selectedSession?.records_only_confirmed ? '-' : (e?.na_fields?.mentality_attitude || e?.not_applicable ? 'N/A' : (e?.mentality_attitude ?? '-')),
        coachability: selectedSession?.records_only_confirmed ? '-' : (e?.na_fields?.coachability || e?.not_applicable ? 'N/A' : (e?.coachability ?? '-')),
        comment: e?.comment || '',
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [callups, attendance, evaluations, selectedSession]);

  const topPlayers = (selectedSession ? countableEvaluations(evaluations,[selectedSession],callups,attendance).evaluations : [])
    .filter(e => e.evaluated && evaluationTotal(e)!==null)
    .sort((a, b) => Number(evaluationTotal(b)) - Number(evaluationTotal(a)))
    .slice(0, 3);

  return (
    <div className="stack">
      <PageTitle title="Histórico" subtitle="Revisa convocatoria, asistencia, evaluaciones, tarjetas y sanciones de cada sesión." />

      {attendanceError && <p role="alert">No se pudo verificar el historial: {attendanceError}</p>}
      {historyLoading && <p role="status">Cargando historial de la sesión…</p>}

      <select aria-label="Sesión del historial" value={selectedSessionId} onChange={e => setSelectedSessionId(e.target.value)}>
        {sessions.map(s => (
          <option key={s.id} value={s.id}>{s.name} · {formatDate(s.session_date)} · {translateSessionStatus(s.status)}</option>
        ))}
      </select>

      {selectedSession && (
        <Card>
          <p className="kicker">Sesión seleccionada</p>
          <h2>{selectedSession.name}</h2>
          <p>{formatDate(selectedSession.session_date)} · {translateSessionType(selectedSession.type)}</p>
          {selectedSession.records_only_confirmed && <p className="muted">Registros confirmados · sin puntuaciones deportivas</p>}
        </Card>
      )}

      <div className="segmented mini">
        <button className={view === 'players' ? 'selected' : ''} onClick={() => setView('players')}>Jugadores</button>
        <button className={view === 'cards' ? 'selected' : ''} onClick={() => setView('cards')}>Tarjetas</button>
        <button className={view === 'summary' ? 'selected' : ''} onClick={() => setView('summary')}>Resumen</button>
      </div>

      {view === 'summary' && (
        <>
          <div className="history-grid">
            <Card><p className="kicker">Convocados</p><h2>{callups.filter(c => c.status !== 'not_called').length}</h2></Card>
            <Card><p className="kicker">Asistencias</p><h2>{attendanceError ? '-' : attendanceStats(attendance).recorded}</h2></Card>
            <Card><p className="kicker">Evaluaciones</p><h2>{selectedSession?.records_only_confirmed ? 0 : evaluations.filter(e => e.evaluated && evaluationTotal(e) !== null).length}</h2></Card>
          </div>

          <Card>
            <AttendanceBreakdown rows={attendance} error={attendanceError}/><p className="kicker">Top 3 sesión</p><p className="muted">{OFFICIAL_PERFORMANCE_LABEL}. Las notas y comentarios anteriores se conservan en Jugadores.</p>
            {topPlayers.length === 0 && <p>No hay evaluaciones.</p>}
            {topPlayers.map((e, i) => (
              <div className="top-row" key={e.id}>
                <span className="rank">#{i + 1}</span>
                <strong>{e.players?.display_name || 'Jugador'}</strong>
                <span>{evaluationTotal(e) ?? "N/A"}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      {view === 'cards' && (
        <>
          <Card>
            <p className="kicker">Tarjetas</p>
            {cards.length === 0 && <p>No hay tarjetas registradas.</p>}
            {cards.map(c => (
              <p key={c.id}>
                <strong>{c.players?.display_name || 'Jugador'}</strong> · {translateCard(c.type)} {c.reason ? `· ${c.reason}` : ''}
              </p>
            ))}
          </Card>

          <Card>
            <p className="kicker">Sanciones creadas en esta sesión</p>
            {suspensions.length === 0 && <p>No hay sanciones registradas.</p>}
            {suspensions.map(s => (
              <p key={s.id}>
                <strong>{s.players?.display_name || 'Jugador'}</strong> · {s.matches_total} partido(s) · {translateSuspension(s.status)}
              </p>
            ))}
          </Card>
        </>
      )}

      {view === 'players' && (
        <Card>
          <p className="kicker">Detalle por jugador</p>
          <div className="history-player-list">
            {playerRows.map(row => (
              <div className="history-player-card" key={row.player_id}>
                <div className="row">
                  <strong>{row.name}</strong>
                  <span className="score-mini">{row.total_score}</span>
                </div>
                <p>Convocatoria: {row.callup}</p>
                <p>Asistencia: {row.attendance}</p>
                <p>Evaluado: {row.evaluated}</p>
                <div className="mini-ratings">
                  <span>Disc: {row.tactical_discipline}</span>
                  <span>Esf: {row.effort_commitment}</span>
                  <span>Dec: {row.decision_making}</span>
                  <span>Act: {row.mentality_attitude}</span>
                  <span>Quinta cualidad histórica (fuera de la media): {row.coachability}</span>
                </div>
                {row.comment && <p className="muted">Comentario: {row.comment}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function translateCallup(status?: string | null) {
  const map: Record<string, string> = {
    called_up: 'Convocado',
    trial: 'Prueba',
    guest_not_evaluable: 'Invitado',
    not_called: 'No convocado',
  };
  return status ? map[status] || status : '-';
}

function translateCard(type?: string | null) {
  const map: Record<string, string> = {
    yellow: 'Amarilla',
    double_yellow: 'Doble amarilla',
    straight_red: 'Roja directa',
  };
  return type ? map[type] || type : '-';
}

function translateSuspension(status?: string | null) {
  const map: Record<string, string> = {
    active: 'Activa',
    served: 'Cumplida',
    cancelled: 'Cancelada',
  };
  return status ? map[status] || status : '-';
}
