import { attendanceStats } from '../utils/attendance';
import { loadPerformanceData } from '../lib/performance';
import { playerPerformanceAverages, eligibilityReason } from '../utils/evaluationEligibility';
import { OFFICIAL_PERFORMANCE_LABEL } from '../utils/performance';
import { evaluationTotal } from '../utils/evaluationScores';
import { AlertTriangle, Trophy, Ban, ClipboardList, Shield, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import type { Attendance, Evaluation, Player, Role } from '../types';
import type { AppSession, PlayerCardTotal, Tab } from '../utils/appTypes';
import { buildSessionLabel } from '../utils/formatters';
import { getCardWarnings } from '../utils/stats';
import { Card } from '../components/ui';
import { SessionWorkflow } from '../components/shell/SessionWorkflow';
import { ProgressiveAlerts } from '../components/ProgressiveAlerts';

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
  const [performanceError, setPerformanceError] = useState('');
  const [topMode, setTopMode] = useState<'matches' | 'trainings'>('matches');
  const [topMatches, setTopMatches] = useState<TopPlayer[]>([]);
  const [topTrainings, setTopTrainings] = useState<TopPlayer[]>([]);
  const [suspensions, setSuspensions] = useState<any[]>([]);
  const [suspensionError, setSuspensionError] = useState('');

  const [sessionCounts, setSessionCounts] = useState({ id: '', evaluated: 0, eligible: 0 });
  const performanceRequest = useRef(0);
  const evaluatedCount = sessionCounts.id === selectedSession?.id ? sessionCounts.evaluated : 0;
  const cardWarnings = getCardWarnings(cardTotals);
  const sessionIsToday = nextSession?.session_date === new Date().toISOString().slice(0, 10);
  const recordsOnlyDone = Boolean((selectedSession as (AppSession & { records_only_confirmed?: boolean }) | null)?.records_only_confirmed);
  const evaluationDone = !!selectedSession?.evaluation_confirmed || (sessionCounts.id === selectedSession?.id && sessionCounts.eligible > 0 && evaluatedCount >= sessionCounts.eligible);

  useEffect(() => {
    loadGlobalTops();
    return () => { performanceRequest.current++; };
  }, [selectedSession?.id]);
  useEffect(() => {
    loadSuspensions();
  }, []);

  async function loadGlobalTops() {
    const request = ++performanceRequest.current;
    try {
      const result = await loadPerformanceData();
      if (request !== performanceRequest.current) return;
      const eligible = new Set(result.callups.filter(c => c.player_id && c.session_id && c.session_id === selectedSession?.id && !eligibilityReason(c.session_id,c.player_id,result.callups,result.attendance)).map(c => c.player_id));
      setSessionCounts({ id: selectedSession?.id || '', evaluated: result.evaluations.filter(e => e.session_id === selectedSession?.id).length, eligible: eligible.size });
      setPerformanceError('');
      setTopMatches(buildTopRanking(result.evaluations.filter(r => r.sessions.type !== 'training')));
      setTopTrainings(buildTopRanking(result.evaluations.filter(r => r.sessions.type === 'training')));
    } catch (failure) { if(request===performanceRequest.current){setPerformanceError(String(failure)); setTopMatches([]); setTopTrainings([]);setSessionCounts({id:'',evaluated:0,eligible:0});} }
  }

  async function loadSuspensions() {
    // Opening a dashboard is a read. Disciplinary calculation remains in the
    // existing explicit card-save / evaluation-confirmation paths.
    const { data, error } = await supabase
      .from('active_suspensions')
      .select('*')
      .order('matches_remaining', { ascending: false });

    setSuspensions(error ? [] : data || []);
    setSuspensionError(error ? 'No se pudieron verificar las sanciones: '+error.message : '');
  }

  const activeTop = topMode === 'matches' ? topMatches : topTrainings;

  return (
    <div className="stack home-dashboard">
      {suspensionError && <p role="alert">{suspensionError}</p>}
      <Card className="hero-card">
        <div className="hero-inner">
          <div>
            <p className="kicker">{sessionIsToday ? 'Sesión de hoy' : 'Próxima sesión'}</p>
            <h2>{nextSession?.name || 'No hay sesión próxima'}</h2>
            <p>{nextSession ? buildSessionLabel(nextSession) : 'Crea una sesión para empezar'}</p>
          </div>
          <div className="hero-mark" aria-hidden="true"><Shield size={42}/><span>IS</span></div>
        </div>
      </Card>

      <SessionWorkflow role={role} tab="home" setTab={setTab}/>

      {role === 'admin' && <button className="weekly-shortcut" onClick={()=>setTab('intelligence')}><span className="weekly-shortcut-icon"><Shield size={23}/></span><span><strong>Seguimiento semanal</strong><small>Rendimiento, alertas y notas privadas del equipo</small></span><ChevronRight size={20}/></button>}
      <Card>
        <p className="kicker">Panel rápido</p>
        <div className="progress-grid">
          <div className={selectedSession?.callup_confirmed ? 'progress-card done' : 'progress-card'}>
            <strong>{players.length}</strong>
            <span>Convocatoria</span>
          </div>
          <div className={selectedSession?.attendance_confirmed ? 'progress-card done' : 'progress-card'}>
            <strong>{attendanceStats(attendance).recorded}</strong>
            <span>Asistencia registrada</span><small>{attendanceStats(attendance).unjustifiedAbsences} ausencias injustificadas</small>
          </div>
          <div className={evaluationDone ? 'progress-card done' : 'progress-card'}>
            <strong>{recordsOnlyDone ? "✓" : `${evaluatedCount}/${players.length}`}</strong>
            <span>{recordsOnlyDone ? "Registros sin notas" : "Evaluación"}</span>
          </div>
        </div>
      </Card>

      {(cardWarnings.length > 0 || suspensions.length > 0) && (
        <Card>
          <div className="row">
            <p className="kicker">Tarjetas históricas y sanciones activas</p>
            <AlertTriangle size={18} />
          </div>
          <p className="muted">Las tarjetas muestran el total histórico. La cuenta actual de acumulación y las sanciones cumplidas se consultan en Convocatoria.</p>

          <ProgressiveAlerts items={[
              ...suspensions.map((s: any) => ({ key: 'suspension-' + s.id, content:
                <div className="suspension-item">
                  <Ban size={16} />
                  <strong>{s.display_name}</strong>
                  <span>{s.matches_remaining} partido(s) sanción</span>
                </div>
              })),
              ...cardWarnings.map((c: PlayerCardTotal) => ({ key: 'card-' + c.player_id, content:
                <div className={Number(c.yellow_cards) >= 3 || Number(c.red_cards) > 0 ? 'card-warning-item danger' : 'card-warning-item'}>
                  <strong>{c.display_name}</strong>
                  <span>{c.yellow_cards} 🟨 {Number(c.red_cards) > 0 ? `· ${c.red_cards} 🟥` : ''}</span>
                </div>
              }))
          ]}/>
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

        <p className="muted">{OFFICIAL_PERFORMANCE_LABEL}</p>
        {performanceError && <p role="alert">Rendimiento operativo: {performanceError}</p>}
        {activeTop.length > 0 ? (
          activeTop.map((p, index) => (
            <div className="top-row" key={p.id}>
              <span className="rank">#{index + 1}</span>
              <strong>{p.name}</strong>
              <span>{p.average.toFixed(2)}</span>
            </div>
          ))
        ) : (
          <p>Aún no hay evaluaciones de {topMode === 'matches' ? 'partidos' : 'entrenos'}.</p>
        )}
      </Card>

    </div>
  );
}

function buildTopRanking(rows: any[]) {
  return playerPerformanceAverages(rows).slice(0,3).map(p => ({ id: p.player_id, name: p.name, average: p.average, count: p.count }));
}
