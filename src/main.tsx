import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ChevronRight,
  ClipboardList, HeartPulse, Lock, LogOut, Save, Shield, Star, Trophy, Users
} from 'lucide-react';
import { supabase } from './supabase';
import type { Attendance, Evaluation, Player, Role, Session } from './types';
import './styles.css';

type Tab = 'home'|'players'|'sessions'|'callup'|'attendance'|'evaluation'|'injuries'|'summary'|'history';
type AppSession = Session & {
  start_time?: string | null;
  callup_confirmed?: boolean;
  callup_confirmed_at?: string | null;
  attendance_confirmed?: boolean;
  attendance_confirmed_at?: string | null;
  opponent?: string | null;
};

const DEV_BYPASS_LOGIN = false;

const ratingFields = [
  ['tactical_discipline', 'Disciplina táctica'],
  ['effort_commitment', 'Esfuerzo / compromiso'],
  ['decision_making', 'Toma de decisiones'],
  ['mentality_attitude', 'Mentalidad / actitud'],
  ['coachability', 'Capacidad de corrección'],
] as const;

const attendanceOptions = [
  ['present','Presente'], ['late','Tarde'], ['justified_late','Tarde justificado'],
  ['justified_absence','Ausencia justificada'], ['unjustified_absence','Ausencia injustificada'], ['injured','Lesionado'],
] as const;

const attendanceNeedsExplanation = ['late','justified_late','justified_absence','unjustified_absence','injured'];

const cardOptions = [
  ['none','Sin tarjeta'], ['yellow','Amarilla'], ['double_yellow','Doble amarilla'], ['straight_red','Roja directa'],
] as const;

function App() {
  const [user,setUser]=useState<any>(null);
  const [role,setRole]=useState<Role>('viewer');
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setUser(data.session?.user??null);setLoading(false);});
    const {data:sub}=supabase.auth.onAuthStateChange((_e,session)=>setUser(session?.user??null));
    return()=>sub.subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!user)return;
    supabase.from('profiles').select('role').eq('id',user.id).single().then(({data})=>{if(data?.role)setRole(data.role);});
  },[user]);

  if(loading)return <Screen><p>Cargando...</p></Screen>;
  if(DEV_BYPASS_LOGIN)return <Platform role="admin"/>;
  if(!user)return <Login/>;
  return <Platform role={role}/>;
}

function Login(){
  const[email,setEmail]=useState('');
  const[password,setPassword]=useState('');
  const[mode,setMode]=useState<'password'|'magic'>('password');
  const[message,setMessage]=useState('');
  const[error,setError]=useState('');

  async function login(e:React.FormEvent){
    e.preventDefault(); setError(''); setMessage('');
    if(mode==='password'){
      const {error}=await supabase.auth.signInWithPassword({email,password});
      if(error)setError('Email o contraseña incorrectos.');
      return;
    }
    const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin}});
    if(error)setError(error.message); else setMessage('Te hemos enviado un enlace de acceso al email.');
  }

  return <Screen><div className="login-card">
    <div className="brand-mark">⚽</div><h1>Inspire Soccer</h1><p>Accede para gestionar la plataforma del equipo.</p>
    <div className="segmented">
      <button type="button" className={mode==='password'?'selected':''} onClick={()=>setMode('password')}>Contraseña</button>
      <button type="button" className={mode==='magic'?'selected':''} onClick={()=>setMode('magic')}>Email link</button>
    </div>
    <form onSubmit={login} className="stack">
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" type="email" required/>
      {mode==='password'&&<input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Contraseña" type="password" required/>}
      <button className="primary">{mode==='password'?'Entrar':'Enviar enlace'}</button>
    </form>
    {message&&<p className="success">{message}</p>}{error&&<p className="error">{error}</p>}
  </div></Screen>;
}

