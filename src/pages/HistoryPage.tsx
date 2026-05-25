import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { Card, PageTitle } from '../components/ui';
import { formatDate } from '../utils/formatters';

export function HistoryPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [callups, setCallups] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [suspensions, setSuspensions] = useState<any[]>([]);
  const [view, setView] = useState<'players' | 'cards' | 'summary'>('players');

  async function loadSessions() {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .order('session_date', { ascending: false });

    setSessions(data || []);
    setSelectedSessionId((data || [])[0]?.id || '');
  }

  async function loadHistory(sessionId: string) {
    if (!sessionId) return;

    const call = await supabase.from('callups').select('*,players(display_name,position,status)').eq('session_id', sessionId);
    const att = await supabase.from('attendance').select('*,players(display_name)').eq('session_id', sessionId);
    const ev = await supabase.from('evaluations').select('*,players(display_name)').eq('session_id', sessionId);
    const ca = await supabase.from('cards').select('*,players(display_name)').eq('session_id', sessionId);
    const su = await supabase.from('suspensions').select('*,players(display_name)').eq('created_from_session_id', sessionId);

    setCallups(call.data || []);
    setAttendance(att.data || []);
    setEvaluations(ev.data || []);
    setCards(ca.data || []);
    setSuspensions(su.data || []);
  }

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { if (selectedSessionId) loadHistory(selectedSessionId); }, [selectedSessionId]);

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
        callup: c ? translateCallup(c.status) : 'No convocado',
        attendance: a ? translateAttendance(a.status) : '-',
        total_score: e?.total_score || '-',
        evaluated: e?.evaluated ? 'Sí' : 'No',
        tactical_discipline: e?.tactical_discipline ?? '-',
        effort_commitment: e?.effort_commitment ?? '-',
        decision_making: e?.decision_making ?? '-',
        mentality_attitude: e?.mentality_attitude ?? '-',
        coachability: e?.coachability ?? '-',
        comment: e?.comment || '',
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [callups, attendance, evaluations]);

  const topPlayers = [...evaluations]
    .filter(e => e.total_score)
    .sort((a, b) => Number(b.total_score) - Number(a.total_score))
    .slice(0, 3);

  return (
    <div className="stack">
      <PageTitle title="Histórico admin" subtitle="Revisa convocatoria, asistencia, evaluaciones, tarjetas y sanciones de cada sesión." />

      <select value={selectedSessionId} onChange={e => setSelectedSessionId(e.target.value)}>
        {sessions.map(s => (
          <option key={s.id} value={s.id}>{s.name} · {formatDate(s.session_date)}</option>
        ))}
      </select>

      {selectedSession && (
        <Card>
          <p className="kicker">Sesión seleccionada</p>
          <h2>{selectedSession.name}</h2>
          <p>{formatDate(selectedSession.session_date)} · {selectedSession.type}</p>
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
            <Card><p className="kicker">Convocados</p><h2>{callups.length}</h2></Card>
            <Card><p className="kicker">Asistencias</p><h2>{attendance.length}</h2></Card>
            <Card><p className="kicker">Evaluaciones</p><h2>{evaluations.filter(e => e.evaluated).length}</h2></Card>
          </div>

          <Card>
            <p className="kicker">Top 3 sesión</p>
            {topPlayers.length === 0 && <p>No hay evaluaciones.</p>}
            {topPlayers.map((e, i) => (
              <div className="top-row" key={e.id}>
                <span className="rank">#{i + 1}</span>
                <strong>{e.players?.display_name || 'Jugador'}</strong>
                <span>{e.total_score}</span>
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
                  <span>Coach: {row.coachability}</span>
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

function translateAttendance(status?: string | null) {
  const map: Record<string, string> = {
    present: 'Presente',
    late: 'Tarde',
    justified_late: 'Tarde justificado',
    justified_absence: 'Ausencia justificada',
    unjustified_absence: 'Ausencia',
    injured: 'Lesionado',
  };
  return status ? map[status] || status : '-';
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
