// Synthetic component entry. Never imported by the production application.
import React,{useEffect,useState} from 'react';
import {supabase} from '../src/supabase';
import {readPerformancePages} from '../src/lib/performance';
import {createRoot} from 'react-dom/client';
import '../src/styles.css';
import {ApplicationShell} from '../src/components/shell/ApplicationShell';
import {VeoProvider} from '../src/veo/VeoContext';
import {HomePage} from '../src/pages/HomePage';
import {PlayersPage} from '../src/pages/PlayersPage';
import {SessionsPage} from '../src/pages/SessionsPage';
import {CallupPage} from '../src/pages/CallupPage';
import {AttendancePage} from '../src/pages/AttendancePage';
import {EvaluationPage} from '../src/pages/EvaluationPage';
import {InjuriesPage} from '../src/pages/InjuriesPage';
import {SummaryPage} from '../src/pages/SummaryPage';
import {StandoutsPage} from '../src/pages/StandoutsPage';
import {HistoryPage} from '../src/pages/HistoryPage';
import {IntelligencePage} from '../src/pages/IntelligencePage';
import {ReportsPage} from '../src/pages/ReportsPage';
import {VeoModule} from '../src/pages/VeoModule';
import {LoginPage} from '../src/pages/LoginPage';
import {players,sessions,evaluations} from './final.fixture';
import type {Role} from '../src/types';
import type {AppSession,Tab} from '../src/utils/appTypes';
function Harness(){
  const q=new URLSearchParams(location.search),mode=q.get('mode')||'home',role=(q.get('role')||'admin') as Role;
  const interactive=q.has('interactive');
  function navigate(tab:Tab){if(interactive){const next=new URLSearchParams({interactive:'1',mode:tab,role});if(q.has('match'))next.set('match','1');location.search=next.toString();}}
  const [error,setError]=useState('');
  const [session,setSession]=useState<AppSession>({...sessions[0],type:q.has('match')?'league_match':sessions[0].type,callup_confirmed:mode!=='callup',attendance_confirmed:!['attendance','callup'].includes(mode),draft_defaults_version:q.has('unmarked')?null:1,
    high_rating_limit:q.has('high')?Number(q.get('high')):sessions[0].high_rating_limit,low_rating_limit:q.has('low')?Number(q.get('low')):sessions[0].low_rating_limit});
  const [demoEvaluations,setDemoEvaluations]=useState<any[]|null>(null);
  useEffect(()=>{
    if(!interactive||mode!=='evaluation')return;
    let cancelled=false;
    readPerformancePages<any>((a,b)=>supabase.from('evaluations').select('*').eq('session_id',session.id).order('id').range(a,b))
      .then(rows=>{if(!cancelled)setDemoEvaluations(rows);},failure=>{if(!cancelled)setError(String(failure));});
    return()=>{cancelled=true;};
  },[interactive,mode,session.id]);
  const reload=async()=>{};
  let node:React.ReactNode;
  const tab=(mode==='veo-import'?'veo':mode) as Tab;
  const titles:Record<string,string>={home:'Inicio',players:'Jugadores',sessions:'Sesiones',callup:'Convocatoria',attendance:'Asistencia',evaluation:'Evaluación',injuries:'Lesiones',summary:'Resumen',standouts:'Destacados',history:'Histórico',intelligence:'Seguimiento semanal',reports:'Informes',veo:'VEO Analytics','veo-import':'VEO Analytics'};
  switch(mode){
    case 'players':node=<PlayersPage role={role}/>;break;
    case 'sessions':node=<SessionsPage role={role} selectedSession={session} setSelectedSession={row=>{if(row)setSession(row)}} reload={reload}/>;break;
    case 'callup':node=<CallupPage role={role} session={session} reload={reload} setError={setError}/>;break;
    case 'attendance':node=<AttendancePage role={role} session={session} players={players} attendance={[]} reload={reload} setError={setError}/>;break;
    case 'evaluation':node=interactive&&demoEvaluations===null?<p>Cargando evaluaciones de la demo…</p>:<EvaluationPage role={role} session={session} players={players} evaluations={interactive?demoEvaluations!:q.has('new')?[]:evaluations.filter(e=>e.session_id===session.id)} reload={reload} setError={setError}/>;break;
    case 'injuries':node=<InjuriesPage role={role} session={session} players={players} reload={reload} setError={setError}/>;break;
    case 'summary':node=<SummaryPage/>;break;
    case 'standouts':node=<StandoutsPage role={role}/>;break;
    case 'history':node=<HistoryPage/>;break;
    case 'intelligence':node=role==='admin'?<IntelligencePage/>:<p>Solo administradores</p>;break;
    case 'reports':node=<ReportsPage/>;break;
    case 'veo':case 'veo-import':node=<VeoModule initialSection={mode==='veo-import'?'import':'dashboard'}/>;break;
    case 'login':return <LoginPage logoUrl="/logo.png"/>;
    default:node=<HomePage role={role} nextSession={session} selectedSession={session} players={players} attendance={[]} evaluations={evaluations} cardTotals={[]} setTab={()=>{}}/>;
  }
  return <VeoProvider role={role}><ApplicationShell role={role} title={titles[mode]} tab={tab} setTab={navigate} onLogout={()=>navigate('home')} error={error}>
    {interactive&&<div className="card" style={{background:'#fff6db'}}><strong>DEMO VISUAL · Datos ficticios</strong><p>Los guardados se simulan y se pierden al cerrar. Esta vista permite revisar el diseño; las pruebas reales de permisos y confirmaciones se realizan en la base de pruebas.</p>
      <label>Vista<select aria-label="Vista" value={mode==='veo-import'?'veo':mode} onChange={e=>navigate(e.target.value as Tab)}>{Object.entries(titles).filter(([key])=>key!=='veo-import').map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label>
      <label>Rol simulado<select aria-label="Rol simulado" value={role} onChange={e=>{location.search=new URLSearchParams({interactive:'1',mode,role:e.target.value}).toString();}}><option value="admin">Admin</option><option value="coach">Entrenador</option><option value="viewer">Consulta</option></select></label>
      <label>Tipo de sesión de la demo<select aria-label="Tipo de sesión de la demo" value={q.has('match')?'match':'training'} onChange={e=>{const next=new URLSearchParams({interactive:'1',mode,role});if(e.target.value==='match')next.set('match','1');location.search=next.toString();}}><option value="training">Entrenamiento</option><option value="match">Partido</option></select></label>
    </div>}{node}
  </ApplicationShell></VeoProvider>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