function Platform({role}:{role:Role}){
  const[tab,setTab]=useState<Tab>('home');
  const[session,setSession]=useState<AppSession|null>(null);
  const[players,setPlayers]=useState<Player[]>([]);
  const[attendance,setAttendance]=useState<Attendance[]>([]);
  const[evaluations,setEvaluations]=useState<Evaluation[]>([]);
  const[cardTotals,setCardTotals]=useState<any[]>([]);
  const[error,setError]=useState('');
  const isAdmin=role==='admin', isCoach=role==='coach';

  async function load(){
    setError('');
    const today=new Date().toISOString().slice(0,10);
    let {data:sessions,error:sessionError}=await supabase.from('sessions').select('*').gte('session_date',today).in('status',['planned','completed']).order('session_date',{ascending:true}).limit(1);
    if(sessionError)setError(sessionError.message);
    if(!sessions||sessions.length===0){
      const fb=await supabase.from('sessions').select('*').order('session_date',{ascending:false}).limit(1);
      sessions=fb.data||[];
    }
    const current=(sessions?.[0]||null) as AppSession|null;
    setSession(current);
    if(!current){setPlayers([]);setAttendance([]);setEvaluations([]);setCardTotals([]);return;}

    const callups=await supabase.from('callups').select('player_id,evaluable,status,players(*)').eq('session_id',current.id).neq('status','not_called').order('created_at');
    setPlayers(((callups.data||[]) as any[]).map(r=>r.players).filter(Boolean));
    const att=await supabase.from('attendance').select('*').eq('session_id',current.id);
    setAttendance(att.data||[]);
    const ev=await supabase.from('evaluations').select('*').eq('session_id',current.id);
    setEvaluations(ev.data||[]);
    const cards=await supabase.from('player_card_totals').select('*');
    setCardTotals(cards.data||[]);
  }

  useEffect(()=>{load();},[]);

  return <div className="app">
    <header><div><h1>Inspire Soccer</h1><p>{session?buildSessionLabel(session):'Sin sesión activa'}</p></div>
      <div className="header-actions"><span className="role-pill">{role==='admin'?'Admin':role==='coach'?'Coach':'Viewer'}</span><button className="icon-btn" onClick={()=>supabase.auth.signOut()}><LogOut size={18}/></button></div>
    </header>
    {error&&<div className="error-banner">{error}</div>}
    <main>
      {tab==='home'&&<Home role={role} session={session} players={players} attendance={attendance} evaluations={evaluations} cardTotals={cardTotals} setTab={setTab}/>}
      {tab==='players'&&isAdmin&&<PlayersAdminPage/>}
      {tab==='sessions'&&isAdmin&&<SessionsAdminPage reload={load}/>}
      {tab==='callup'&&session&&(isAdmin||isCoach)&&<CallupPage session={session} reload={load} setError={setError}/>}
      {tab==='attendance'&&session&&<AttendancePage session={session} players={players} attendance={attendance} reload={load} setError={setError}/>}
      {tab==='evaluation'&&session&&<EvaluationPage session={session} players={players} evaluations={evaluations} reload={load} setError={setError}/>}
      {tab==='injuries'&&session&&<InjuryPage session={session} players={players} reload={load} setError={setError}/>}
      {tab==='summary'&&session&&<SummaryPage session={session} players={players} evaluations={evaluations} attendance={attendance} cardTotals={cardTotals}/>}
      {tab==='history'&&isAdmin&&<HistoryPage/>}
    </main>
    <nav className={isAdmin?'nav-grid admin':'nav-grid'}>
      <NavButton active={tab==='home'} onClick={()=>setTab('home')} icon={<Activity/>} label="Inicio"/>
      {isAdmin&&<><NavButton active={tab==='players'} onClick={()=>setTab('players')} icon={<Users/>} label="Jugadores"/><NavButton active={tab==='sessions'} onClick={()=>setTab('sessions')} icon={<CalendarDays/>} label="Sesiones"/></>}
      {(isAdmin||isCoach)&&<NavButton active={tab==='callup'} onClick={()=>setTab('callup')} icon={<Users/>} label="Convocatoria"/>}
      <NavButton active={tab==='attendance'} onClick={()=>setTab('attendance')} icon={<ClipboardList/>} label="Asistencia"/>
      <NavButton active={tab==='evaluation'} onClick={()=>setTab('evaluation')} icon={<Star/>} label="Evaluar"/>
      <NavButton active={tab==='injuries'} onClick={()=>setTab('injuries')} icon={<HeartPulse/>} label="Lesiones"/>
      <NavButton active={tab==='summary'} onClick={()=>setTab('summary')} icon={<BarChart3/>} label="Resumen"/>
      {isAdmin&&<NavButton active={tab==='history'} onClick={()=>setTab('history')} icon={<Shield/>} label="Histórico"/>}
    </nav>
  </div>;
}

