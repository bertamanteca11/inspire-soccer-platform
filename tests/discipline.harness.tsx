import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {supabase} from '../src/supabase';
import {EvaluationPage} from '../src/pages/EvaluationPage';
import {HomePage} from '../src/pages/HomePage';
import {PlayersPage} from '../src/pages/PlayersPage';
import {VeoProvider} from '../src/veo/VeoContext';
import {ApplicationShell} from '../src/components/shell/ApplicationShell';
import type {Role} from '../src/types';
import type {Tab} from '../src/utils/appTypes';
import '../src/styles.css';
function Harness(){
  const [data,setData]=useState<any>(null),[mode,setMode]=useState<Tab>('evaluation'),[error,setError]=useState('');
  const role=(new URLSearchParams(location.search).get('role')||'coach') as Role;
  async function reload(){
    const result=await fetch('/discipline-test-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'bootstrap'})}).then(r=>r.json());
    setData(result.data);
  }
  useEffect(()=>{void reload();},[]);
  if(!data)return <p>Cargando base de pruebas…</p>;
  const titles:Record<string,string>={home:'Inicio',players:'Jugadores',evaluation:'Evaluación'};
  return <VeoProvider role={role}><ApplicationShell role={role} title={titles[mode]||'Prueba'} tab={mode} setTab={setMode} onLogout={()=>{}} error={error}>
    {mode==='home'?<HomePage role={role} nextSession={data.session} selectedSession={data.session} players={data.players} attendance={data.attendance} evaluations={data.evaluations} cardTotals={data.totals} setTab={setMode}/>
      :mode==='players'?<PlayersPage role={role}/>:<EvaluationPage role={role} session={data.session} players={data.players} evaluations={data.evaluations} reload={reload} setError={setError}/>}
  </ApplicationShell></VeoProvider>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
