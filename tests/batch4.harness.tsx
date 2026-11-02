import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CallupPage } from '../src/pages/CallupPage';
import { AttendancePage } from '../src/pages/AttendancePage';
import { SessionsPage } from '../src/pages/SessionsPage';
import type { AppSession } from '../src/utils/appTypes';
import '../src/styles.css';
const q = new URLSearchParams(location.search);
function Harness() {
  const [error,setError] = useState('');
  const [visible,setVisible] = useState(true);
  const [session,setSession] = useState<AppSession>({id:'s',name:'Synthetic session',session_date:'2026-11-02',type:'training',status:'planned',high_rating_limit:6,callup_confirmed:q.get('mode') !== 'callup',attendance_confirmed:false,draft_defaults_version:q.has('historical')?null:1});
  const role = q.has('coach') ? 'coach' : 'admin';
  const reload = async () => {
    const {supabase} = await import('../src/supabase');
    const result = await supabase.from('sessions').select('*').eq('id','s').single();
    if (result.data) setSession(result.data);
  };
  if (q.get('mode') === 'sessions') return <SessionsPage role={role} selectedSession={null} setSelectedSession={()=>{}} reload={async()=>{}}/>;
  return <><button onClick={()=>setVisible(!visible)}>Toggle page</button><p role="alert">{error}</p>{visible && (q.get('mode') === 'callup'
    ? <CallupPage role={role} session={session} reload={reload} setError={setError}/>
    : <AttendancePage role={role} session={session} players={[]} attendance={[]} reload={reload} setError={setError}/>)}</>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