function Home({role,session,players,attendance,evaluations,cardTotals,setTab}:any){
  const evaluatedCount=evaluations.filter((e:Evaluation)=>e.evaluated).length;
  const topPlayers=[...evaluations].filter((e:Evaluation)=>e.total_score).sort((a,b)=>Number(b.total_score)-Number(a.total_score)).slice(0,3);
  const cardWarnings=(cardTotals||[]).filter((c:any)=>Number(c.yellow_cards)>=4);
  const sessionIsToday=session?.session_date===new Date().toISOString().slice(0,10);
  const evaluationDone = players.length > 0 && evaluatedCount >= players.length;

  return <div className="stack">
    <Card className="hero-card"><p className="kicker">{sessionIsToday?'Sesión de hoy':'Próxima sesión'}</p><h2>{session?.name||'No hay sesión'}</h2><p>{session?buildSessionLabel(session):'Crea una sesión para empezar'}</p></Card>

    <Card>
      <p className="kicker">Panel rápido</p>
      <div className="progress-grid">
        <div className={session?.callup_confirmed?'progress-card done':'progress-card'}>
          <strong>{players.length}</strong>
          <span>Convocatoria</span>
        </div>
        <div className={session?.attendance_confirmed?'progress-card done':'progress-card'}>
          <strong>{attendance.length}</strong>
          <span>Asistencia</span>
        </div>
        <div className={evaluationDone?'progress-card done':'progress-card'}>
          <strong>{evaluatedCount}/{players.length}</strong>
          <span>Evaluación</span>
        </div>
      </div>
    </Card>

    <Card>
      <p className="kicker">Top jugadores</p>
      {topPlayers.length===0&&<p>Aún no hay evaluaciones.</p>}
      {topPlayers.map((e:Evaluation,index:number)=><div className="top-row" key={e.id}>
        <span className="rank">#{index+1}</span>
        <strong>{findName(players,e.player_id)}</strong>
        <span>{e.total_score}</span>
      </div>)}
    </Card>

    {cardWarnings.length>0&&<Card className="warning"><AlertTriangle size={20}/><div><strong>Atención tarjetas</strong>{cardWarnings.map((c:any)=><p key={c.player_id}>{c.display_name}: {c.yellow_cards} amarillas</p>)}</div></Card>}
    {role==='admin'&&<><Action label="Gestionar jugadores" onClick={()=>setTab('players')}/><Action label="Crear / revisar sesiones" onClick={()=>setTab('sessions')}/></>}
    {(role==='admin'||role==='coach')&&<Action label="Preparar convocatoria" onClick={()=>setTab('callup')}/>}
    <Action label="Pasar asistencia" onClick={()=>setTab('attendance')}/><Action label="Evaluar jugadores" onClick={()=>setTab('evaluation')}/><Action label="Registrar lesión" onClick={()=>setTab('injuries')}/><Action label="Ver resumen" onClick={()=>setTab('summary')}/>
    {role==='admin'&&<Action label="Ver histórico" onClick={()=>setTab('history')}/>}
  </div>;
}

function PlayersAdminPage(){
  const[players,setPlayers]=useState<Player[]>([]);
  const[selected,setSelected]=useState<Player|null>(null);
  const[injuries,setInjuries]=useState<any[]>([]);
  const[editingId,setEditingId]=useState<string|null>(null);
  const[form,setForm]=useState({name:'',nickname:'',position:'midfielder',shirt_number:'',status:'active'});

  async function loadPlayers(){const{data}=await supabase.from('players').select('*').order('shirt_number',{ascending:true});setPlayers(data||[]);}
  async function loadPlayerInjuries(playerId:string){const{data}=await supabase.from('injuries').select('*').eq('player_id',playerId).order('start_date',{ascending:false});setInjuries(data||[]);}
  useEffect(()=>{loadPlayers();},[]);

  function startEdit(player:Player){setEditingId(player.id);setSelected(player);loadPlayerInjuries(player.id);setForm({name:player.name||'',nickname:player.nickname||'',position:player.position||'midfielder',shirt_number:player.shirt_number?String(player.shirt_number):'',status:player.status||'active'});}
  function resetForm(){setEditingId(null);setSelected(null);setInjuries([]);setForm({name:'',nickname:'',position:'midfielder',shirt_number:'',status:'active'});}
  async function savePlayer(e:React.FormEvent){e.preventDefault();const payload={name:form.name,nickname:form.nickname||null,position:form.position,shirt_number:form.shirt_number?Number(form.shirt_number):null,status:form.status}; if(editingId)await supabase.from('players').update(payload).eq('id',editingId);else await supabase.from('players').insert(payload);resetForm();loadPlayers();}

  return <div className="stack"><PageTitle title="Jugadores" subtitle="Ver, añadir y modificar jugadores de la plantilla."/>
    <Card><h3>{editingId?'Editar jugador':'Añadir jugador'}</h3><form className="stack" onSubmit={savePlayer}>
      <input placeholder="Nombre completo" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/><input placeholder="Nickname" value={form.nickname} onChange={e=>setForm({...form,nickname:e.target.value})}/><input placeholder="Dorsal" value={form.shirt_number} onChange={e=>setForm({...form,shirt_number:e.target.value})}/>
      <select value={form.position} onChange={e=>setForm({...form,position:e.target.value})}><option value="goalkeeper">Portero</option><option value="defender">Defensa</option><option value="midfielder">Mediocentro</option><option value="winger">Extremo</option><option value="forward">Delantero</option></select>
      <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Activo</option><option value="injured">Lesionado</option><option value="trial">Prueba</option><option value="guest">Invitado</option><option value="inactive">Baja</option></select>
      <button className="primary">{editingId?'Guardar cambios':'Crear jugador'}</button>{editingId&&<button type="button" className="secondary" onClick={resetForm}>Cancelar edición</button>}
    </form></Card>
    {selected&&<Card><p className="kicker">Historial lesiones · {selected.display_name}</p>{injuries.length===0&&<p>No hay lesiones registradas.</p>}{injuries.map(i=><p key={i.id}>{i.start_date} · {i.body_area||i.injury_type||'Lesión'} · {translateInjuryStatus(i.status)}</p>)}</Card>}
    {players.map(player=><Card key={player.id}><div className="row"><div><strong>{player.shirt_number?`${player.shirt_number}. `:''}{player.display_name}</strong><p>{player.name} · {translatePosition(player.position)} · {translateStatus(player.status)}</p></div><button className="chip" onClick={()=>startEdit(player)}>Editar</button></div></Card>)}
  </div>;
}

