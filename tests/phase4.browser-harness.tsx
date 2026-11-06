// Local component harness served only by the browser test's intercepted HTML.
// It is not imported by the application or included in the production build.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles.css';
import { SummaryPage } from '../src/pages/SummaryPage';
import { AttendancePage } from '../src/pages/AttendancePage';
import { SessionsPage } from '../src/pages/SessionsPage';
import { EvaluationPage } from '../src/pages/EvaluationPage';
import { ReportsPage } from '../src/pages/ReportsPage';
import { IntelligencePage } from '../src/pages/IntelligencePage';
import { HomePage } from '../src/pages/HomePage';
import { CallupPage } from '../src/pages/CallupPage';
import { ApplicationShell } from '../src/components/shell/ApplicationShell';
import { sportPlayers, sportSessions, sportEvaluations } from './evaluation.fixture';
import type { AppSession } from '../src/utils/appTypes';
import type { Role } from '../src/types';
import { attendance, players, intendedIds, sessions } from './phase4.fixture';

function Harness() {
  const query = new URLSearchParams(window.location.search);
  const sessionId = query.get('session') || intendedIds[0];
  const [error, setError] = React.useState('');
  const [selected, setSelected] = React.useState<AppSession | null>(null);
  const [historyId, setHistoryId] = React.useState('');
  const [navigation, setNavigation] = React.useState('');
  const [reviewAttendanceId, setReviewAttendanceId] = React.useState('');
  const role = (query.get('role') || 'admin') as Role;
  const contextSession = { ...sportSessions[0], name: query.has('long') ? 'Partido domingo con nombre de sesión extraordinariamente largo para revisión móvil' : sportSessions[0].name, opponent: "L'Hospitalense" };
  const wrap = (node: React.ReactNode, title: string, tab: import('../src/utils/appTypes').Tab) => query.has('shell') ? <ApplicationShell role={role} title={title} tab={tab} setTab={setNavigation} selectedSessionLabel={contextSession.name} onLogout={()=>{}}>
    <span hidden data-testid="preserved-session">{sportSessions[1].id}</span><span hidden data-testid="requested-destination">{navigation}</span>{node}
  </ApplicationShell> : node;
  const evaluationProps=React.useMemo(()=>query.get('draft')==='new'?[]:sportEvaluations.filter(e=>e.session_id===sportSessions[0].id),[query.get('draft')]);
  if(query.get('mode')==='evaluation')return wrap(<>{error&&<p role="alert">{error}</p>}<EvaluationPage role="admin" session={query.has('shell') ? contextSession : sportSessions[0]} players={sportPlayers} evaluations={evaluationProps} reload={async()=>{}} setError={setError}/></>,'Evaluación','evaluation');
  if(query.get('mode')==='reports')return <ReportsPage/>;
  if(query.get('mode')==='intelligence')return <IntelligencePage/>;
  if(query.get('mode')==='home')return wrap(<HomePage role={role} nextSession={query.has('shell') ? contextSession : sportSessions[0]} selectedSession={query.has('shell') ? sportSessions[1] : sportSessions[0]} players={sportPlayers} evaluations={sportEvaluations.filter(e=>e.session_id===sportSessions[0].id)} attendance={[]} cardTotals={query.has('alerts') ? Array.from({length:11},(_,i)=>({player_id:'card-'+i,display_name:'Card player '+i,yellow_cards:20-i,red_cards:0,total_cards:20-i})) : []} setTab={setNavigation}/>,'Inicio','home');
  if(query.get('mode')==='callup')return wrap(<CallupPage role={role} session={{...contextSession,callup_confirmed:!query.has('draft-callup')}} reload={async()=>{}} setError={setError}/>,'Convocatoria','callup');
  if(query.get('mode')==='attendance')return wrap(<AttendancePage role={role} session={contextSession} players={sportPlayers} attendance={[]} reload={async()=>{}} setError={setError}/>,'Asistencia','attendance');
  if (query.get('mode') === 'sessions') return historyId ? <><button onClick={() => setHistoryId('')}>Volver a sesiones</button><SummaryPage initialSessionId={historyId}/></> : <>
    <p>Selección operativa: {selected?.name || 'ninguna'}</p>
    <SessionsPage role={(query.get('role') || 'admin') as Role} selectedSession={selected} setSelectedSession={setSelected} reload={async () => {}} onViewHistory={setHistoryId}/>
  </>;
  return query.get('mode') === 'editor' || reviewAttendanceId ? <>
    {error && <p role="alert">{error}</p>}
    <AttendancePage role="admin" session={{ ...sessions.find(s => s.id === (reviewAttendanceId||sessionId))!, high_rating_limit: 6, callup_confirmed: true, attendance_confirmed: !!reviewAttendanceId }}
      players={players} attendance={attendance.filter(a => a.session_id === (reviewAttendanceId||sessionId))} reload={async () => {}} setError={setError}/>
  </> : <SummaryPage onReviewAttendance={role==='admin'?setReviewAttendanceId:undefined}/>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
