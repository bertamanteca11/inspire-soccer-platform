import { useEffect, useRef, useState } from 'react';
import { readPerformancePages } from '../lib/performance';
import { copenhagenToday } from '../utils/copenhagenDates';
import { supabase } from '../supabase';
import type { Player, Role } from '../types';
import type { AppSession } from '../utils/appTypes';
import { translateInjuryStatus } from '../utils/formatters';
import { Card, Modal, PageTitle } from '../components/ui';

export function InjuriesPage({ session, players, reload, setError, role }: { session: AppSession; players: Player[]; reload: any; setError: any; role: Role; }) {
  const [playerId, setPlayerId] = useState(players[0]?.id || ''); const [injuryType, setInjuryType] = useState(''); const [date, setDate] = useState(copenhagenToday()); const [notes, setNotes] = useState(''); const [injuries, setInjuries] = useState<any[]>([]); const [selectedInjury, setSelectedInjury] = useState<any | null>(null); const isAdmin = role === 'admin';
  const [saving,setSaving]=useState(false),[message,setMessage]=useState(''),[loading,setLoading]=useState(true),[readError,setReadError]=useState('');
  const pending=useRef(false),request=useRef(0);
  const canEdit=role==='admin'||role==='coach';
  async function loadInjuries() {
    const version=++request.current;setLoading(true);setReadError('');
    try { const data=await readPerformancePages<any>((a,b)=>supabase.from('injuries').select('*, players(display_name)').order('id').range(a,b)); if(version===request.current)setInjuries(data.sort((a,b)=>String(b.start_date).localeCompare(String(a.start_date)))); }
    catch(error){if(version===request.current){setInjuries([]);setReadError('No se pudo verificar el historial: '+String(error));setError(String(error))}}
    finally{if(version===request.current)setLoading(false)}
  }
  useEffect(() => { void loadInjuries();return()=>{request.current++}; }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();if(!canEdit||pending.current||loading||readError||!players.some(p=>p.id===playerId))return;
    pending.current=true;setSaving(true);setMessage('');
    try { const {data,error}=await supabase.from('injuries').insert({session_id:session.id,player_id:playerId,start_date:date,injury_type:injuryType,body_area:injuryType,status:'active',notes}).select('id').single();
      if(error||!data?.id)throw new Error(error?.message||'No se verificó la lesión guardada.');
      setInjuryType('');setNotes('');await loadInjuries();await reload(session.id);setMessage('Lesión guardada correctamente.');
    } catch(error){setError(String(error));setMessage('No se pudo verificar el guardado: '+String(error))}
    finally{pending.current=false;setSaving(false)}
  }
  async function updateInjury(payload: any) {
    if(!canEdit||!selectedInjury||pending.current||payload.status==='active'&&!isAdmin)return;
    pending.current=true;setSaving(true);setMessage('');
    try { const {data,error}=await supabase.from('injuries').update(payload).eq('id',selectedInjury.id).eq('status',selectedInjury.status).select('id').single();
      if(error||data?.id!==selectedInjury.id)throw new Error(error?.message||'La lesión ha cambiado o no tienes permisos. Recarga antes de reintentar.');
      setSelectedInjury(null);await loadInjuries();setMessage('Lesión actualizada correctamente.');
    } catch(error){setError(String(error));setMessage('No se pudo verificar el cambio: '+String(error))}
    finally{pending.current=false;setSaving(false)}
  }
  const active = injuries.filter(i => i.status !== 'recovered'); const recovered = injuries.filter(i => i.status === 'recovered');
  return <div className="stack"><PageTitle title="Lesiones" subtitle="Registra lesiones, revisa fichas y marca altas." />{loading&&<p role="status">Cargando lesiones…</p>}{readError&&<p role="alert">{readError}</p>}{message&&<p role="status">{message}</p>}{canEdit&&<form className="stack" onSubmit={submit}><fieldset className="form-fields stack" disabled={saving||loading||!!readError}><Card><h3>Nueva lesión</h3><select aria-label="Jugador de la lesión" required value={playerId} onChange={e => setPlayerId(e.target.value)}>{players.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select><input aria-label="Lesión / zona afectada" placeholder="Lesión / zona afectada" value={injuryType} onChange={e => setInjuryType(e.target.value)} required /><input aria-label="Fecha de inicio de la lesión" type="date" value={date} onChange={e => setDate(e.target.value)} required /><textarea aria-label="Notas de la lesión" placeholder="Notas" value={notes} onChange={e => setNotes(e.target.value)} /><button className="primary">Guardar lesión</button></Card></fieldset></form>}<Card><p className="kicker">Lesiones abiertas</p>{active.length === 0 && <p>No hay lesiones abiertas.</p>}{active.map(i => <InjuryRow key={i.id} injury={i} onClick={() => setSelectedInjury(i)} />)}</Card><Card><p className="kicker">Lesiones superadas</p>{recovered.length === 0 && <p>No hay lesiones superadas.</p>}{recovered.map(i => <InjuryRow key={i.id} injury={i} onClick={() => setSelectedInjury(i)} />)}</Card>{selectedInjury && <Modal title="Ficha lesión" onClose={() => {if(!saving)setSelectedInjury(null)}}><div className="stack"><p><strong>{selectedInjury.players?.display_name || 'Jugador'}</strong></p><p>{selectedInjury.start_date} · {selectedInjury.injury_type || selectedInjury.body_area}</p><textarea aria-label="Comentario de la lesión" disabled={!canEdit||saving} value={selectedInjury.notes || ''} onChange={e => setSelectedInjury({ ...selectedInjury, notes: e.target.value })} /><button disabled={!canEdit||saving} className="primary" onClick={() => updateInjury({ notes: selectedInjury.notes || '' })}>Guardar comentario</button><button disabled={!canEdit||saving} className="secondary" onClick={() => updateInjury({ status: 'recovered', end_date: copenhagenToday() })}>Dar alta</button>{isAdmin && <button disabled={saving} className="secondary danger" onClick={() => updateInjury({ status: 'active', end_date: null })}>Reabrir lesión</button>}</div></Modal>}</div>;
}
function InjuryRow({ injury, onClick }: any) { return <button className="injury-row clickable" onClick={onClick}><div><strong>{injury.players?.display_name || 'Jugador'}</strong><p>{injury.start_date} · {injury.injury_type || injury.body_area} · {translateInjuryStatus(injury.status)}</p></div><span>›</span></button>; }