function SessionsAdminPage({reload}:any){
  const[sessions,setSessions]=useState<AppSession[]>([]);
  const[form,setForm]=useState({name:'',session_date:new Date().toISOString().slice(0,10),start_time:'',type:'training',responsible:'',opponent:'',home_away:'home'});
  async function loadSessions(){const{data}=await supabase.from('sessions').select('*').order('session_date',{ascending:false});setSessions((data||[]) as AppSession[]);}
  useEffect(()=>{loadSessions();},[]);
  async function createSession(e:React.FormEvent){e.preventDefault();await supabase.from('sessions').insert({name:form.name,session_date:form.session_date,start_time:form.start_time||null,type:form.type,responsible:form.responsible||null,opponent:form.opponent||null,home_away:form.home_away||null,status:'planned',high_rating_limit:6});setForm({name:'',session_date:new Date().toISOString().slice(0,10),start_time:'',type:'training',responsible:'',opponent:'',home_away:'home'});await loadSessions();await reload();}
  return <div className="stack"><PageTitle title="Sesiones" subtitle="Ver y crear entrenos, partidos y tryouts."/>
    <Card><h3>Crear sesión</h3><form className="stack" onSubmit={createSession}>
      <input placeholder="Nombre sesión" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/><input type="date" value={form.session_date} onChange={e=>setForm({...form,session_date:e.target.value})} required/><input type="time" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})}/>
      <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="training">Entreno</option><option value="friendly_match">Partido amistoso</option><option value="league_match">Partido liga</option><option value="tryout">Tryout</option><option value="scrimmage">Scrimmage</option></select>
      <input placeholder="Responsable" value={form.responsible} onChange={e=>setForm({...form,responsible:e.target.value})}/><input placeholder="Rival" value={form.opponent} onChange={e=>setForm({...form,opponent:e.target.value})}/>
      <select value={form.home_away} onChange={e=>setForm({...form,home_away:e.target.value})}><option value="home">Local</option><option value="away">Visitante</option><option value="neutral">Neutral</option></select><button className="primary">Crear sesión</button>
    </form></Card>
    {sessions.map(s=><Card key={s.id}><div className="row"><div><strong>{s.name}</strong><p>{buildSessionLabel(s)}</p></div><span className="chip">{s.status}</span></div></Card>)}
  </div>;
}

