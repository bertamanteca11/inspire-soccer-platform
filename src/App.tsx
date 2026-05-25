import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { supabase } from './supabase';
import type { Attendance, Evaluation, Player, Role } from './types';
import type { AppSession, PlayerCardTotal, Tab } from './utils/appTypes';
import { buildSessionLabel } from './utils/formatters';
import { getNextAvailableSession } from './lib/data';
import { BottomNav } from './components/BottomNav';
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

const DEV_BYPASS_LOGIN = false;
const LOGO_URL = '/assets/logo.png';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<Role>('viewer');
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
      if (data?.role) setRole(data.role);
    });
  }, [user]);

  if (loading) return <Screen><p>Cargando...</p></Screen>;
  if (DEV_BYPASS_LOGIN) return <Platform role="admin" />;
  if (!user) return <LoginPage logoUrl={LOGO_URL} />;

  return <Platform role={role} />;
}

function Platform({ role }: { role: Role }) {
  const [tab, setTab] = useState<Tab>('home');
  const [nextSession, setNextSession] = useState<AppSession | null>(null);
  const [selectedSession, setSelectedSession] = useState<AppSession | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [cardTotals, setCardTotals] = useState<PlayerCardTotal[]>([]);
  const [error, setError] = useState('');
  const [loadingData, setLoadingData] = useState(true);

  const isAdmin = role === 'admin';
  const isCoach = role === 'coach';

  async function load(targetSessionId?: string) {
    setLoadingData(true);
    setError('');

    const next = await getNextAvailableSession();
    setNextSession(next);

    const workingSessionId = targetSessionId || selectedSession?.id || next?.id;
    let workingSession: AppSession | null = next;

    if (workingSessionId) {
      const { data, error } = await supabase.from('sessions').select('*').eq('id', workingSessionId).single();
      if (!error && data) workingSession = data as AppSession;
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

    const callups = await supabase
      .from('callups')
      .select('player_id, evaluable, status, players(*)')
      .eq('session_id', workingSession.id)
      .neq('status', 'not_called')
      .order('created_at');

    setPlayers(((callups.data || []) as any[]).map(row => row.players).filter(Boolean));

    const att = await supabase.from('attendance').select('*').eq('session_id', workingSession.id);
    setAttendance(att.data || []);

    const ev = await supabase.from('evaluations').select('*').eq('session_id', workingSession.id);
    setEvaluations(ev.data || []);

    const cards = await supabase.from('player_card_totals').select('*');
    setCardTotals((cards.data || []) as PlayerCardTotal[]);

    setLoadingData(false);
  }

  async function moveToNextOpenSession() {
    const next = await getNextAvailableSession();
    setNextSession(next);
    setSelectedSession(next);
    await load(next?.id);
  }

  useEffect(() => {
    load();
  }, []);

  const headerTitle = getHeaderTitle(tab);
  const headerSubtitle = tab === 'home'
    ? nextSession ? buildSessionLabel(nextSession) : 'Sin próxima sesión'
    : selectedSession ? buildSessionLabel(selectedSession) : '';

  if (loadingData) {
    return <div className="app-shell"><div className="app"><main><Card><p>Cargando datos...</p></Card></main></div></div>;
  }

  return (
    <div className="app-shell">
      <div className="app">
        <header>
          <div className="header-left">
            <img src={LOGO_URL} className="club-logo" alt="Inspire Soccer" />
            <div>
              <h1>{headerTitle}</h1>
              <p>{headerSubtitle}</p>
            </div>
          </div>

          <div className="header-actions">
            <span className="role-pill">{role === 'admin' ? 'Admin' : role === 'coach' ? 'Coach' : 'Viewer'}</span>
            <button className="icon-btn" onClick={() => supabase.auth.signOut()}>
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        <main>
          {tab === 'home' && <HomePage role={role} nextSession={nextSession} selectedSession={selectedSession} players={players} attendance={attendance} evaluations={evaluations} cardTotals={cardTotals} setTab={setTab} />}
          {tab === 'players' && isAdmin && <PlayersPage />}
          {tab === 'sessions' && isAdmin && <SessionsPage reload={load} selectedSession={selectedSession} setSelectedSession={setSelectedSession} />}
          {tab === 'callup' && selectedSession && (isAdmin || isCoach) && <CallupPage role={role} session={selectedSession} reload={load} setError={setError} />}
          {tab === 'attendance' && selectedSession && <AttendancePage role={role} session={selectedSession} players={players} attendance={attendance} reload={load} setError={setError} moveToNextOpenSession={moveToNextOpenSession} />}
          {tab === 'evaluation' && selectedSession && <EvaluationPage role={role} session={selectedSession} players={players} evaluations={evaluations} reload={load} setError={setError} moveToNextOpenSession={moveToNextOpenSession} />}
          {tab === 'injuries' && selectedSession && <InjuriesPage session={selectedSession} players={players} reload={load} setError={setError} role={role} />}
          {tab === 'summary' && <SummaryPage />}
          {tab === 'history' && isAdmin && <HistoryPage />}

          {['callup', 'attendance', 'evaluation', 'injuries'].includes(tab) && !selectedSession && (
            <Card>
              <p className="kicker">No hay sesión seleccionada</p>
              <h2>Crea o selecciona una sesión</h2>
              <p className="muted">Ve a Sesiones y crea una sesión para poder trabajar.</p>
            </Card>
          )}
        </main>

        <BottomNav role={role} tab={tab} setTab={setTab} />
      </div>
    </div>
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
    history: 'Histórico',
  };

  return map[tab];
}
