import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  LogOut,
  RotateCcw,
  Save,
  Search,
  Shield,
  Star,
  Trophy,
  Users,
} from 'lucide-react';
import { supabase } from './supabase';
import type { Attendance, Evaluation, Player, Role, Session } from './types';
import './styles.css';

type Tab =
  | 'home'
  | 'players'
  | 'sessions'
  | 'callup'
  | 'attendance'
  | 'evaluation'
  | 'injuries'
  | 'summary'
  | 'history';

type AppSession = Session & {
  start_time?: string | null;
  callup_confirmed?: boolean;
  callup_confirmed_at?: string | null;
  attendance_confirmed?: boolean;
  attendance_confirmed_at?: string | null;
  evaluation_confirmed?: boolean;
  evaluation_confirmed_at?: string | null;
  opponent?: string | null;
  low_rating_limit?: number | null;
};

type PlayerCardTotal = {
  player_id: string;
  display_name: string;
  yellow_cards: number;
  red_cards: number;
  total_cards?: number;
};

const DEV_BYPASS_LOGIN = false;
const LOGO_URL = '/assets/logo.png';

const ratingFields = [
  ['tactical_discipline', 'Disciplina táctica'],
  ['effort_commitment', 'Esfuerzo / compromiso'],
  ['decision_making', 'Toma de decisiones'],
  ['mentality_attitude', 'Mentalidad / actitud'],
  ['coachability', 'Capacidad de corrección'],
] as const;

const attendanceOptions = [
  ['present', 'Presente'],
  ['late', 'Tarde'],
  ['justified_late', 'Tarde justificado'],
  ['justified_absence', 'Ausencia justificada'],
  ['unjustified_absence', 'Ausencia injustificada'],
  ['injured', 'Lesionado'],
] as const;

const attendanceNeedsExplanation = [
  'late',
  'justified_late',
  'justified_absence',
  'unjustified_absence',
  'injured',
];

const cardOptions = [
  ['none', 'Sin tarjeta'],
  ['yellow', 'Amarilla'],
  ['double_yellow', 'Doble amarilla'],
  ['straight_red', 'Roja directa'],
] as const;

function App() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<Role>('viewer');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.role) setRole(data.role);
      });
  }, [user]);

  if (loading) return <Screen><p>Cargando...</p></Screen>;
  if (DEV_BYPASS_LOGIN) return <Platform role="admin" />;
  if (!user) return <Login />;

  return <Platform role={role} />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError('Email o contraseña incorrectos.');
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) setError(error.message);
    else setMessage('Te hemos enviado un enlace de acceso al email.');
  }

  return (
    <Screen>
      <div className="login-card">
        <img src={LOGO_URL} className="login-logo" alt="Inspire Soccer" />
        <h1>Inspire Soccer</h1>
        <p>Accede para gestionar la plataforma del equipo.</p>

        <div className="segmented">
          <button type="button" className={mode === 'password' ? 'selected' : ''} onClick={() => setMode('password')}>
            Contraseña
          </button>
          <button type="button" className={mode === 'magic' ? 'selected' : ''} onClick={() => setMode('magic')}>
            Email link
          </button>
        </div>

        <form onSubmit={login} className="stack">
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" required />
          {mode === 'password' && (
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña" type="password" required />
          )}
          <button className="primary">{mode === 'password' ? 'Entrar' : 'Enviar enlace'}</button>
        </form>

        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </Screen>
  );
}

