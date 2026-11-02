import { VeoProvider } from './veo/VeoContext';
import { lazy, Suspense, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Attendance, Evaluation, Player, Role } from './types';
import type { AppSession, PlayerCardTotal, Tab } from './utils/appTypes';
import { buildSessionLabel } from './utils/formatters';
import { getNextAvailableSession } from './lib/data';
import { ACTIVE_SESSION_STATUSES, isActiveSession } from './utils/sessionArchive';
import { ApplicationShell } from './components/shell/ApplicationShell';
import { Card, Screen } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { PlayersPage } from './pages/PlayersPage';
import { SessionsPage } from './pages/SessionsPage';
import { CallupPage } from './pages/CallupPage';
import { AttendancePage } from './pages/AttendancePage';
import { EvaluationPage } from './pages/EvaluationPage';
import { InjuriesPage } from './pages/InjuriesPage';
import { SummaryPage } from './pages/SummaryPage';
import { HistoryPage } from './pages/HistoryPage';
import { StandoutsPage } from './pages/StandoutsPage';
import { IntelligencePage } from './pages/IntelligencePage';
import { ReportsPage } from './pages/ReportsPage';

const VeoAnalytics = lazy(() => import('./pages/VeoModule').then(module => ({ default: module.VeoModule })));

const DEV_BYPASS_LOGIN = false;
const LOGO_URL = '/logo.png';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<Role>('viewer');
  const [roleUserId, setRoleUserId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    supabase.from('profiles').select('role').eq('id', user.id).single().then(({ data }: any) => {
      if (data?.role) { setRole(data.role); setRoleUserId(user.id); }
    });
  }, [user]);

  if (loading) return <Screen><p>Cargando...</p></Screen>;
  if (DEV_BYPASS_LOGIN) return <Platform role="admin" />;
  if (!user) return <LoginPage logoUrl={LOGO_URL} />;

  // Direct authenticated entry avoids mounting operational pages/RPCs when
  // opening a local preview. It never bypasses login or role verification.
  const previewRole = roleUserId === user.id ? role : 'viewer';
  const query = new URLSearchParams(window.location.search);
  if (query.get('veo-preview') === '1' || query.get('veo') === '1') {
    return <VeoProvider key={user.id} role={previewRole}><Screen><Suspense fallback={<p>Cargando VEO...</p>}><VeoAnalytics initialSection={query.get('veo-preview') === '1' ? 'import' : query.has('player') ? 'players' : 'dashboard'}/></Suspense></Screen></VeoProvider>;
  }
  return <VeoProvider key={user.id} role={previewRole}><Platform role={role} previewRole={previewRole}/></VeoProvider>;
}

