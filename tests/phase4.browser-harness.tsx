// Local component harness served only by the browser test's intercepted HTML.
// It is not imported by the application or included in the production build.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SummaryPage } from '../src/pages/SummaryPage';
import { AttendancePage } from '../src/pages/AttendancePage';
import { SessionsPage } from '../src/pages/SessionsPage';
import { EvaluationPage } from '../src/pages/EvaluationPage';
import { ReportsPage } from '../src/pages/ReportsPage';
import { IntelligencePage } from '../src/pages/IntelligencePage';
import { HomePage } from '../src/pages/HomePage';
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
  const evaluationProps=React.useMemo(()=>query.get('draft')==='new'?[]:sportEvaluations.filter(e=>e.session_id===sportSessions[0].id),[query.get('draft')]);
  if(query.get('mode')==='evaluation')return <>{error&&<p role="alert">{error}</p>}<EvaluationPage role="admin" session={sportSessions[0]} players={sportPlayers} evaluations={evaluationProps} reload={async()=>{}} setError={setError}/></>;
  if(query.get('mode')==='reports')return <ReportsPage/>;
  if(query.get('mode')==='intelligence')return <IntelligencePage/>;
  if(query.get('mode')==='home')return <HomePage role="admin" nextSession={sportSessions[0]} selectedSession={sportSessions[0]} players={sportPlayers} evaluations={sportEvaluations.filter(e=>e.session_id===sportSessions[0].id)} attendance={[]} cardTotals={[]} setTab={()=>{}}/>;
  if (query.get('mode') === 'sessions') return historyId ? <><button onClick={() => setHistoryId('')}>Volver a sesiones</button><SummaryPage initialSessionId={historyId}/></> : <>
    <p>Selección operativa: {selected?.name || 'ninguna'}</p>
    <SessionsPage role={(query.get('role') || 'admin') as Role} selectedSession={selected} setSelectedSession={setSelected} reload={async () => {}} onViewHistory={setHistoryId}/>
  </>;
  return query.get('mode') === 'editor' ? <>
    {error && <p role="alert">{error}</p>}
    <AttendancePage role="admin" session={{ ...sessions.find(s => s.id === sessionId)!, high_rating_limit: 6, callup_confirmed: true, attendance_confirmed: false }}
      players={players} attendance={attendance.filter(a => a.session_id === sessionId)} reload={async () => {}} setError={setError}/>
  </> : <SummaryPage/>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