function CallupPage({session,reload,setError}:any){
  const[players,setPlayers]=useState<Player[]>([]);
  const[callups,setCallups]=useState<any[]>([]);
  const locked=!!session.callup_confirmed;
  async function loadCallups(){const pr=await supabase.from('players').select('*').in('status',['active','trial','guest']).order('shirt_number',{ascending:true});const cr=await supabase.from('callups').select('*').eq('session_id',session.id);setPlayers(pr.data||[]);setCallups(cr.data||[]);}
  useEffect(()=>{loadCallups();},[session.id]);

  async function confirmConvocatoria(){
    const confirmed = window.confirm('¿Confirmar convocatoria? Después de confirmar, no se podrá modificar desde esta pantalla.');
    if(!confirmed)return;
    const{error}=await supabase.from('sessions').update({callup_confirmed:true,callup_confirmed_at:new Date().toISOString()}).eq('id',session.id);
    if(error)setError(error.message);else{alert('Convocatoria confirmada.');await reload();}
  }

  async function togglePlayer(player:Player){if(locked)return;setError('');const existing=callups.find(c=>c.player_id===player.id);if(existing){const{error}=await supabase.from('callups').delete().eq('id',existing.id);if(error){setError(error.message);return;}await supabase.from('attendance').delete().eq('session_id',session.id).eq('player_id',player.id);await supabase.from('evaluations').delete().eq('session_id',session.id).eq('player_id',player.id);}else{const evaluable=player.status!=='guest';const status=player.status==='trial'?'trial':player.status==='guest'?'guest_not_evaluable':'called_up';const{error}=await supabase.from('callups').insert({session_id:session.id,player_id:player.id,status,evaluable});if(error){setError(error.message);return;}await supabase.from('attendance').upsert({session_id:session.id,player_id:player.id,status:'present'},{onConflict:'session_id,player_id'});if(evaluable)await supabase.from('evaluations').upsert({session_id:session.id,player_id:player.id},{onConflict:'session_id,player_id'});}await loadCallups();await reload();}
  return <div className="stack"><PageTitle title="Convocatoria" subtitle={`Sesión: ${session.name}. Selecciona quién está convocado.`}/>
    <Card className={locked?'locked-card confirmed-card':''}><p className="kicker">Estado</p><h2>{locked?'Convocatoria confirmada':`${callups.length} convocados`}</h2>{locked?<button className="primary confirmed" disabled><CheckCircle2 size={18}/> Convocatoria confirmada</button>:<button className="primary" onClick={confirmConvocatoria}><Save size={18}/> Confirmar convocatoria</button>}</Card>
    {players.map(player=>{const selected=callups.some(c=>c.player_id===player.id);return <Card key={player.id}><div className="row"><div><strong>{player.shirt_number?`${player.shirt_number}. `:''}{player.display_name}</strong><p>{translatePosition(player.position)} · {translateStatus(player.status)}</p></div><button disabled={locked} className={selected?'chip active':'chip'} onClick={()=>togglePlayer(player)}>{selected?'Convocado':'Convocar'}</button></div></Card>;})}
  </div>;
}

function AttendancePage({session,players,attendance,reload,setError}:any){
  const[explanation,setExplanation]=useState<Record<string,string>>({});
  const locked=!!session.attendance_confirmed;
  async function confirmAttendance(){const{error}=await supabase.from('sessions').update({attendance_confirmed:true,attendance_confirmed_at:new Date().toISOString()}).eq('id',session.id);if(error)setError(error.message);else{alert('Asistencia cerrada.');await reload();}}
  async function update(playerId:string,status:string){if(locked)return;setError('');const needs=attendanceNeedsExplanation.includes(status);const existing=attendance.find((a:Attendance)=>a.player_id===playerId);const notes=explanation[playerId]||existing?.notes||'';if(needs&&!notes.trim()){setError('Para marcar tarde, ausencia o lesión debes añadir una explicación.');return;}const payload={session_id:session.id,player_id:playerId,status,notes:needs?notes:null};const res=existing?await supabase.from('attendance').update(payload).eq('id',existing.id):await supabase.from('attendance').insert(payload);if(res.error)setError(res.error.message);else reload();}
  return <div className="stack"><PageTitle title="Asistencia" subtitle={`Sesión: ${session.name}. Todos aparecen como Presente por defecto.`}/>
    <Card className={locked?'locked-card confirmed-card':''}><p className="kicker">Estado</p><h2>{locked?'Asistencia cerrada':'Asistencia abierta'}</h2>{locked?<button className="primary confirmed" disabled><CheckCircle2 size={18}/> Asistencia cerrada</button>:<button className="primary" onClick={confirmAttendance}>Confirmar asistencia</button>}</Card>
    {players.map((p:Player)=>{const rec=attendance.find((a:Attendance)=>a.player_id===p.id);const current=rec?.status||'present';const needs=attendanceNeedsExplanation.includes(current);return <Card key={p.id}><div className="row"><strong>{p.display_name}</strong><span>{translatePosition(p.position)}</span></div>{needs&&<textarea disabled={locked} placeholder="Explicación obligatoria..." value={explanation[p.id]??rec?.notes??''} onChange={e=>setExplanation({...explanation,[p.id]:e.target.value})}/>}<div className="chips">{attendanceOptions.map(([value,label])=><button disabled={locked} key={value} className={current===value?'chip active':'chip'} onClick={()=>update(p.id,value)}>{label}</button>)}</div></Card>;})}
  </div>;
}

