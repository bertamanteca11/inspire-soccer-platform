import { AlertTriangle, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { Attendance, Evaluation, Player, Role } from '../types';
import type { AppSession, PlayerCardTotal, Tab } from '../utils/appTypes';
import { buildSessionLabel } from '../utils/formatters';
import { getCardWarnings } from '../utils/stats';
import { Action, Card } from '../components/ui';

const LOGO_URL = '/assets/logo.png';

export function HomePage({ role, nextSession, selectedSession, players, attendance, evaluations, cardTotals, setTab }: {
  role: Role;
  nextSession: AppSession | null;
  selectedSession: AppSession | null;
  players: Player[];
  attendance: Attendance[];
  evaluations: Evaluation[];
  cardTotals: PlayerCardTotal[];
  setTab: (tab: Tab) => void;
}) {
  const [globalTop, setGlobalTop] = useState<any[]>([]);

  const evaluatedCount = evaluations.filter((e: Evaluation) => e.evaluated).length;
  const sessionTopPlayers = [...evaluations]
    .filter((e: Evaluation) => e.total_score)
    .sort((a, b) => Number(b.total_score) - Number(a.total_score))
    .slice(0, 3);

  useEffect(() => {
    loadGlobalTop();
  }, []);

  async function loadGlobalTop() {
    const { data } = await supabase
      .from('evaluations')
      .select('player_id,total_score,players(display_name)')
      .not('total_score', 'is', null);

    const grouped: Record<string, { name: string; scores: number[] }> = {};

    (data || []).forEach((row: any) => {
      if (!grouped[row.player_id]) {
        grouped[row.player_id] = {
          name: row.players?.display_name || 'Jugador',
          scores: [],
        };
      }

      grouped[row.player_id].scores.push(Number(row.total_score));
    });

    const ranking = Object.entries(grouped)
      .map(([id, item]) => ({
        id,
        name: item.name,
        average: item.scores.reduce((a, b) => a + b, 0) / item.scores.length,
      }))
      .sort((a, b) => b.average - a.average)
      .slice(0, 3);

    setGlobalTop(ranking);
  }

  const cardWarnings = getCardWarnings(cardTotals).slice(0, 5);
  const sessionIsToday = nextSession?.session_date === new Date().toISOString().slice(0, 10);
  const evaluationDone = !!selectedSession?.evaluation_confirmed || (players.length > 0 && evaluatedCount >= players.length);

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

      {cardWarnings.length > 0 && (
        <Card>
          <div className="row">
            <p className="kicker">Avisos tarjetas</p>
            <AlertTriangle size={18} />
          </div>
          <div className="card-warning-grid">
            {cardWarnings.map((c: PlayerCardTotal) => (
              <div key={c.player_id} className={Number(c.yellow_cards) >= 3 || Number(c.red_cards) > 0 ? 'card-warning-item danger' : 'card-warning-item'}>
                <strong>{c.display_name}</strong>
                <span>{c.yellow_cards} 🟨 {Number(c.red_cards) > 0 ? `· ${c.red_cards} 🟥` : ''}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="row">
          <p className="kicker">{sessionTopPlayers.length > 0 ? 'Top sesión actual' : 'Top global'}</p>
          <Trophy size={18} />
        </div>

        {sessionTopPlayers.length > 0 ? (
          sessionTopPlayers.map((e: Evaluation, index: number) => (
            <div className="top-row" key={e.id}>
              <span className="rank">#{index + 1}</span>
              <strong>{findName(players, e.player_id)}</strong>
              <span>{e.total_score}</span>
            </div>
          ))
        ) : globalTop.length > 0 ? (
          globalTop.map((p, index) => (
            <div className="top-row" key={p.id}>
              <span className="rank">#{index + 1}</span>
              <strong>{p.name}</strong>
              <span>{p.average.toFixed(1)}</span>
            </div>
          ))
        ) : (
          <p>Aún no hay evaluaciones.</p>
        )}
      </Card>

      {(role === 'admin' || role === 'coach') && <Action label="Preparar convocatoria" onClick={() => setTab('callup')} />}
      <Action label="Pasar asistencia" onClick={() => setTab('attendance')} />
      <Action label="Evaluar jugadores" onClick={() => setTab('evaluation')} />
    </div>
  );
}

function findName(players: Player[], id: string) {
  return players.find(p => p.id === id)?.display_name || 'Jugador';
}
