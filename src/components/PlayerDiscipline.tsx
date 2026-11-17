import {useEffect,useState} from 'react';
import type {Role} from '../types';
import {loadDisciplineWorkspace,type DisciplineWorkspace} from '../lib/discipline';
import {cardKind,cardYellows,isDismissal,isPendingSanction,sanctionRemaining} from '../utils/discipline';
import {translateCard,formatDate} from '../utils/formatters';
import {DisciplineBalanceSummary} from './DisciplineManager';
import {SuspensionManager} from './SuspensionManager';
import {Modal} from './ui';

export function PlayerDiscipline({playerId,name,role,cards}:{playerId:string;name:string;role:Role;cards:any[]}) {
  const [data,setData]=useState<DisciplineWorkspace|null>(null),[error,setError]=useState(''),[open,setOpen]=useState(false),[revision,setRevision]=useState(0);
  useEffect(()=>{let cancelled=false;setData(null);setError('');loadDisciplineWorkspace(playerId).then(result=>{if(!cancelled)setData(result);},failure=>{if(!cancelled)setError(String(failure));});return()=>{cancelled=true;};},[playerId,revision]);
  const balance=data?.balances.find(b=>b.player_id===playerId);
  return <section className="profile-section"><strong>Tarjetas y sanciones</strong>
    {error&&<p role="alert">{error}</p>}
    {balance?<DisciplineBalanceSummary balance={balance}/>:<div className="card-summary"><span><b>{cards.reduce((n,c)=>n+cardYellows(c),0)}</b> amarillas históricas</span><span><b>{cards.filter(isDismissal).length}</b> expulsiones</span></div>}
    {data?.cases.filter(s=>isPendingSanction(s)||s.needs_review).map(s=><p className="tiny-warning" key={s.id}>{s.source==='yellow_accumulation'?'Acumulación':translateCard(s.source)} · {sanctionRemaining(s)}</p>)}
    {data&&(role==='admin'||role==='coach')&&<button type="button" className="secondary" onClick={()=>setOpen(true)}>Sanciones de {name}</button>}
    <details><summary>Historial de tarjetas ({cards.length})</summary>{cards.map(c=><p key={c.id}>
      <strong>{translateCard(cardKind(c))}</strong>{c.voided_at?' · Registro corregido, no computa':''}<br/>
      {c.sessions?.name||'Partido histórico'}{c.sessions?.session_date?' · '+formatDate(c.sessions.session_date):''}{c.reason?' · '+c.reason:''}
    </p>)}</details>
    {open&&<Modal title={`Sanciones de ${name}`} onClose={()=>setOpen(false)}><SuspensionManager role={role} playerId={playerId} onChanged={()=>setRevision(n=>n+1)}/></Modal>}
  </section>;
}