function Platform({ role }: { role: Role }) {
  const [tab, setTab] = useState<Tab>('home');
  const [session, setSession] = useState<AppSession | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [cardTotals, setCardTotals] = useState<PlayerCardTotal[]>([]);
  const [error, setError] = useState('');

  const isAdmin = role === 'admin';
  const isCoach = role === 'coach';

  async function load() {
    setError('');
    const today = new Date().toISOString().slice(0, 10);

    let { data: sessions, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .gte('session_date', today)
      .in('status', ['planned', 'completed'])
      .order('session_date', { ascending: true })
      .limit(1);

    if (sessionError) setError(sessionError.message);

    if (!sessions || sessions.length === 0) {
      const fallback = await supabase
        .from('sessions')
        .select('*')
        .order('session_date', { ascending: false })
        .limit(1);

      sessions = fallback.data || [];
    }

    const current = (sessions?.[0] || null) as AppSession | null;
    setSession(current);

    if (!current) {
      setPlayers([]);
      setAttendance([]);
      setEvaluations([]);
      setCardTotals([]);
      return;
    }

    const callups = await supabase
      .from('callups')
      .select('player_id, evaluable, status, players(*)')
      .eq('session_id', current.id)
      .neq('status', 'not_called')
      .order('created_at');

    setPlayers(((callups.data || []) as any[]).map(row => row.players).filter(Boolean));

    const att = await supabase.from('attendance').select('*').eq('session_id', current.id);
    setAttendance(att.data || []);

    const ev = await supabase.from('evaluations').select('*').eq('session_id', current.id);
    setEvaluations(ev.data || []);

    const cards = await supabase.from('player_card_totals').select('*');
    setCardTotals((cards.data || []) as PlayerCardTotal[]);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="app-shell">
      <div className="app">
        <header>
          <div className="header-left">
            <img src={LOGO_URL} className="club-logo" alt="Inspire Soccer" />
            <div>
              <h1>Inspire Soccer</h1>
              <p>{session ? buildSessionLabel(session) : 'Sin sesión activa'}</p>
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
          {tab === 'home' && (
            <Home role={role} session={session} players={players} attendance={attendance} evaluations={evaluations} cardTotals={cardTotals} setTab={setTab} />
          )}
          {tab === 'players' && isAdmin && <PlayersAdminPage />}
          {tab === 'sessions' && isAdmin && <SessionsAdminPage reload={load} />}
          {tab === 'callup' && session && (isAdmin || isCoach) && <CallupPage role={role} session={session} reload={load} setError={setError} />}
          {tab === 'attendance' && session && <AttendancePage role={role} session={session} players={players} attendance={attendance} reload={load} setError={setError} />}
          {tab === 'evaluation' && session && <EvaluationPage role={role} session={session} players={players} evaluations={evaluations} reload={load} setError={setError} />}
          {tab === 'injuries' && session && <InjuryPage session={session} players={players} reload={load} setError={setError} />}
          {tab === 'summary' && session && <SummaryPage session={session} players={players} evaluations={evaluations} attendance={attendance} cardTotals={cardTotals} />}
          {tab === 'history' && isAdmin && <HistoryPage />}
        </main>

        <nav className={isAdmin ? 'nav-grid admin' : 'nav-grid'}>
          <NavButton active={tab === 'home'} onClick={() => setTab('home')} icon={<Activity />} label="Inicio" />
          {isAdmin && (
            <>
              <NavButton active={tab === 'players'} onClick={() => setTab('players')} icon={<Users />} label="Jugadores" />
              <NavButton active={tab === 'sessions'} onClick={() => setTab('sessions')} icon={<CalendarDays />} label="Sesiones" />
            </>
          )}
          {(isAdmin || isCoach) && <NavButton active={tab === 'callup'} onClick={() => setTab('callup')} icon={<Users />} label="Convocatoria" />}
          <NavButton active={tab === 'attendance'} onClick={() => setTab('attendance')} icon={<ClipboardList />} label="Asistencia" />
          <NavButton active={tab === 'evaluation'} onClick={() => setTab('evaluation')} icon={<Star />} label="Evaluar" />
          <NavButton active={tab === 'injuries'} onClick={() => setTab('injuries')} icon={<HeartPulse />} label="Lesiones" />
          <NavButton active={tab === 'summary'} onClick={() => setTab('summary')} icon={<BarChart3 />} label="Resumen" />
          {isAdmin && <NavButton active={tab === 'history'} onClick={() => setTab('history')} icon={<Shield />} label="Histórico" />}
        </nav>
      </div>
    </div>
  );
}

function Home({ role, session, players, attendance, evaluations, cardTotals, setTab }: any) {
  const evaluatedCount = evaluations.filter((e: Evaluation) => e.evaluated).length;
  const topPlayers = [...evaluations]
    .filter((e: Evaluation) => e.total_score)
    .sort((a, b) => Number(b.total_score) - Number(a.total_score))
    .slice(0, 3);

  const cardWarnings = getCardWarnings(cardTotals).slice(0, 5);
  const sessionIsToday = session?.session_date === new Date().toISOString().slice(0, 10);
  const evaluationDone = !!session?.evaluation_confirmed || (players.length > 0 && evaluatedCount >= players.length);

  return (
    <div className="stack">
      <Card className="hero-card">
        <div className="hero-inner">
          <div>
            <p className="kicker">{sessionIsToday ? 'Sesión de hoy' : 'Próxima sesión'}</p>
            <h2>{session?.name || 'No hay sesión'}</h2>
            <p>{session ? buildSessionLabel(session) : 'Crea una sesión para empezar'}</p>
          </div>
          <img src={LOGO_URL} className="hero-logo" alt="Inspire Soccer" />
        </div>
      </Card>

      <Card>
        <p className="kicker">Panel rápido</p>
        <div className="progress-grid">
          <div className={session?.callup_confirmed ? 'progress-card done' : 'progress-card'}>
            <strong>{players.length}</strong>
            <span>Convocatoria</span>
          </div>
          <div className={session?.attendance_confirmed ? 'progress-card done' : 'progress-card'}>
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
        <Card className="warning">
          <AlertTriangle size={20} />
          <div>
            <strong>Atención tarjetas</strong>
            {cardWarnings.map((c: PlayerCardTotal) => (
              <p key={c.player_id}>{c.display_name}: {c.yellow_cards} 🟨{Number(c.red_cards) > 0 ? ` · ${c.red_cards} 🟥` : ''}</p>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="row">
          <p className="kicker">Top jugadores</p>
          <Trophy size={18} />
        </div>
        {topPlayers.length === 0 && <p>Aún no hay evaluaciones.</p>}
        {topPlayers.map((e: Evaluation, index: number) => (
          <div className="top-row" key={e.id}>
            <span className="rank">#{index + 1}</span>
            <strong>{findName(players, e.player_id)}</strong>
            <span>{e.total_score}</span>
          </div>
        ))}
      </Card>

      {role === 'admin' && (
        <>
          <Action label="Gestionar jugadores" onClick={() => setTab('players')} />
          <Action label="Crear / revisar sesiones" onClick={() => setTab('sessions')} />
        </>
      )}
      {(role === 'admin' || role === 'coach') && <Action label="Preparar convocatoria" onClick={() => setTab('callup')} />}
      <Action label="Pasar asistencia" onClick={() => setTab('attendance')} />
      <Action label="Evaluar jugadores" onClick={() => setTab('evaluation')} />
      <Action label="Registrar lesión" onClick={() => setTab('injuries')} />
      <Action label="Ver resumen" onClick={() => setTab('summary')} />
      {role === 'admin' && <Action label="Ver histórico" onClick={() => setTab('history')} />}
    </div>
  );
}

function PlayersAdminPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<Player | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [injuries, setInjuries] = useState<any[]>([]);
  const [playerEvolution, setPlayerEvolution] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', nickname: '', position: 'midfielder', shirt_number: '', status: 'active' });

  async function loadPlayers() {
    const { data } = await supabase.from('players').select('*').order('shirt_number', { ascending: true });
    setPlayers(data || []);
  }

  async function loadPlayerDetails(player: Player) {
    setSelected(player);
    const injuriesRes = await supabase.from('injuries').select('*').eq('player_id', player.id).order('start_date', { ascending: false });
    setInjuries(injuriesRes.data || []);

    const evals = await supabase.from('evaluations').select('*').eq('player_id', player.id).order('submitted_at', { ascending: true });
    const sessionIds = [...new Set((evals.data || []).map((e: any) => e.session_id).filter(Boolean))];
    let sessionMap: Record<string, any> = {};

    if (sessionIds.length > 0) {
      const sessions = await supabase.from('sessions').select('id,name,session_date').in('id', sessionIds);
      sessionMap = Object.fromEntries((sessions.data || []).map((s: any) => [s.id, s]));
    }

    const rows = (evals.data || []).map((e: any) => ({ ...e, session: sessionMap[e.session_id] })).filter((e: any) => e.total_score);
    setPlayerEvolution(rows);
  }

  useEffect(() => { loadPlayers(); }, []);

  function startEdit(player: Player) {
    setEditingId(player.id);
    loadPlayerDetails(player);
    setForm({
      name: player.name || '',
      nickname: player.nickname || '',
      position: player.position || 'midfielder',
      shirt_number: player.shirt_number ? String(player.shirt_number) : '',
      status: player.status || 'active',
    });
  }

  function resetForm() {
    setEditingId(null);
    setSelected(null);
    setInjuries([]);
    setPlayerEvolution([]);
    setForm({ name: '', nickname: '', position: 'midfielder', shirt_number: '', status: 'active' });
  }

  async function savePlayer(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      nickname: form.nickname || null,
      position: form.position,
      shirt_number: form.shirt_number ? Number(form.shirt_number) : null,
      status: form.status,
    };

    if (editingId) await supabase.from('players').update(payload).eq('id', editingId);
    else await supabase.from('players').insert(payload);

    resetForm();
    loadPlayers();
  }

  return (
    <div className="stack">
      <PageTitle title="Jugadores" subtitle="Ver, añadir, modificar y revisar la evolución de cada jugador." />

      <Card>
        <h3>{editingId ? 'Editar jugador' : 'Añadir jugador'}</h3>
        <form className="stack" onSubmit={savePlayer}>
          <input placeholder="Nombre completo" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Nickname" value={form.nickname} onChange={e => setForm({ ...form, nickname: e.target.value })} />
          <input placeholder="Dorsal" value={form.shirt_number} onChange={e => setForm({ ...form, shirt_number: e.target.value })} />
          <select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}>
            <option value="goalkeeper">Portero</option>
            <option value="defender">Defensa</option>
            <option value="midfielder">Mediocentro</option>
            <option value="winger">Extremo</option>
            <option value="forward">Delantero</option>
          </select>
          <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            <option value="active">Activo</option>
            <option value="injured">Lesionado</option>
            <option value="trial">Prueba</option>
            <option value="guest">Invitado</option>
            <option value="inactive">Baja</option>
          </select>
          <button className="primary">{editingId ? 'Guardar cambios' : 'Crear jugador'}</button>
          {editingId && <button type="button" className="secondary" onClick={resetForm}>Cancelar edición</button>}
        </form>
      </Card>

      {selected && (
        <Card className="player-profile-card">
          <p className="kicker">Ficha jugador</p>
          <h2>{selected.display_name}</h2>
          <p>{translatePosition(selected.position)} · {translateStatus(selected.status)}</p>

          <div className="profile-section">
            <strong>Evolución puntuación</strong>
            <MiniLineChart data={playerEvolution} />
          </div>

          <div className="profile-section">
            <strong>Historial lesiones</strong>
            {injuries.length === 0 && <p>No hay lesiones registradas.</p>}
            {injuries.slice(0, 6).map(i => (
              <p key={i.id}>{i.start_date} · {i.body_area || i.injury_type || 'Lesión'} · {translateInjuryStatus(i.status)}</p>
            ))}
          </div>
        </Card>
      )}

      {players.map(player => (
        <Card key={player.id}>
          <div className="row">
            <div>
              <strong>{player.shirt_number ? `${player.shirt_number}. ` : ''}{player.display_name}</strong>
              <p>{player.name} · {translatePosition(player.position)} · {translateStatus(player.status)}</p>
            </div>
            <div className="small-actions">
              <button className="chip" onClick={() => loadPlayerDetails(player)}>Ficha</button>
              <button className="chip" onClick={() => startEdit(player)}>Editar</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function SessionsAdminPage({ reload }: any) {
  const [sessions, setSessions] = useState<AppSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    name: '',
    session_date: new Date().toISOString().slice(0, 10),
    start_time: '',
    type: 'training',
    responsible: '',
    opponent: '',
    home_away: 'home',
  });

  async function loadSessions() {
    setLoadingSessions(true);
    const { data } = await supabase.from('sessions').select('*').order('session_date', { ascending: false });
    setSessions((data || []) as AppSession[]);
    setLoadingSessions(false);
  }

  useEffect(() => { loadSessions(); }, []);

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');

    const { error } = await supabase.from('sessions').insert({
      name: form.name,
      session_date: form.session_date,
      start_time: form.start_time || null,
      type: form.type,
      responsible: form.responsible || null,
      opponent: form.opponent || null,
      home_away: form.home_away || null,
      status: 'planned',
      high_rating_limit: 6,
      low_rating_limit: 3,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setForm({
      name: '',
      session_date: new Date().toISOString().slice(0, 10),
      start_time: '',
      type: 'training',
      responsible: '',
      opponent: '',
      home_away: 'home',
    });

    setMessage('Sesión guardada correctamente.');
    await loadSessions();
    await reload();
  }

  return (
    <div className="stack">
      <PageTitle title="Sesiones" subtitle="Ver y crear entrenos, partidos y tryouts." />

      <Card>
        <h3>Crear sesión</h3>
        <form className="stack" onSubmit={createSession}>
          <input placeholder="Nombre sesión" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <input type="date" value={form.session_date} onChange={e => setForm({ ...form, session_date: e.target.value })} required />
          <input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="training">Entreno</option>
            <option value="friendly_match">Partido amistoso</option>
            <option value="league_match">Partido liga</option>
            <option value="tryout">Tryout</option>
            <option value="scrimmage">Scrimmage</option>
          </select>
          <input placeholder="Responsable" value={form.responsible} onChange={e => setForm({ ...form, responsible: e.target.value })} />
          <input placeholder="Rival" value={form.opponent} onChange={e => setForm({ ...form, opponent: e.target.value })} />
          <select value={form.home_away} onChange={e => setForm({ ...form, home_away: e.target.value })}>
            <option value="home">Local</option>
            <option value="away">Visitante</option>
            <option value="neutral">Neutral</option>
          </select>
          <button className="primary">Crear sesión</button>
        </form>
        {message && <p className={message.includes('correctamente') ? 'success' : 'error'}>{message}</p>}
      </Card>

      {loadingSessions ? <Card><p>Cargando sesiones...</p></Card> : sessions.map(s => (
        <Card key={s.id}>
          <div className="row">
            <div>
              <strong>{s.name}</strong>
              <p>{buildSessionLabel(s)}</p>
            </div>
            <span className="chip">{s.status}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

function CallupPage({ role, session, reload, setError }: any) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [callups, setCallups] = useState<any[]>([]);
  const [localLocked, setLocalLocked] = useState(!!session.callup_confirmed);

  const locked = localLocked;
  const isAdmin = role === 'admin';

  async function loadCallups() {
    const playersRes = await supabase
      .from('players')
      .select('*')
      .in('status', ['active', 'trial', 'guest'])
      .order('shirt_number', { ascending: true });

    const callupsRes = await supabase
      .from('callups')
      .select('*')
      .eq('session_id', session.id);

    setPlayers(playersRes.data || []);
    setCallups(callupsRes.data || []);
  }

  useEffect(() => {
    setLocalLocked(!!session.callup_confirmed);
    loadCallups();
  }, [session.id, session.callup_confirmed]);

  async function confirmConvocatoria() {
    const confirmed = window.confirm('¿Confirmar convocatoria? Después de confirmar, el coach no podrá modificarla.');
    if (!confirmed) return;

    const { error } = await supabase
      .from('sessions')
      .update({ callup_confirmed: true, callup_confirmed_at: new Date().toISOString() })
      .eq('id', session.id);

    if (error) {
      setError(error.message);
      return;
    }

    setLocalLocked(true);
    await loadCallups();
    await reload();
  }

  async function reopenConvocatoria() {
    if (!isAdmin) return;

    const confirmed = window.confirm('¿Reabrir convocatoria? Esto permitirá hacer cambios otra vez.');
    if (!confirmed) return;

    const { error } = await supabase
      .from('sessions')
      .update({ callup_confirmed: false, callup_confirmed_at: null })
      .eq('id', session.id);

    if (error) {
      setError(error.message);
      return;
    }

    setLocalLocked(false);
    await loadCallups();
    await reload();
  }

  async function togglePlayer(player: Player) {
    if (locked) return;

    setError('');
    const existing = callups.find(c => c.player_id === player.id);

    if (existing) {
      const { error } = await supabase.from('callups').delete().eq('id', existing.id);
      if (error) {
        setError(error.message);
        return;
      }

      await supabase.from('attendance').delete().eq('session_id', session.id).eq('player_id', player.id);
      await supabase.from('evaluations').delete().eq('session_id', session.id).eq('player_id', player.id);
    } else {
      const evaluable = player.status !== 'guest';
      const status = player.status === 'trial' ? 'trial' : player.status === 'guest' ? 'guest_not_evaluable' : 'called_up';

      const { error } = await supabase.from('callups').insert({
        session_id: session.id,
        player_id: player.id,
        status,
        evaluable,
      });

      if (error) {
        setError(error.message);
        return;
      }

      await supabase.from('attendance').upsert(
        { session_id: session.id, player_id: player.id, status: 'present' },
        { onConflict: 'session_id,player_id' }
      );

      if (evaluable) {
        await supabase.from('evaluations').upsert(
          { session_id: session.id, player_id: player.id },
          { onConflict: 'session_id,player_id' }
        );
      }
    }

    await loadCallups();
    await reload();
  }

  return (
    <div className="stack">
      <PageTitle title="Convocatoria" subtitle={`Sesión: ${session.name}. Selecciona quién está convocado.`} />

      <Card className={locked ? 'locked-card confirmed-card' : ''}>
        <p className="kicker">Estado</p>
        <h2>{locked ? 'Convocatoria confirmada' : `${callups.length} convocados`}</h2>

        {locked ? (
          <div className="stack">
            <button className="primary confirmed" disabled><CheckCircle2 size={18} /> Convocatoria confirmada</button>
            {isAdmin && <button className="secondary danger" onClick={reopenConvocatoria}><RotateCcw size={16} /> Reabrir convocatoria</button>}
          </div>
        ) : (
          <button className="primary" onClick={confirmConvocatoria}><Save size={18} /> Confirmar convocatoria</button>
        )}
      </Card>

      {players.map(player => {
        const selected = callups.some(c => c.player_id === player.id);
        return (
          <Card key={player.id}>
            <div className="row">
              <div>
                <strong>{player.shirt_number ? `${player.shirt_number}. ` : ''}{player.display_name}</strong>
                <p>{translatePosition(player.position)} · {translateStatus(player.status)}</p>
              </div>
              <button disabled={locked} className={selected ? 'chip active' : 'chip'} onClick={() => togglePlayer(player)}>
                {selected ? 'Convocado' : 'Convocar'}
              </button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function AttendancePage({ role, session, players, attendance, reload, setError }: any) {
  const [explanation, setExplanation] = useState<Record<string, string>>({});
  const [localLocked, setLocalLocked] = useState(!!session.attendance_confirmed);

  const locked = localLocked;
  const isAdmin = role === 'admin';

  useEffect(() => {
    setLocalLocked(!!session.attendance_confirmed);
  }, [session.attendance_confirmed]);

  async function confirmAttendance() {
    const confirmed = window.confirm('¿Confirmar asistencia? El coach no podrá modificarla después.');
    if (!confirmed) return;

    const { error } = await supabase
      .from('sessions')
      .update({ attendance_confirmed: true, attendance_confirmed_at: new Date().toISOString() })
      .eq('id', session.id);

    if (error) {
      setError(error.message);
      return;
    }

    setLocalLocked(true);
    await reload();
  }

  async function reopenAttendance() {
    if (!isAdmin) return;

    const confirmed = window.confirm('¿Reabrir asistencia? Esto permitirá hacer cambios otra vez.');
    if (!confirmed) return;

    const { error } = await supabase
      .from('sessions')
      .update({ attendance_confirmed: false, attendance_confirmed_at: null })
      .eq('id', session.id);

    if (error) {
      setError(error.message);
      return;
    }

    setLocalLocked(false);
    await reload();
  }

  async function update(playerId: string, status: string) {
    if (locked) return;
    setError('');

    const existing = attendance.find((a: Attendance) => a.player_id === playerId);
    const notes = explanation[playerId] || existing?.notes || '';
    const payload = { session_id: session.id, player_id: playerId, status, notes: attendanceNeedsExplanation.includes(status) ? notes : null };

    const res = existing
      ? await supabase.from('attendance').update(payload).eq('id', existing.id)
      : await supabase.from('attendance').insert(payload);

    if (res.error) setError(res.error.message);
    else reload();
  }

  return (
    <div className="stack">
      <PageTitle title="Asistencia" subtitle={`Sesión: ${session.name}. Puedes completar explicaciones más tarde si hace falta.`} />

      <Card className={locked ? 'locked-card confirmed-card' : ''}>
        <p className="kicker">Estado</p>
        <h2>{locked ? 'Asistencia cerrada' : 'Asistencia abierta'}</h2>

        {locked ? (
          <div className="stack">
            <button className="primary confirmed" disabled><CheckCircle2 size={18} /> Asistencia cerrada</button>
            {isAdmin && <button className="secondary danger" onClick={reopenAttendance}><RotateCcw size={16} /> Reabrir asistencia</button>}
          </div>
        ) : (
          <button className="primary" onClick={confirmAttendance}>Confirmar asistencia</button>
        )}
      </Card>

      {players.map((p: Player) => {
        const rec = attendance.find((a: Attendance) => a.player_id === p.id);
        const current = rec?.status || 'present';
        const needs = attendanceNeedsExplanation.includes(current);
        const missingNote = needs && !(explanation[p.id] || rec?.notes || '').trim();

        return (
          <Card key={p.id} className={missingNote ? 'needs-note' : ''}>
            <div className="row"><strong>{p.display_name}</strong><span>{translatePosition(p.position)}</span></div>
            {needs && (
              <>
                <textarea disabled={locked} placeholder="Explicación recomendada..." value={explanation[p.id] ?? rec?.notes ?? ''} onChange={e => setExplanation({ ...explanation, [p.id]: e.target.value })} />
                {missingNote && <p className="tiny-warning">Explicación pendiente/recomendada.</p>}
              </>
            )}
            <div className="chips">
              {attendanceOptions.map(([value, label]) => (
                <button disabled={locked} key={value} className={current === value ? 'chip active' : 'chip'} onClick={() => update(p.id, value)}>
                  {label}
                </button>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function EvaluationPage({ role, session, players, evaluations, reload, setError }: any) {
  const [index, setIndex] = useState(0);
  const [cardType, setCardType] = useState('none');
  const [cardReason, setCardReason] = useState('');
  const [localLocked, setLocalLocked] = useState(!!session.evaluation_confirmed);

  const locked = localLocked;
  const isAdmin = role === 'admin';
  const player = players[index];
  const ev = evaluations.find((e: Evaluation) => e.player_id === player?.id);
  const counters = useMemo(() => getRatingCounts(evaluations), [evaluations]);

  useEffect(() => {
    setLocalLocked(!!session.evaluation_confirmed);
  }, [session.evaluation_confirmed]);

  if (!player) return <p>No hay jugadores para evaluar.</p>;

  async function ensureEval(): Promise<Evaluation | null> {
    if (ev) return ev;

    const { data, error } = await supabase.from('evaluations').insert({ session_id: session.id, player_id: player.id }).select('*').single();

    if (error) {
      setError(error.message);
      return null;
    }

    await reload();
    return data as Evaluation;
  }

  async function update(field: string, value: number | string | boolean) {
    if (locked) return;
    setError('');

    const currentValue = Number((ev as any)?.[field]);
    const highLimit = session.high_rating_limit || 6;
    const lowLimit = session.low_rating_limit || 3;

    if (typeof value === 'number') {
      const isNewHigh = value >= 4;
      const wasHigh = currentValue >= 4;
      const isNewLow = value <= 2;
      const wasLow = currentValue > 0 && currentValue <= 2;

      if (isNewHigh && !wasHigh && counters.high[field] >= highLimit) {
        const msg = 'Has llegado al máximo de jugadores con puntuación alta en esta categoría. Cambia una evaluación anterior para continuar.';
        setError(msg);
        alert(msg);
        return;
      }

      if (isNewLow && !wasLow && counters.low[field] >= lowLimit) {
        const msg = 'Has llegado al máximo de jugadores con puntuación baja en esta categoría. Cambia una evaluación anterior para continuar.';
        setError(msg);
        alert(msg);
        return;
      }
    }

    const record = await ensureEval();
    if (!record) return;

    const { error } = await supabase.from('evaluations').update({ [field]: value, submitted_at: new Date().toISOString() }).eq('id', record.id);

    if (error) setError(cleanDbError(error.message));
    else reload();
  }

  async function saveCardIfNeeded() {
    if (locked) return true;
    if (cardType === 'none') return true;

    if (!cardReason.trim()) {
      setError('Si marcas una tarjeta debes añadir el motivo.');
      return false;
    }

    const { error } = await supabase.from('cards').insert({ session_id: session.id, player_id: player.id, type: cardType, reason: cardReason });

    if (error) {
      setError(error.message);
      return false;
    }

    setCardType('none');
    setCardReason('');
    return true;
  }

  async function next() {
    const ok = await saveCardIfNeeded();
    if (!ok) return;

    await update('evaluated', true);
    setIndex(i => (i + 1) % players.length);
  }

  async function confirmEvaluation() {
    const confirmed = window.confirm('¿Confirmar evaluación? El coach no podrá modificarla después.');
    if (!confirmed) return;

    const { error } = await supabase.from('sessions').update({ evaluation_confirmed: true, evaluation_confirmed_at: new Date().toISOString() }).eq('id', session.id);

    if (error) {
      setError(error.message);
      return;
    }

    setLocalLocked(true);
    await reload();
  }

  async function reopenEvaluation() {
    if (!isAdmin) return;

    const confirmed = window.confirm('¿Reabrir evaluación? Esto permitirá hacer cambios otra vez.');
    if (!confirmed) return;

    const { error } = await supabase.from('sessions').update({ evaluation_confirmed: false, evaluation_confirmed_at: null }).eq('id', session.id);

    if (error) {
      setError(error.message);
      return;
    }

    setLocalLocked(false);
    await reload();
  }

  const current: any = ev || { tactical_discipline: 3, effort_commitment: 3, decision_making: 3, mentality_attitude: 3, coachability: 3, comment: '' };
  const isMatch = ['friendly_match', 'league_match', 'tryout', 'scrimmage'].includes(session.type);
  const highLimit = session.high_rating_limit || 6;
  const lowLimit = session.low_rating_limit || 3;

  return (
    <div className="stack">
      <Card className={locked ? 'locked-card confirmed-card' : ''}>
        <p className="kicker">Estado evaluación</p>
        <h2>{locked ? 'Evaluación confirmada' : 'Evaluación abierta'}</h2>
        {locked ? (
          <div className="stack">
            <button className="primary confirmed" disabled><CheckCircle2 size={18} /> Evaluación confirmada</button>
            {isAdmin && <button className="secondary danger" onClick={reopenEvaluation}><RotateCcw size={16} /> Reabrir evaluación</button>}
          </div>
        ) : (
          <button className="primary" onClick={confirmEvaluation}>Confirmar evaluación</button>
        )}
      </Card>

      <div className="progress">{index + 1} / {players.length}</div>

      <Card>
        <div className="search-label"><Search size={16} /> Ir a jugador</div>
        <select value={index} onChange={e => setIndex(Number(e.target.value))}>
          {players.map((p: Player, i: number) => <option key={p.id} value={i}>{i + 1}. {p.display_name}</option>)}
        </select>
      </Card>

      <Card>
        <div className="row">
          <div><p className="kicker">Jugador</p><h2>{player.display_name}</h2><p>{translatePosition(player.position)}</p></div>
          <div className="score-badge">{current.total_score || '-'}</div>
        </div>
      </Card>

      {ratingFields.map(([field, label]) => {
        const highReached = counters.high[field] >= highLimit;
        const lowReached = counters.low[field] >= lowLimit;

        return (
          <Card key={field}>
            <div className="row rating-header">
              <strong>{label}</strong>
              <div className="limit-stack">
                <span className={highReached ? 'limit danger' : 'limit'}>Altas: {counters.high[field]}/{highLimit}</span>
                <span className={lowReached ? 'limit danger' : 'limit'}>Bajas: {counters.low[field]}/{lowLimit}</span>
              </div>
            </div>
            <div className="rating">
              {[1, 2, 3, 4, 5].map(n => <button disabled={locked} key={n} className={current[field] === n ? 'rate active' : 'rate'} onClick={() => update(field, n)}>{n}</button>)}
            </div>
          </Card>
        );
      })}

      {isMatch && (
        <Card>
          <strong>Tarjetas</strong>
          <select disabled={locked} value={cardType} onChange={e => setCardType(e.target.value)}>
            {cardOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {cardType !== 'none' && <textarea disabled={locked} placeholder="Motivo de la tarjeta..." value={cardReason} onChange={e => setCardReason(e.target.value)} />}
        </Card>
      )}

      <Card>
        <strong>Comentario corto</strong>
        <textarea disabled={locked} defaultValue={current.comment || ''} onBlur={e => update('comment', e.target.value)} placeholder="Comentario corto..." />
      </Card>

      <button className="primary" onClick={next} disabled={locked}>Siguiente jugador <ChevronRight size={18} /></button>
      <button className="secondary" disabled={index === 0} onClick={() => setIndex(i => Math.max(0, i - 1))}>Anterior</button>
    </div>
  );
}

function InjuryPage({ session, players, reload, setError }: any) {
  const [playerId, setPlayerId] = useState(players[0]?.id || '');
  const [injuryType, setInjuryType] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [injuries, setInjuries] = useState<any[]>([]);

  async function loadInjuries() {
    const { data } = await supabase.from('injuries').select('*, players(display_name)').order('start_date', { ascending: false });
    setInjuries(data || []);
  }

  useEffect(() => { loadInjuries(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('injuries').insert({ session_id: session.id, player_id: playerId, start_date: date, injury_type: injuryType, body_area: injuryType, status: 'active', notes });

    if (error) setError(error.message);
    else {
      setInjuryType('');
      setNotes('');
      reload();
      loadInjuries();
      alert('Lesión registrada');
    }
  }

  async function closeInjury(injuryId: string) {
    const { error } = await supabase.from('injuries').update({ status: 'recovered', end_date: new Date().toISOString().slice(0, 10) }).eq('id', injuryId);

    if (error) setError(error.message);
    else {
      loadInjuries();
      alert('Alta registrada');
    }
  }

  const active = injuries.filter(i => i.status !== 'recovered');
  const recovered = injuries.filter(i => i.status === 'recovered');

  return (
    <div className="stack">
      <form className="stack" onSubmit={submit}>
        <PageTitle title="Lesiones" subtitle="Registra lesiones y marca altas cuando el jugador se recupere." />
        <Card>
          <h3>Nueva lesión</h3>
          <select value={playerId} onChange={e => setPlayerId(e.target.value)}>
            {players.map((p: Player) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
          <input placeholder="Lesión / zona afectada" value={injuryType} onChange={e => setInjuryType(e.target.value)} required />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          <textarea placeholder="Notas" value={notes} onChange={e => setNotes(e.target.value)} />
          <button className="primary">Guardar lesión</button>
        </Card>
      </form>

      <Card>
        <p className="kicker">Lesiones abiertas</p>
        {active.length === 0 && <p>No hay lesiones abiertas.</p>}
        {active.map(i => <div className="injury-row" key={i.id}><div><strong>{i.players?.display_name || 'Jugador'}</strong><p>{i.start_date} · {i.injury_type || i.body_area}</p></div><button className="chip active" onClick={() => closeInjury(i.id)}>Dar alta</button></div>)}
      </Card>

      <Card>
        <p className="kicker">Lesiones superadas</p>
        {recovered.length === 0 && <p>No hay lesiones superadas.</p>}
        {recovered.slice(0, 8).map(i => <p key={i.id}>{i.players?.display_name || 'Jugador'} · {i.injury_type || i.body_area} · alta {i.end_date}</p>)}
      </Card>
    </div>
  );
}

function SummaryPage({ session, players, evaluations, attendance, cardTotals }: any) {
  const evaluated = evaluations.filter((e: Evaluation) => e.evaluated);
  const byScore = [...evaluations].filter((e: Evaluation) => e.total_score).sort((a, b) => Number(b.total_score) - Number(a.total_score));
  const counts = getRatingCounts(evaluations);
  const cardWarnings = getCardWarnings(cardTotals);

  return (
    <div className="stack">
      <PageTitle title="Resumen" subtitle={`Resumen visual de ${session.name}.`} />

      <Card className="summary-hero">
        <div><p className="kicker">Evaluaciones completadas</p><h2>{evaluated.length} / {players.length}</h2></div>
        <div><p className="kicker">Asistencias registradas</p><h2>{attendance.length}</h2></div>
      </Card>

      <Card>
        <p className="kicker">Alertas tarjetas</p>
        {cardWarnings.length === 0 && <p>No hay jugadores cerca de suspensión.</p>}
        {cardWarnings.slice(0, 8).map((c: PlayerCardTotal) => (
          <div key={c.player_id} className={Number(c.yellow_cards) >= 3 || Number(c.red_cards) > 0 ? 'card-alert danger-card' : 'card-alert'}>
            <strong>{c.display_name}</strong>
            <span>{c.yellow_cards} 🟨 · {c.red_cards} 🟥</span>
          </div>
        ))}
      </Card>

      <Card>
        <p className="kicker">Top jugadores</p>
        {byScore.length === 0 && <p>No hay evaluaciones todavía.</p>}
        {byScore.slice(0, 5).map((e: Evaluation, i: number) => <div className="top-row" key={e.id}><span className="rank">#{i + 1}</span><strong>{findName(players, e.player_id)}</strong><span>{e.total_score}</span></div>)}
      </Card>

      <Card>
        <p className="kicker">Balance evaluaciones</p>
        {ratingFields.map(([field, label]) => {
          const high = counts.high[field] || 0;
          const low = counts.low[field] || 0;
          const total = Math.max(players.length, 1);

          return (
            <div className="summary-bar" key={field}>
              <div className="summary-top"><strong>{label}</strong><span>{high} altas · {low} bajas</span></div>
              <div className="bar-track"><div className="bar-high" style={{ width: `${(high / total) * 100}%` }} /><div className="bar-low" style={{ width: `${(low / total) * 100}%` }} /></div>
            </div>
          );
        })}
      </Card>

      <Card>
        <p className="kicker">Asistencia</p>
        {attendanceOptions.map(([value, label]) => <p key={value}>{label}: {attendance.filter((a: Attendance) => a.status === value).length}</p>)}
      </Card>
    </div>
  );
}

function HistoryPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [injuries, setInjuries] = useState<any[]>([]);

  async function loadSessions() {
    const { data } = await supabase.from('sessions').select('*').order('session_date', { ascending: false });
    setSessions(data || []);
    setSelectedSessionId((data || [])[0]?.id || '');
  }

  async function loadHistory(sessionId: string) {
    if (!sessionId) return;
    const ev = await supabase.from('evaluations').select('*, players(display_name)').eq('session_id', sessionId);
    const att = await supabase.from('attendance').select('*, players(display_name)').eq('session_id', sessionId);
    const inj = await supabase.from('injuries').select('*, players(display_name)').eq('session_id', sessionId);
    setEvaluations(ev.data || []);
    setAttendance(att.data || []);
    setInjuries(inj.data || []);
  }

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { if (selectedSessionId) loadHistory(selectedSessionId); }, [selectedSessionId]);

  const top = [...evaluations].filter(e => e.total_score).sort((a, b) => Number(b.total_score) - Number(a.total_score))[0];

  return (
    <div className="stack">
      <PageTitle title="Histórico admin" subtitle="Revisa datos anteriores de forma compacta." />
      <select value={selectedSessionId} onChange={e => setSelectedSessionId(e.target.value)}>
        {sessions.map(s => <option key={s.id} value={s.id}>{s.name} · {formatDate(s.session_date)}</option>)}
      </select>

      <div className="history-grid">
        <Card><p className="kicker">Evaluaciones</p><h2>{evaluations.length}</h2></Card>
        <Card><p className="kicker">Asistencias</p><h2>{attendance.length}</h2></Card>
        <Card><p className="kicker">Lesiones</p><h2>{injuries.length}</h2></Card>
      </div>

      <Card>
        <p className="kicker">Top sesión</p>
        {top ? <p>{top.players?.display_name || 'Jugador'} · {top.total_score}</p> : <p>No hay evaluaciones todavía.</p>}
      </Card>

      <Card>
        <p className="kicker">Detalle rápido</p>
        {evaluations.slice(0, 8).map(e => <p key={e.id}>{e.players?.display_name || 'Jugador'} — {e.total_score}</p>)}
      </Card>
    </div>
  );
}

function MiniLineChart({ data }: { data: any[] }) {
  if (!data || data.length === 0) return <div className="empty-chart">Aún no hay datos de evolución.</div>;

  const width = 320;
  const height = 140;
  const max = 5;
  const min = 1;
  const points = data.map((d, i) => {
    const x = data.length === 1 ? width / 2 : (i / (data.length - 1)) * width;
    const y = height - ((Number(d.total_score) - min) / (max - min)) * height;
    return { x, y, score: Number(d.total_score), label: d.session?.name || 'Sesión' };
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="line-chart" role="img">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="5" fill="currentColor" />)}
      </svg>
      <div className="chart-caption">Última media: {points[points.length - 1]?.score || '-'}</div>
    </div>
  );
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h2>{title}</h2><p className="muted">{subtitle}</p></div>;
}

function NavButton({ active, onClick, icon, label }: any) {
  return <button className={active ? 'nav active' : 'nav'} onClick={onClick}>{React.cloneElement(icon, { size: 18 })}<span>{label}</span></button>;
}

function Action({ label, onClick }: any) {
  return <button className="action" onClick={onClick}><span>{label}</span><ChevronRight size={18} /></button>;
}

function Card({ children, className = '' }: any) {
  return <div className={`card ${className}`}>{children}</div>;
}

function Screen({ children }: any) {
  return <div className="screen">{children}</div>;
}

function getRatingCounts(evaluations: Evaluation[]) {
  const result: { high: Record<string, number>; low: Record<string, number> } = { high: {}, low: {} };

  ratingFields.forEach(([field]) => {
    result.high[field] = evaluations.filter((e: any) => Number(e[field]) >= 4).length;
    result.low[field] = evaluations.filter((e: any) => Number(e[field]) > 0 && Number(e[field]) <= 2).length;
  });

  return result;
}

function getCardWarnings(cardTotals: PlayerCardTotal[]) {
  return [...(cardTotals || [])]
    .filter((c: PlayerCardTotal) => Number(c.yellow_cards) >= 3 || Number(c.red_cards) >= 1 || Number(c.total_cards) > 0)
    .sort((a: PlayerCardTotal, b: PlayerCardTotal) => (Number(b.red_cards) * 10 + Number(b.yellow_cards)) - (Number(a.red_cards) * 10 + Number(a.yellow_cards)));
}

function findName(players: Player[], id: string) {
  return players.find(p => p.id === id)?.display_name || 'Jugador';
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function getStartTime(session: AppSession) {
  return session.start_time || '';
}

function buildSessionLabel(session: AppSession) {
  const time = getStartTime(session);
  const opponent = session.opponent ? ` · vs ${session.opponent}` : '';
  return `${translateSessionType(session.type)} · ${formatDate(session.session_date)}${time ? ` · ${time}` : ''}${opponent}`;
}

function translatePosition(position?: string | null) {
  const map: Record<string, string> = { goalkeeper: 'Portero', defender: 'Defensa', midfielder: 'Mediocentro', winger: 'Extremo', forward: 'Delantero' };
  return position ? map[position] || position : '';
}

function translateStatus(status?: string | null) {
  const map: Record<string, string> = { active: 'Activo', injured: 'Lesionado', inactive: 'Baja', trial: 'Prueba', guest: 'Invitado' };
  return status ? map[status] || status : '';
}

function translateSessionType(type?: string | null) {
  const map: Record<string, string> = { training: 'Entreno', league_match: 'Partido liga', friendly_match: 'Partido amistoso', tryout: 'Tryout', scrimmage: 'Scrimmage' };
  return type ? map[type] || type : '';
}

function translateInjuryStatus(status?: string | null) {
  const map: Record<string, string> = { active: 'Abierta', recovered: 'Superada', pending_review: 'Pendiente revisión', minor_discomfort: 'Molestia leve' };
  return status ? map[status] || status : '';
}

function cleanDbError(message: string) {
  if (message.includes('Maximum high ratings')) return 'Has llegado al máximo de jugadores con puntuación alta en esta categoría. Cambia una evaluación anterior para continuar.';
  if (message.includes('Maximum low ratings')) return 'Has llegado al máximo de jugadores con puntuación baja en esta categoría. Cambia una evaluación anterior para continuar.';
  if (message.includes('locked')) return 'Esta sesión está bloqueada. Solo un administrador puede editarla.';
  return message;
}

createRoot(document.getElementById('root')!).render(<App />);
