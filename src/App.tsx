import { VeoProvider } from './veo/VeoContext';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { Attendance, Evaluation, Player, Role } from './types';
import type { AppSession, PlayerCardTotal, Tab } from './utils/appTypes';
import { getNextAvailableSession } from './lib/data';
import { readPerformancePages } from './lib/performance';
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

const ReportsPage = lazy(() => import('./pages/ReportsPage').then(module => ({ default: module.ReportsPage })));

const VeoAnalytics = lazy(() => import('./pages/VeoModule').then(module => ({ default: module.VeoModule })));

const DEV_BYPASS_LOGIN = false;
const LOGO_URL = '/logo.png';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<Role>('viewer');
  const [roleUserId, setRoleUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [roleAttempt, setRoleAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let authChanged = false;
    supabase.auth.getSession().then(({ data, error }: any) => {
      if (!active || authChanged) return;
      setUser(data.session?.user ?? null);
      if (error) setAuthError('No se pudo verificar la sesión. Vuelve a iniciar sesión.');
      setLoading(false);
    }, () => {
      if (active && !authChanged) { setAuthError('No se pudo verificar la sesión.'); setLoading(false); }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      authChanged = true;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRoleUserId(''); setRole('viewer'); setAuthError('');
    if (!user) return;
    supabase.from('profiles').select('role').eq('id', user.id).single().then(({ data, error }: any) => {
      if (cancelled) return;
      if (error || !['admin', 'coach', 'viewer'].includes(data?.role)) {
        setAuthError('No se pudieron verificar tus permisos. Reintenta antes de acceder a los datos.');
        return;
      }
      setRole(data.role); setRoleUserId(user.id);
    }, () => { if (!cancelled) setAuthError('No se pudieron verificar tus permisos.'); });
    return () => { cancelled = true; };
  }, [user?.id, roleAttempt]);

  if (loading) return <Screen><p>Cargando...</p></Screen>;
  if (DEV_BYPASS_LOGIN) return <Platform role="admin" />;
  if (!user) return <LoginPage logoUrl={LOGO_URL} />;
  if (roleUserId !== user.id) return <Screen>{authError
    ? <Card><p role="alert">{authError}</p><button onClick={() => setRoleAttempt(n => n + 1)}>Reintentar permisos</button><button onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button></Card>
    : <p role="status">Verificando permisos…</p>}</Screen>;

  // Direct authenticated entry avoids mounting operational pages/RPCs when
  // opening a local preview. It never bypasses login or role verification.
  const previewRole = roleUserId === user.id ? role : 'viewer';
  const query = new URLSearchParams(window.location.search);
  if (query.get('veo-preview') === '1' || query.get('veo') === '1') {
    return <VeoProvider key={user.id} role={previewRole}><Screen><Suspense fallback={<p>Cargando VEO...</p>}><VeoAnalytics initialSection={query.get('veo-preview') === '1' ? 'import' : query.has('player') ? 'players' : 'dashboard'}/></Suspense></Screen></VeoProvider>;
  }
  return <VeoProvider key={user.id} role={previewRole}><Platform key={user.id} role={previewRole} previewRole={previewRole}/></VeoProvider>;
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
  const loadRequest = useRef(0);

  const isAdmin = role === 'admin';
  const isCoach = role === 'coach';

  async function load(targetSessionId?: string) {
    const request = ++loadRequest.current;
    setLoadingData(true);
    setError('');
    try {
    const next = await getNextAvailableSession();
    if (request !== loadRequest.current) return;
    setNextSession(next);

    const workingSessionId = targetSessionId || selectedSession?.id || next?.id;
    let workingSession: AppSession | null = next;

    if (workingSessionId) {
      const { data, error } = await supabase.from('sessions').select('*').eq('id', workingSessionId).in('status', [...ACTIVE_SESSION_STATUSES]).maybeSingle();
      if (error) throw new Error('No se pudo verificar la sesión seleccionada: ' + error.message);
      workingSession = isActiveSession(data) ? data as AppSession : null;
    }
    if (request !== loadRequest.current) return;
    setSelectedSession(workingSession || null);

    if (!workingSession) {
      setPlayers([]);
      setAttendance([]);
      setEvaluations([]);
      setCardTotals([]);
      setLoadingData(false);
      return;
    }

    const sid = workingSession.id;
    const [calls, visits, roster, ev, totals] = await Promise.all([
      readPerformancePages<{player_id:string}>((a,b) => supabase.from('callups').select('id,player_id').eq('session_id',sid).neq('status','not_called').order('id').range(a,b)),
      readPerformancePages<Attendance>((a,b) => supabase.from('attendance').select('*').eq('session_id',sid).order('id').range(a,b)),
      readPerformancePages<Player>((a,b) => supabase.from('players').select('*').order('id').range(a,b)),
      readPerformancePages<Evaluation>((a,b) => supabase.from('evaluations').select('*').eq('session_id',sid).order('id').range(a,b)),
      readPerformancePages<PlayerCardTotal>((a,b) => supabase.from('player_card_totals').select('*').order('player_id').range(a,b)),
    ]);
    if (request !== loadRequest.current) return;
    const ids = new Set([...calls, ...visits, ...ev].map(row => row.player_id));
    if ([...ids].some(id => !roster.some(p => p.id === id))) throw new Error('La plantilla de la sesión está incompleta. No se pueden verificar los participantes.');
    setPlayers(roster.filter(p => ids.has(p.id))); setAttendance(visits); setEvaluations(ev); setCardTotals(totals);
    } catch (failure) {
      if (request !== loadRequest.current) return;
      setError('No se pudieron verificar los datos de la sesión: ' + String(failure));
      setNextSession(null); setSelectedSession(null); setPlayers([]); setAttendance([]); setEvaluations([]); setCardTotals([]);
    } finally { if (request === loadRequest.current) setLoadingData(false); }
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
    void load();
    return () => { loadRequest.current++; };
  }, []);

  useEffect(() => {
  if (role === 'coach' && ['intelligence', 'history'].includes(tab)) {
    setTab('attendance');
  }
  }, [role, tab]);

  const headerTitle = getHeaderTitle(tab);


  if (loadingData) {
    return <div className="app-shell"><div className="app"><main><Card><p>Cargando datos...</p></Card></main></div></div>;
  }

  return (
    <ApplicationShell role={role} tab={tab} setTab={setTab} title={headerTitle} selectedSessionLabel={selectedSession && ['home', 'sessions', 'callup', 'attendance', 'evaluation'].includes(tab) ? selectedSession.name : undefined} error={error} onLogout={() => { void supabase.auth.signOut(); }}>
          {tab === 'home' && <HomePage role={role} nextSession={nextSession} selectedSession={selectedSession} players={players} attendance={attendance} evaluations={evaluations} cardTotals={cardTotals} setTab={setTab} />}
          {tab === 'players' && (isAdmin || isCoach) && <PlayersPage role={role} />}
          {tab === 'sessions' && (isAdmin || isCoach) && <SessionsPage role={role} reload={load} selectedSession={selectedSession} setSelectedSession={setSelectedSession} onArchiveChange={onArchiveChange} onViewHistory={id => { setSummarySessionId(id); setTab('summary'); }} />}
          {tab === 'callup' && selectedSession && (isAdmin || isCoach) && <CallupPage role={role} session={selectedSession} reload={load} setError={setError} />}
          {tab === 'attendance' && selectedSession && <AttendancePage role={role} session={selectedSession} players={players} attendance={attendance} reload={load} setError={setError} moveToNextOpenSession={moveToNextOpenSession} />}
          {tab === 'evaluation' && selectedSession && <EvaluationPage role={role} session={selectedSession} players={players} evaluations={evaluations} reload={load} setError={setError} moveToNextOpenSession={moveToNextOpenSession} />}
          {tab === 'injuries' && selectedSession && <InjuriesPage session={selectedSession} players={players} reload={load} setError={setError} role={role} />}
          {tab === 'summary' && <SummaryPage initialSessionId={summarySessionId} onReviewAttendance={isAdmin ? id => { void load(id); setTab('attendance'); } : undefined} />}
          {tab === 'standouts' && <StandoutsPage role={role} />}
          {tab === 'intelligence' && isAdmin && <IntelligencePage />}
          {tab === 'reports' && (isAdmin || isCoach) && <Suspense fallback={<Card><p role="status">Cargando informes…</p></Card>}><ReportsPage /></Suspense>}
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
    home: 'Inicio',
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