function Platform({ role, previewRole = 'viewer' }: { role: Role; previewRole?: Role }) {
  const [tab, setTab] = useState<Tab>(role === 'coach' ? 'attendance' : 'home');
  const [nextSession, setNextSession] = useState<AppSession | null>(null);
  const [selectedSession, setSelectedSession] = useState<AppSession | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [cardTotals, setCardTotals] = useState<PlayerCardTotal[]>([]);
  const [error, setError] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [summarySessionId, setSummarySessionId] = useState('');

  const isAdmin = role === 'admin';
  const isCoach = role === 'coach';

  async function load(targetSessionId?: string) {
    setLoadingData(true);
    setError('');

    let next: AppSession | null;
    try { next = await getNextAvailableSession(); }
    catch (failure) {
      setError('No se pudo cargar la sesión operativa: ' + String(failure));
      setNextSession(null); setSelectedSession(null); setPlayers([]); setAttendance([]); setEvaluations([]); setCardTotals([]); setLoadingData(false); return;
    }
    setNextSession(next);

    const workingSessionId = targetSessionId || selectedSession?.id || next?.id;
    let workingSession: AppSession | null = next;

    if (workingSessionId) {
      const { data, error } = await supabase.from('sessions').select('*').eq('id', workingSessionId).in('status', [...ACTIVE_SESSION_STATUSES]).maybeSingle();
      if (error) { setError('No se pudo verificar la sesión seleccionada: ' + error.message); workingSession = null; }
      else if (isActiveSession(data)) workingSession = data as AppSession;
    }

    setSelectedSession(workingSession || null);

    if (!workingSession) {
      setPlayers([]);
      setAttendance([]);
      setEvaluations([]);
      setCardTotals([]);
      setLoadingData(false);
      return;
    }

const [callups, att] = await Promise.all([
  supabase
    .from('callups')
    .select('player_id, evaluable, status, players(*)')
    .eq('session_id', workingSession.id)
    .neq('status', 'not_called')
    .order('created_at'),

  supabase
    .from('attendance')
    .select('*')
    .eq('session_id', workingSession.id)
]);

if (callups.error) {
  setError(`Error cargando convocatoria: ${callups.error.message}`);
}

if (att.error) {
  setError(`Error cargando asistencia: ${att.error.message}`);
}

const attendanceRows = (att.data || []) as Attendance[];
setAttendance(attendanceRows);

// IDs de jugadores convocados o con asistencia registrada.
const playerIds = [
  ...new Set([
    ...(callups.data || []).map(row => row.player_id),
    ...attendanceRows.map(row => row.player_id)
  ])
];

if (playerIds.length > 0) {
  const { data: sessionPlayers, error: playersError } = await supabase
    .from('players')
    .select('*')
    .in('id', playerIds);

  if (playersError) {
    setError(`Error cargando jugadores: ${playersError.message}`);
  }

  setPlayers((sessionPlayers || []) as Player[]);
} else {
  setPlayers([]);
}

    const ev = await supabase.from('evaluations').select('*').eq('session_id', workingSession.id);
    setEvaluations(ev.data || []);

    const cards = await supabase.from('player_card_totals').select('*');
    setCardTotals((cards.data || []) as PlayerCardTotal[]);

    setLoadingData(false);
  }

  async function moveToNextOpenSession() {
    try {
      const next = await getNextAvailableSession();
      setNextSession(next); setSelectedSession(next); await load(next?.id);
    } catch (failure) { setError('No se pudo cargar la próxima sesión: ' + String(failure)); }
  }

  async function onArchiveChange(session: AppSession) {
    if (session.status === 'archived' && selectedSession?.id === session.id) {
      setSelectedSession(null); setPlayers([]); setAttendance([]); setEvaluations([]);
    }
    setNextSession(await getNextAvailableSession());
  }
  useEffect(() => { if (tab !== 'summary') setSummarySessionId(''); }, [tab]);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
  if (role === 'coach' && ['intelligence', 'history'].includes(tab)) {
    setTab('attendance');
  }
  }, [role, tab]);

  const headerTitle = getHeaderTitle(tab);
  const headerSubtitle = tab === 'home'
    ? nextSession ? buildSessionLabel(nextSession) : 'Sin próxima sesión'
    : ['sessions', 'callup', 'attendance', 'evaluation', 'injuries'].includes(tab) && selectedSession ? buildSessionLabel(selectedSession) : '';

  if (loadingData) {
    return <div className="app-shell"><div className="app"><main><Card><p>Cargando datos...</p></Card></main></div></div>;
  }

  return (
    <ApplicationShell role={role} tab={tab} setTab={setTab} title={headerTitle} context={headerSubtitle} error={error} onLogout={() => { void supabase.auth.signOut(); }}>
          {tab === 'home' && <HomePage role={role} nextSession={nextSession} selectedSession={selectedSession} players={players} attendance={attendance} evaluations={evaluations} cardTotals={cardTotals} setTab={setTab} />}
          {tab === 'players' && (isAdmin || isCoach) && <PlayersPage role={role} />}
          {tab === 'sessions' && (isAdmin || isCoach) && <SessionsPage role={role} reload={load} selectedSession={selectedSession} setSelectedSession={setSelectedSession} onArchiveChange={onArchiveChange} onViewHistory={id => { setSummarySessionId(id); setTab('summary'); }} />}
          {tab === 'callup' && selectedSession && (isAdmin || isCoach) && <CallupPage role={role} session={selectedSession} reload={load} setError={setError} />}
          {tab === 'attendance' && selectedSession && <AttendancePage role={role} session={selectedSession} players={players} attendance={attendance} reload={load} setError={setError} moveToNextOpenSession={moveToNextOpenSession} />}
          {tab === 'evaluation' && selectedSession && <EvaluationPage role={role} session={selectedSession} players={players} evaluations={evaluations} reload={load} setError={setError} moveToNextOpenSession={moveToNextOpenSession} />}
          {tab === 'injuries' && selectedSession && <InjuriesPage session={selectedSession} players={players} reload={load} setError={setError} role={role} />}
          {tab === 'summary' && <SummaryPage initialSessionId={summarySessionId} />}
          {tab === 'standouts' && <StandoutsPage role={role} />}
          {tab === 'intelligence' && isAdmin && <IntelligencePage />}
          {tab === 'reports' && (isAdmin || isCoach) && <ReportsPage />}
          {tab === 'veo' && <Suspense fallback={<Card><p>Cargando visor VEO...</p></Card>}><VeoAnalytics/></Suspense>}
          {tab === 'history' && (isAdmin || isCoach) && <HistoryPage />}

          {['callup', 'attendance', 'evaluation', 'injuries'].includes(tab) && !selectedSession && (
            <Card>
              <p className="kicker">No hay sesión seleccionada</p>
              <h2>Crea o selecciona una sesión</h2>
              <p className="muted">Ve a Sesiones y crea una sesión para poder trabajar.</p>
            </Card>
          )}
    </ApplicationShell>
  );
}

function getHeaderTitle(tab: Tab) {
  const map: Record<Tab, string> = {
    home: 'Inspire Soccer',
    players: 'Jugadores',
    sessions: 'Sesiones',
    callup: 'Convocatoria',
    attendance: 'Asistencia',
    evaluation: 'Evaluación',
    injuries: 'Lesiones',
    summary: 'Resumen',
    standouts: 'Destacados',
    history: 'Histórico',
    intelligence: 'Seguimiento semanal',
    reports: 'Informes',
    veo: 'VEO Analytics',
  };

  return map[tab];
}
