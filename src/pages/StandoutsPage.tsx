import { useEffect, useMemo, useRef, useState } from 'react';
import { loadAllSessions } from '../lib/data';
import { isCompletedSportingSession, distinctRows } from '../utils/evaluationEligibility';
import { Award, TrendingDown, Save } from 'lucide-react';
import { supabase } from '../supabase';
import { Card, PageTitle } from '../components/ui';
import type { AppSession } from '../utils/appTypes';
import type { Player, Role } from '../types';
import { formatDate } from '../utils/formatters';

type StandoutSession = AppSession & { records_only_confirmed?: boolean | null };
type Slot = 'top_1'|'top_2'|'bottom_1'|'bottom_2';
type Picks = Record<Slot, string>;
const emptyPicks: Picks = { top_1:'', top_2:'', bottom_1:'', bottom_2:'' };

export function StandoutsPage({ role }: { role: Role }) {
  const [sessions,setSessions]=useState<StandoutSession[]>([]);
  const [sessionId,setSessionId]=useState('');
  const [players,setPlayers]=useState<Player[]>([]);
  const [picks,setPicks]=useState<Picks>(emptyPicks);
  const [notes,setNotes]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [sessionLoading,setSessionLoading]=useState(false);
  const sessionRequest=useRef(0);
  const canEdit=role==='admin';

  useEffect(()=>{ loadSessions(); },[]);
  useEffect(()=>{ if(sessionId) void loadSession(sessionId);return()=>{sessionRequest.current++}; },[sessionId]);

  async function loadSessions(){
    setLoading(true);
    try {
      const rows=(await loadAllSessions()).filter(isCompletedSportingSession);
      setSessions(rows); setSessionId(rows[0]?.id || '');
    } catch(failure){setSessions([]);setSessionId('');setMessage(String(failure));}
    setLoading(false);
  }
  async function loadSession(id:string){
    const request=++sessionRequest.current;setSessionLoading(true);setMessage('');setPlayers([]);setPicks({...emptyPicks});
    const [callups,standouts]=await Promise.all([
      supabase.from('callups').select('player_id,status,players(*)').eq('session_id',id).neq('status','not_called').order('created_at'),
      supabase.from('session_standouts').select('*').eq('session_id',id)
    ]);
    if(request!==sessionRequest.current)return;
    setSessionLoading(false);
    if(callups.error || standouts.error){setMessage(callups.error?.message||standouts.error?.message||'Error de lectura');setPlayers([]);setPicks({...emptyPicks});return;}
    const ps=((callups.data||[]) as any[]).map(r=>r.players).filter(Boolean) as Player[];
    setPlayers(ps);
    const next={...emptyPicks}; let sessionNotes='';
    const stored=distinctRows((standouts.data||[]) as any[]);
    if(stored.some(row=>stored.filter(other=>other.player_id===row.player_id || other.category===row.category&&other.rank===row.rank).length>1)){
      setMessage('Destacados duplicados: revisar los registros originales antes de editar.');setPlayers([]);setPicks({...emptyPicks});return;
    }
    for(const row of stored){
      if(row.category==='top' && row.rank===1) next.top_1=row.player_id;
      if(row.category==='top' && row.rank===2) next.top_2=row.player_id;
      if(row.category==='bottom' && row.rank===1) next.bottom_1=row.player_id;
      if(row.category==='bottom' && row.rank===2) next.bottom_2=row.player_id;
      if(row.notes) sessionNotes=row.notes;
    }
    setPicks(next); setNotes(sessionNotes);
  }
  const selectedIds=useMemo(()=>Object.values(picks).filter(Boolean),[picks]);
  function setPick(slot:Slot,value:string){
    if(value && selectedIds.includes(value) && picks[slot]!==value){ setMessage('Cada jugador solo puede ocupar un puesto por sesión.'); return; }
    setMessage(''); setPicks(prev=>({...prev,[slot]:value}));
  }
  async function save(){
    if(!canEdit || sessionLoading) return;
    if(sessions.find(s=>s.id===sessionId)?.records_only_confirmed === true){
      setMessage('Esta sesión es Solo registros: no se pueden guardar Top/Bottom.');
      return;
    }
    const values=Object.values(picks);
    if(values.some(id=>id&&!players.some(p=>p.id===id))){setMessage('Revisa las identidades de los destacados antes de guardar.');return;}
    if(values.some(v=>!v)){ setMessage('Selecciona los 2 top performers y los 2 bottom performers.'); return; }
    if(new Set(values).size!==4){ setMessage('Selecciona cuatro jugadores diferentes.'); return; }
    setSaving(true); setMessage('');
    const rows=[
      {session_id:sessionId,player_id:picks.top_1,category:'top',rank:1,notes:notes||null},
      {session_id:sessionId,player_id:picks.top_2,category:'top',rank:2,notes:null},
      {session_id:sessionId,player_id:picks.bottom_1,category:'bottom',rank:1,notes:null},
      {session_id:sessionId,player_id:picks.bottom_2,category:'bottom',rank:2,notes:null},
    ];
    const del=await supabase.from('session_standouts').delete().eq('session_id',sessionId);
    if(del.error){setMessage(del.error.message);setSaving(false);return;}
    const ins=await supabase.from('session_standouts').insert(rows);
    setMessage(ins.error?ins.error.message:'Standouts guardados correctamente.'); setSaving(false);
  }
  const current=sessions.find(s=>s.id===sessionId);
  const readOnly = !canEdit || sessionLoading || current?.records_only_confirmed === true;
  const playerName=(id:string)=>players.find(p=>p.id===id)?.display_name||'—';
  if(loading) return <Card><p>Cargando sesiones...</p></Card>;
  return <div className="stack">
    <PageTitle title="Session Standouts" subtitle="Selección subjetiva del staff después de cada entreno o partido." />
    <p>Estos puestos son elecciones subjetivas del staff, no medias calculadas. Las ausencias y la elegibilidad numérica se verifican por separado; solo las sesiones completadas y reales contribuyen al seguimiento operativo.</p>
    <select value={sessionId} onChange={e=>setSessionId(e.target.value)}>{sessions.map(s=><option key={s.id} value={s.id}>{s.name} · {formatDate(s.session_date)}</option>)}</select>
    {current && <Card className="standout-session"><p className="kicker">Sesión seleccionada</p><h2>{current.name}</h2><p>{formatDate(current.session_date)} · {current.type==='training'?'Entrenamiento':'Partido / sesión'}</p></Card>}
    {current?.records_only_confirmed === true && <Card><p>Esta sesión está confirmada como «Solo registros». No se pueden editar ni guardar Top/Bottom.</p></Card>}
    <Card>
      <div className="standout-heading top"><Award size={22}/><div><h3>Top 2 performers</h3><p>Los dos jugadores que más destacaron.</p></div></div>
      <StandoutSelect label="1 · Top performer" value={picks.top_1} players={players} disabled={readOnly} onChange={(v:string)=>setPick('top_1',v)}/>
      <StandoutSelect label="2 · Top performer" value={picks.top_2} players={players} disabled={readOnly} onChange={(v:string)=>setPick('top_2',v)}/>
    </Card>
    <Card>
      <div className="standout-heading bottom"><TrendingDown size={22}/><div><h3>Bottom 2 performers</h3><p>Jugadores que necesitan más seguimiento tras esta sesión.</p></div></div>
      <StandoutSelect label="1 · Follow-up" value={picks.bottom_1} players={players} disabled={readOnly} onChange={(v:string)=>setPick('bottom_1',v)}/>
      <StandoutSelect label="2 · Follow-up" value={picks.bottom_2} players={players} disabled={readOnly} onChange={(v:string)=>setPick('bottom_2',v)}/>
    </Card>
    <Card><label>Notas del staff<textarea rows={4} value={notes} disabled={readOnly} onChange={e=>setNotes(e.target.value)} placeholder="Contexto de la sesión, decisiones subjetivas, aspectos a revisar..." /></label></Card>
    {message && <p className={message.includes('correctamente')?'success':'error'}>{message}</p>}
    {canEdit && <button className="primary standout-save" disabled={saving||!sessionId||readOnly} onClick={save}><Save size={18}/>{saving?'Guardando...':'Guardar standouts'}</button>}
    {!canEdit && <Card><p><strong>Top:</strong> {playerName(picks.top_1)} · {playerName(picks.top_2)}</p><p><strong>Follow-up:</strong> {playerName(picks.bottom_1)} · {playerName(picks.bottom_2)}</p></Card>}
  </div>;
}
function StandoutSelect({label,value,players,onChange,disabled}:any){return <label className="standout-select"><span>{label}</span><select value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}><option value="">Seleccionar jugador</option>{players.map((p:Player)=><option key={p.id} value={p.id}>{p.display_name}{p.shirt_number?` · #${p.shirt_number}`:''}</option>)}</select></label>}