function EvaluationPage({session,players,evaluations,reload,setError}:any){
  const[index,setIndex]=useState(0);
  const[cardType,setCardType]=useState('none');
  const[cardReason,setCardReason]=useState('');
  const player=players[index];
  const ev=evaluations.find((e:Evaluation)=>e.player_id===player?.id);
  const counters=useMemo(()=>getHighCounts(evaluations),[evaluations]);
  if(!player)return <p>No hay jugadores para evaluar.</p>;
  async function ensureEval():Promise<Evaluation|null>{if(ev)return ev;const{data,error}=await supabase.from('evaluations').insert({session_id:session.id,player_id:player.id}).select('*').single();if(error){setError(error.message);return null;}await reload();return data as Evaluation;}
  async function update(field:string,value:number|string|boolean){setError('');const record=await ensureEval();if(!record)return;const{error}=await supabase.from('evaluations').update({[field]:value,submitted_at:new Date().toISOString()}).eq('id',record.id);if(error){setError(cleanDbError(error.message));return;}reload();}
  async function saveCardIfNeeded(){if(cardType==='none')return true;if(!cardReason.trim()){setError('Si marcas una tarjeta debes añadir el motivo.');return false;}const{error}=await supabase.from('cards').insert({session_id:session.id,player_id:player.id,type:cardType,reason:cardReason});if(error){setError(error.message);return false;}setCardType('none');setCardReason('');return true;}
  async function next(){const ok=await saveCardIfNeeded();if(!ok)return;await update('evaluated',true);setIndex(i=>Math.min(i+1,players.length-1));}
  const current:any=ev||{tactical_discipline:3,effort_commitment:3,decision_making:3,mentality_attitude:3,coachability:3,comment:''};
  const isMatch=['friendly_match','league_match','tryout','scrimmage'].includes(session.type);
  return <div className="stack"><div className="progress">{index+1} / {players.length}</div>
    <Card><div className="row"><div><p className="kicker">Jugador</p><h2>{player.display_name}</h2><p>{translatePosition(player.position)}</p></div><div className="score-badge">{current.total_score||'-'}</div></div></Card>
    {ratingFields.map(([field,label])=>{const reached=counters[field]>=session.high_rating_limit;return <Card key={field}><div className="row"><strong>{label}</strong><span className={reached?'limit danger':'limit'}>{counters[field]}/{session.high_rating_limit} altos</span></div><div className="rating">{[1,2,3,4,5].map(n=><button key={n} className={current[field]===n?'rate active':'rate'} onClick={()=>update(field,n)}>{n}</button>)}</div></Card>;})}
    {isMatch&&<Card><strong>Tarjetas</strong><select value={cardType} onChange={e=>setCardType(e.target.value)}>{cardOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{cardType!=='none'&&<textarea placeholder="Motivo de la tarjeta..." value={cardReason} onChange={e=>setCardReason(e.target.value)}/>}</Card>}
    <Card><strong>Comentario corto</strong><textarea defaultValue={current.comment||''} onBlur={e=>update('comment',e.target.value)} placeholder="Comentario corto..."/></Card>
    <button className="primary" onClick={next}>Siguiente jugador <ChevronRight size={18}/></button>
    <button className="secondary" disabled={index===0} onClick={()=>setIndex(i=>Math.max(0,i-1))}>Anterior</button>
  </div>;
}

function InjuryPage({session,players,reload,setError}:any){
  const[playerId,setPlayerId]=useState(players[0]?.id||'');
  const[injuryType,setInjuryType]=useState('');
  const[date,setDate]=useState(new Date().toISOString().slice(0,10));
  const[notes,setNotes]=useState('');
  const[injuries,setInjuries]=useState<any[]>([]);
  async function loadInjuries(){const{data}=await supabase.from('injuries').select('*,players(display_name)').order('start_date',{ascending:false});setInjuries(data||[]);}
  useEffect(()=>{loadInjuries();},[]);
  async function submit(e:React.FormEvent){e.preventDefault();const{error}=await supabase.from('injuries').insert({session_id:session.id,player_id:playerId,start_date:date,injury_type:injuryType,body_area:injuryType,status:'active',notes});if(error)setError(error.message);else{setInjuryType('');setNotes('');reload();loadInjuries();alert('Lesión registrada');}}
  async function closeInjury(injuryId:string){const{error}=await supabase.from('injuries').update({status:'recovered',end_date:new Date().toISOString().slice(0,10)}).eq('id',injuryId);if(error)setError(error.message);else{loadInjuries();alert('Alta registrada');}}
  const active=injuries.filter(i=>i.status!=='recovered');
  const recovered=injuries.filter(i=>i.status==='recovered');
  return <div className="stack"><form className="stack" onSubmit={submit}><PageTitle title="Lesiones" subtitle="Registra lesiones y marca altas cuando el jugador se recupere."/><Card><h3>Nueva lesión</h3><select value={playerId} onChange={e=>setPlayerId(e.target.value)}>{players.map((p:Player)=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select><input placeholder="Lesión / zona afectada" value={injuryType} onChange={e=>setInjuryType(e.target.value)} required/><input type="date" value={date} onChange={e=>setDate(e.target.value)} required/><textarea placeholder="Notas" value={notes} onChange={e=>setNotes(e.target.value)}/><button className="primary">Guardar lesión</button></Card></form>
    <Card><p className="kicker">Lesiones abiertas</p>{active.length===0&&<p>No hay lesiones abiertas.</p>}{active.map(i=><div className="injury-row" key={i.id}><div><strong>{i.players?.display_name||'Jugador'}</strong><p>{i.start_date} · {i.injury_type||i.body_area}</p></div><button className="chip active" onClick={()=>closeInjury(i.id)}>Dar alta</button></div>)}</Card>
    <Card><p className="kicker">Lesiones superadas</p>{recovered.length===0&&<p>No hay lesiones superadas.</p>}{recovered.slice(0,8).map(i=><p key={i.id}>{i.players?.display_name||'Jugador'} · {i.injury_type||i.body_area} · alta {i.end_date}</p>)}</Card>
  </div>;
}

function SummaryPage({session,players,evaluations,attendance,cardTotals}:any){
  const evaluated=evaluations.filter((e:Evaluation)=>e.evaluated);
  const byScore=[...evaluations].filter((e:Evaluation)=>e.total_score).sort((a,b)=>Number(b.total_score)-Number(a.total_score));
  const cardWarnings=(cardTotals||[]).filter((c:any)=>Number(c.yellow_cards)>=4);
  return <div className="stack"><PageTitle title="Resumen" subtitle={`Resumen rápido de ${session.name}.`}/>
    <Card><p className="kicker">Evaluaciones completadas</p><h2>{evaluated.length} / {players.length}</h2></Card>
    <Card><p className="kicker">Asistencia</p>{attendanceOptions.map(([value,label])=><p key={value}>{label}: {attendance.filter((a:Attendance)=>a.status===value).length}</p>)}</Card>
    <Card><p className="kicker">Top jugadores</p>{byScore.length===0&&<p>No hay evaluaciones todavía.</p>}{byScore.slice(0,5).map((e:Evaluation)=><p key={e.id}>{findName(players,e.player_id)} — {e.total_score}</p>)}</Card>
    <Card><p className="kicker">Conteo 4/5 por categoría</p>{ratingFields.map(([field,label])=><p key={field}>{label}: {evaluations.filter((e:any)=>Number(e[field])>=4).length}/{session.high_rating_limit}</p>)}</Card>
    <Card><p className="kicker">Alertas tarjetas</p>{cardWarnings.length===0&&<p>No hay jugadores cerca de suspensión.</p>}{cardWarnings.map((c:any)=><p key={c.player_id}>{c.display_name}: {c.yellow_cards} amarillas</p>)}</Card>
  </div>;
}

function HistoryPage(){
  const[sessions,setSessions]=useState<any[]>([]);
  const[selectedSessionId,setSelectedSessionId]=useState('');
  const[evaluations,setEvaluations]=useState<any[]>([]);
  const[attendance,setAttendance]=useState<any[]>([]);
  const[injuries,setInjuries]=useState<any[]>([]);
  async function loadSessions(){const{data}=await supabase.from('sessions').select('*').order('session_date',{ascending:false});setSessions(data||[]);setSelectedSessionId((data||[])[0]?.id||'');}
  async function loadHistory(sessionId:string){if(!sessionId)return;const ev=await supabase.from('evaluations').select('*,players(display_name)').eq('session_id',sessionId);const att=await supabase.from('attendance').select('*,players(display_name)').eq('session_id',sessionId);const inj=await supabase.from('injuries').select('*,players(display_name)').eq('session_id',sessionId);setEvaluations(ev.data||[]);setAttendance(att.data||[]);setInjuries(inj.data||[]);}
  useEffect(()=>{loadSessions();},[]);
  useEffect(()=>{if(selectedSessionId)loadHistory(selectedSessionId);},[selectedSessionId]);
  return <div className="stack"><PageTitle title="Histórico admin" subtitle="Revisa datos anteriores de sesiones, asistencia, evaluaciones y lesiones."/><select value={selectedSessionId} onChange={e=>setSelectedSessionId(e.target.value)}>{sessions.map(s=><option key={s.id} value={s.id}>{s.name} · {formatDate(s.session_date)}</option>)}</select><Card><p className="kicker">Evaluaciones</p>{evaluations.map(e=><p key={e.id}>{e.players?.display_name||'Jugador'} — {e.total_score}</p>)}</Card><Card><p className="kicker">Asistencia</p>{attendance.map(a=><p key={a.id}>{a.players?.display_name||'Jugador'} — {translateAttendance(a.status)}</p>)}</Card><Card><p className="kicker">Lesiones</p>{injuries.length===0&&<p>No hay lesiones registradas.</p>}{injuries.map(i=><p key={i.id}>{i.players?.display_name||'Jugador'} — {i.injury_type||i.body_area} · {translateInjuryStatus(i.status)}</p>)}</Card></div>;
}

function PageTitle({title,subtitle}:{title:string;subtitle:string}){return <div><h2>{title}</h2><p className="muted">{subtitle}</p></div>;}
function NavButton({active,onClick,icon,label}:any){return <button className={active?'nav active':'nav'} onClick={onClick}>{React.cloneElement(icon,{size:18})}<span>{label}</span></button>;}
function Action({label,onClick}:any){return <button className="action" onClick={onClick}><span>{label}</span><ChevronRight size={18}/></button>;}
function Card({children,className=''}:any){return <div className={`card ${className}`}>{children}</div>;}
function Screen({children}:any){return <div className="screen">{children}</div>;}
function getHighCounts(evaluations:Evaluation[]){const result:Record<string,number>={};ratingFields.forEach(([field])=>{result[field]=evaluations.filter((e:any)=>Number(e[field])>=4).length;});return result;}
function findName(players:Player[],id:string){return players.find(p=>p.id===id)?.display_name||'Jugador';}
function formatDate(date:string){return new Date(`${date}T00:00:00`).toLocaleDateString('es-ES',{day:'2-digit',month:'short'});}
function getStartTime(session:AppSession){return session.start_time||'';}
function buildSessionLabel(session:AppSession){const time=getStartTime(session);const opponent=session.opponent?` · vs ${session.opponent}`:'';return `${translateSessionType(session.type)} · ${formatDate(session.session_date)}${time?` · ${time}`:''}${opponent}`;}
function translatePosition(position?:string|null){const map:Record<string,string>={goalkeeper:'Portero',defender:'Defensa',midfielder:'Mediocentro',winger:'Extremo',forward:'Delantero'};return position?map[position]||position:'';}
function translateStatus(status?:string|null){const map:Record<string,string>={active:'Activo',injured:'Lesionado',inactive:'Baja',trial:'Prueba',guest:'Invitado'};return status?map[status]||status:'';}
function translateSessionType(type?:string|null){const map:Record<string,string>={training:'Entreno',league_match:'Partido liga',friendly_match:'Partido amistoso',tryout:'Tryout',scrimmage:'Scrimmage'};return type?map[type]||type:'';}
function translateAttendance(status?:string|null){const map:Record<string,string>={present:'Presente',late:'Tarde',justified_late:'Tarde justificado',justified_absence:'Ausencia justificada',unjustified_absence:'Ausencia injustificada',injured:'Lesionado'};return status?map[status]||status:'';}
function translateInjuryStatus(status?:string|null){const map:Record<string,string>={active:'Abierta',recovered:'Superada',pending_review:'Pendiente revisión',minor_discomfort:'Molestia leve'};return status?map[status]||status:'';}
function cleanDbError(message:string){if(message.includes('Maximum high ratings'))return 'Has llegado al máximo de jugadores con puntuación alta en esta categoría. Cambia una evaluación anterior para continuar.';if(message.includes('locked'))return 'Esta sesión está bloqueada. Solo un administrador puede editarla.';return message;}
createRoot(document.getElementById('root')!).render(<App/>);
