import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Card } from '../components/ui';
import { readStaffWorkspace, staffAction, type StaffWorkspace } from './api';

export function StaffDirectory({ onBusyChange, onLegacyRoster }: { onBusyChange: (busy: boolean) => void; onLegacyRoster: () => void }) {
  const [directory,setDirectory] = useState<StaffWorkspace | null>(null);
  const [loading,setLoading] = useState(true), [busy,setBusy] = useState(false);
  const [error,setError] = useState(''), [notice,setNotice] = useState(''), [attempt,setAttempt] = useState(0);
  const [needsUpgrade,setNeedsUpgrade] = useState(false);
  const [form,setForm] = useState({name:'',job:''});
  const pending = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setNeedsUpgrade(false); setDirectory(null);
    readStaffWorkspace(null).then(data => { if (!cancelled) { setDirectory(data); setLoading(false); } },failure => {
      if (!cancelled) {
        const upgrade = /sesión no encontrada|session not found/i.test(failure.message || '');
        setNeedsUpgrade(upgrade);
        setError(upgrade ? 'La gestión de miembros sin sesión está pendiente de activar. Mientras tanto, puedes añadir miembros desde una sesión.' : failure.message);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  },[attempt]);
  async function act(action: 'add_member' | 'member_active', payload: Record<string,unknown>) {
    if (!directory || directory.session_id !== null || pending.current || loading) return false;
    pending.current = true; setBusy(true); onBusyChange(true); setError(''); setNotice('');
    try {
      setDirectory(await staffAction(directory,action,payload));
      setNotice(action === 'add_member' ? 'Miembro añadido a la lista general del staff.' : 'Estado del miembro actualizado.');
      return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); return false; }
    finally { pending.current = false; setBusy(false); onBusyChange(false); }
  }
  return <div className="stack">
    <Card><h2>Miembros del equipo técnico</h2><p>Esta es la lista general del staff. Puedes añadir o activar miembros sin seleccionar una sesión.</p>
      <p className="muted">Para registrar su convocatoria, asistencia o tarjetas, entra en el apartado correspondiente y elige la sesión.</p>
      <button className="chip" disabled={busy || loading} onClick={() => { setNotice(''); setAttempt(n=>n+1); }}>Actualizar miembros</button>
    </Card>
    {error && <Card><p className="error" role="alert">{error}</p>{needsUpgrade && <button className="secondary" onClick={onLegacyRoster}>Gestionar miembros desde una sesión</button>}</Card>}
    {notice && <p className="success" role="status">{notice}</p>}
    {loading ? <Card><p role="status">Cargando miembros…</p></Card> : directory && <>
      <Card><h3>Lista del staff</h3>{!directory.members.length && <p>Todavía no hay miembros. Añade el primero en el formulario.</p>}
        {directory.members.map(member => <div className="staff-person" key={member.id}>
          <div><strong>{member.name}</strong><p className="muted">{member.job || 'Equipo técnico'} · {member.active ? 'Activo' : 'Inactivo'}</p></div>
          <button className="chip" disabled={busy} onClick={() => void act('member_active',{staff_id:member.id,active:!member.active})}>{member.active ? 'Desactivar' : 'Activar'}</button>
        </div>)}
      </Card>
      <Card><form className="stack" onSubmit={async event => { event.preventDefault(); if (await act('add_member',form)) setForm({name:'',job:''}); }}>
        <h3>Añadir miembro</h3>
        <label>Nombre del miembro<input required maxLength={120} value={form.name} disabled={busy} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label>Función en el equipo<input maxLength={120} placeholder="Entrenador, fisio…" value={form.job} disabled={busy} onChange={e=>setForm({...form,job:e.target.value})}/></label>
        <button className="primary" disabled={busy}><Plus size={16}/>Añadir miembro</button>
      </form></Card>
    </>}
  </div>;
}
