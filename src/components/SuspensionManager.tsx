import {useEffect,useRef,useState} from 'react';
import {supabase} from '../supabase';
import {readPerformancePages} from '../lib/performance';
import {completeSuspension} from '../lib/discipline';
import {Card} from './ui';
import type {Role} from '../types';
import {workflowError} from '../utils/workflowErrors';

export function SuspensionManager({role,onChanged}:{role:Role;onChanged?:()=>void|Promise<void>}) {
  const [rows,setRows]=useState<any[]>([]),[balances,setBalances]=useState<any[]>([]);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[pending,setPending]=useState('');
  const [notice,setNotice]=useState('');
  const request=useRef(0),busy=useRef(false);
  async function load(){
    const generation=++request.current;setLoading(true);setError('');setRows([]);setBalances([]);
    try {
      const [suspensions,balance]=await Promise.all([
        readPerformancePages<any>((a,b)=>supabase.from('suspensions').select('*,players(display_name)').order('created_at',{ascending:false}).order('id').range(a,b)),
        supabase.rpc('batch4_discipline_balances'),
      ]);
      if(generation!==request.current)return;
      if(balance.error)throw new Error(workflowError(balance.error));
      if(!Array.isArray(balance.data))throw new Error('No se han podido verificar los contadores de tarjetas.');
      setRows(suspensions);setBalances(balance.data);
    }catch(failure){if(generation===request.current)setError(String(failure));}
    finally{if(generation===request.current)setLoading(false);}
  }
  useEffect(()=>{void load();return()=>{request.current++;};},[]);
  async function finish(row:any){
    if(role!=='admin'||busy.current||loading)return;
    const initialize=row.status==='served';
    if(!window.confirm(initialize?`¿Iniciar desde hoy una nueva cuenta para ${row.players?.display_name || 'este jugador'}? Las amarillas simples actuales pasarán al histórico de la cuenta anterior. Revisa esta decisión antes de continuar.`:`¿Marcar como cumplida la sanción de ${row.players?.display_name || 'este jugador'}?${row.source==='yellow_accumulation'?' Se iniciará una nueva cuenta de amarillas simples y se conservará el total histórico.':''}`))return;
    busy.current=true;setPending(row.id);setError('');setNotice('');
    try{await completeSuspension(row.id,initialize);setNotice(initialize?'Nueva cuenta de amarillas iniciada.':'Sanción marcada como cumplida.');await load();await onChanged?.();}
    catch(failure){setError(String(failure));}
    finally{busy.current=false;setPending('');}
  }
  const active=rows.filter(row=>row.status==='active');
  return <Card><h3>Sanciones y acumulación</h3>
    <p>Marca una sanción como cumplida cuando se hayan cumplido todos sus partidos. Las tarjetas y las sanciones anteriores se conservan.</p>
    {notice&&<p role="status" className="save-feedback success">{notice}</p>}
    {loading?<p role="status">Cargando sanciones…</p>:error?<><p role="alert">{error}</p><button onClick={()=>void load()} disabled={!!pending}>Reintentar sanciones</button></>:<>
      {!active.length&&<p>No hay sanciones activas.</p>}
      {active.map(row=><div key={row.id} className="stack suspension-management-row"><strong>{row.players?.display_name || 'Jugador'}</strong><span>{row.reason || 'Sanción'} · {Math.max(0,row.matches_total-row.matches_served)} partido(s) pendiente(s)</span>
        {role==='admin'&&<button className="secondary" disabled={!!pending} onClick={()=>void finish(row)}>{pending===row.id?'Guardando…':'Marcar como cumplida'}</button>}
      </div>)}
      <details><summary>Contadores e historial</summary><p>La acumulación usa amarillas simples desde la última sanción por acumulación cumplida. La doble amarilla mantiene su sanción propia. El total histórico incluye todas las tarjetas.</p>
        {balances.map(row=><p key={row.player_id}><strong>{row.display_name}:</strong> {row.needs_cycle_review?'Cuenta actual pendiente de revisar por sanciones antiguas cumplidas':`${row.cycle_yellows} amarillas simples en la cuenta actual`} · {row.historical_yellows} amarillas históricas (doble amarilla = 2) · {row.historical_reds} rojas históricas.</p>)}
        {rows.filter(row=>row.status!=='active').map(row=><div key={row.id}><p>{row.players?.display_name || 'Jugador'} · {row.reason || 'Sanción'} · {row.status==='served'?'Cumplida':'Cancelada'}{row.served_at?' · '+new Date(row.served_at).toLocaleDateString('es-ES',{timeZone:'Europe/Copenhagen'}):''}</p>
          {role==='admin'&&row.status==='served'&&row.source==='yellow_accumulation'&&balances.some(balance=>balance.player_id===row.player_id&&balance.needs_cycle_review)&&<button disabled={!!pending} onClick={()=>void finish(row)}>Iniciar cuenta nueva desde hoy</button>}
        </div>)}
      </details>
    </>}
  </Card>;
}
