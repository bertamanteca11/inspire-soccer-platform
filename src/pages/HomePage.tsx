import { AlertTriangle, Trophy, Ban, ClipboardList } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { Attendance, Evaluation, Player, Role } from '../types';
import type { AppSession, PlayerCardTotal, Tab } from '../utils/appTypes';
import { buildSessionLabel } from '../utils/formatters';
import { getCardWarnings } from '../utils/stats';
import { Action, Card } from '../components/ui';

const LOGO_URL = '/assets/logo.png';

type TopPlayer = {
  id: string;
  name: string;
  average: number;
  count: number;
};

export function HomePage({
  role,
  nextSession,
  selectedSession,
  players,
  attendance,
  evaluations,
  cardTotals,
  setTab,
}: {
  role: Role;
  nextSession: AppSession | null;
  selectedSession: AppSession | null;
  players: Player[];
  attendance: Attendance[];
  evaluations: Evaluation[];
  cardTotals: PlayerCardTotal[];
  setTab: (tab: Tab) => void;
}) {
  const [topMode, setTopMode] = useState<'matches' | 'trainings'>('matches');
  const [topMatches, setTopMatches] = useState<TopPlayer[]>([]);
  const [topTrainings, setTopTrainings] = useState<TopPlayer[]>([]);
  const [suspensions, setSuspensions] = useState<any[]>([]);

  const evaluatedCount = evaluations.filter((e: Evaluation) => e.evaluated).length;
  const cardWarnings = getCardWarnings(cardTotals).slice(0, 8);
  const sessionIsToday = nextSession?.session_date === new Date().toISOString().slice(0, 10);
  const evaluationDone = !!selectedSession?.evaluation_confirmed || (players.length > 0 && evaluatedCount >= players.length);

  useEffect(() => {
    loadGlobalTops();
    loadSuspensions();
  }, []);

  async function loadGlobalTops() {
    const { data } = await supabase
      .from('evaluations')
      .select('player_id,total_score,sessions(type),players(display_name)')
      .eq('evaluated', true)
      .not('total_score', 'is', null);

    const rows = data || [];
    const matchRows = rows.filter((r: any) =>
      ['friendly_match', 'league_match', 'tryout', 'scrimmage'].includes(r.sessions?.type)
    );
    const trainingRows = rows.filter((r: any) => r.sessions?.type === 'training');

    setTopMatches(buildTopRanking(matchRows));
    setTopTrainings(buildTopRanking(trainingRows));
  }

  async function loadSuspensions() {
    await supabase.rpc('create_yellow_accumulation_suspensions');

    const { data } = await supabase
      .from('active_suspensions')
      .select('*')
      .order('matches_remaining', { ascending: false });

    setSuspensions(data || []);
  }

  const activeTop = topMode === 'matches' ? topMatches : topTrainings;

  return (
    <div className="stack">
      <Card className="hero-card">
        <div className="hero-inner">
          <div>
            <p className="kicker">{sessionIsToday ? 'Sesión de hoy' : 'Próxima sesión'}</p>
            <h2>{nextSession?.name || 'No hay sesión próxima'}</h2>
            <p>{nextSession ? buildSessionLabel(nextSession) : 'Crea una sesión para empezar'}</p>
          </div>
          <img src={LOGO_URL} className="hero-logo" alt="Inspire Soccer" />
        </div>
      </Card>

      <Card>
        <p className="kicker">Panel rápido</p>
        <div className="progress-grid">
          <div className={selectedSession?.callup_confirmed ? 'progress-card done' : 'progress-card'}>
            <strong>{players.length}</strong>
            <span>Convocatoria</span>
          </div>
          <div className={selectedSession?.attendance_confirmed ? 'progress-card done' : 'progress-card'}>
            <strong>{attendance.length}</strong>
            <span>Asistencia</span>
          </div>
          <div className={evaluationDone ? 'progress-card done' : 'progress-card'}>
            <strong>{evaluatedCount}/{players.length}</strong>
            <span>Evaluación</span>
          </div>
        </div>
      </Card>

      {(cardWarnings.length > 0 || suspensions.length > 0) && (
        <Card>
          <div className="row">
            <p className="kicker">Avisos tarjetas y sanciones</p>
            <AlertTriangle size={18} />
          </div>

          {suspensions.length > 0 && (
            <div className="suspension-list">
              {suspensions.map((s: any) => (
                <div key={s.id} className="suspension-item">
                  <Ban size={16} />
                  <strong>{s.display_name}</strong>
                  <span>{s.matches_remaining} partido(s) sanción</span>
                </div>
              ))}
            </div>
          )}

          {cardWarnings.length > 0 && (
            <div className="card-warning-grid">
              {cardWarnings.map((c: PlayerCardTotal) => (
                <div key={c.player_id} className={Number(c.yellow_cards) >= 3 || Number(c.red_cards) > 0 ? 'card-warning-item danger' : 'card-warning-item'}>
                  <strong>{c.display_name}</strong>
                  <span>{c.yellow_cards} 🟨 {Number(c.red_cards) > 0 ? `· ${c.red_cards} 🟥` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="row">
          <p className="kicker">Top global</p>
          <Trophy size={18} />
        </div>

        <div className="segmented mini">
          <button className={topMode === 'matches' ? 'selected' : ''} onClick={() => setTopMode('matches')}>
            Partidos
          </button>
          <button className={topMode === 'trainings' ? 'selected' : ''} onClick={() => setTopMode('trainings')}>
            Entrenos
          </button>
        </div>

        {activeTop.length > 0 ? (
          activeTop.map((p, index) => (
            <div className="top-row" key={p.id}>
              <span className="rank">#{index + 1}</span>
              <strong>{p.name}</strong>
              <span>{p.average.toFixed(1)}</span>
            </div>
          ))
        ) : (
          <p>Aún no hay evaluaciones de {topMode === 'matches' ? 'partidos' : 'entrenos'}.</p>
        )}
      </Card>

      {(role === 'admin' || role === 'coach') && <Action label="Preparar convocatoria" onClick={() => setTab('callup')} />}
      <Action label="Pasar asistencia" onClick={() => setTab('attendance')} />
      <Action label="Evaluar jugadores" onClick={() => setTab('evaluation')} />
    </div>
  );
}

function buildTopRanking(rows: any[]) {
  const grouped: Record<string, { name: string; scores: number[] }> = {};

  rows.forEach((row: any) => {
    if (!grouped[row.player_id]) {
      grouped[row.player_id] = {
        name: row.players?.display_name || 'Jugador',
        scores: [],
      };
    }
    grouped[row.player_id].scores.push(Number(row.total_score));
  });

  return Object.entries(grouped)
    .map(([id, item]) => ({
      id,
      name: item.name,
      average: item.scores.reduce((a, b) => a + b, 0) / item.scores.length,
      count: item.scores.length,
    }))
    .sort((a, b) => b.average - a.average)
    .slice(0, 3);
}
