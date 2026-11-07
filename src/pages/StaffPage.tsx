import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, Plus, ShieldAlert } from 'lucide-react';
import { Card, Modal, PageTitle } from '../components/ui';
import { loadAllSessions } from '../lib/data';
import { readStaffWorkspace, staffAction, type StaffWorkspace } from '../staff/api';
import { StaffDirectory } from '../staff/StaffDirectory';
import type { AppSession } from '../utils/appTypes';
import { buildSessionLabel, translateAttendance, translateCard } from '../utils/formatters';
import '../styles/private-staff.css';

const callupOptions = [['called_up','Convocado'],['not_called','No convocado'],['injured','Lesionado'],['doubt','Duda']];
const attendanceOptions = ['present','late','justified_late','justified_absence','unjustified_absence','injured','injured_present','injured_justified_absence','injured_unjustified_absence'];
type Section = 'callup' | 'attendance' | 'cards' | 'roster' | 'legacy-roster';

export function StaffPage({ canAccess, initialSessionId }: { canAccess: boolean; initialSessionId?: string }) {
  const [sessions, setSessions] = useState<AppSession[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [workspace, setWorkspace] = useState<StaffWorkspace | null>(null);
  const [section, setSection] = useState<Section>('roster');
  const isDirectory = section === 'roster';
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [callups, setCallups] = useState<Record<string,string>>({});
  const [attendance, setAttendance] = useState<Record<string,{status:string;notes:string}>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [memberForm, setMemberForm] = useState({name:'',job:''});
  const [cardForm, setCardForm] = useState({staff_id:'',type:'yellow',reason:'',matches:'1'});
  const [serveId, setServeId] = useState('');
  const mutating = useRef(false);

  useEffect(() => {
    if (!canAccess) { setSessions([]); setWorkspace(null); setLoading(false); return; }
    if (isDirectory) return;
    let cancelled = false;
    setLoading(true); setError('');
    loadAllSessions().then(rows => {
      if (cancelled) return;
      setSessions(rows);
      setSessionId(current => rows.some(s => s.id === current) ? current : rows.some(s => s.id === initialSessionId) ? initialSessionId! : rows.find(s => ['planned','completed'].includes(s.status))?.id || rows[0]?.id || '');
      if (!rows.length) setLoading(false);
    }).catch(failure => { if (!cancelled) { setError(String(failure)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [canAccess, initialSessionId, isDirectory]);
  useEffect(() => {
    if (!canAccess || !sessionId || isDirectory) return;
    let cancelled = false;
    setWorkspace(null); setLoading(true); setError(''); setNotice(''); setAcknowledged(false); setServeId('');
    setCardForm({staff_id:'',type:'yellow',reason:'',matches:'1'});
    readStaffWorkspace(sessionId).then(data => { if (!cancelled) { setWorkspace(data); setLoading(false); } })
      .catch(failure => { if (!cancelled) { setError(failure.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [canAccess, sessionId, refresh, isDirectory]);
  useEffect(() => {
    setCallups(Object.fromEntries(workspace?.callups.map(c => [c.staff_id,c.status]) || []));
    const initial = Object.fromEntries(workspace?.attendance.map(a => [a.staff_id,{status:a.status,notes:a.notes || ''}]) || []);
    const currentSession = sessions.find(s => s.id === workspace?.session_id);
    if (workspace?.workflow.callup_confirmed && !workspace.workflow.attendance_confirmed && currentSession && ['planned','completed'].includes(currentSession.status)) {
      for (const callup of workspace.callups) {
        if (callup.status === 'called_up' && !initial[callup.staff_id]) initial[callup.staff_id] = {status:'present',notes:''};
      }
    }
    setAttendance(initial);
    setAcknowledged(false);
  }, [workspace, sessions]);

  if (!canAccess) return <Card><p role="alert">Esta sección es privada para los perfiles Admin.</p></Card>;
  const session = sessions.find(s => s.id === sessionId);
  const readOnly = !session || !['planned','completed'].includes(session.status);
  const members = workspace?.members || [];
  const roster = members.filter(m => m.active || workspace?.callups.some(c => c.staff_id === m.id) || workspace?.attendance.some(a => a.staff_id === m.id));
  const called = roster.filter(m => workspace?.callups.some(c => c.staff_id === m.id && c.status === 'called_up'));
  const visits = roster.filter(m => called.some(c => c.id === m.id) || workspace?.attendance.some(a => a.staff_id === m.id));
  const activeSanctions = workspace?.suspensions.filter(s => !s.served_at) || [];
  const callupWarnings = session && ['league_match','friendly_match','scrimmage'].includes(session.type)
    ? roster.filter(m => callups[m.id] === 'called_up' && activeSanctions.some(s => s.staff_id === m.id)) : [];
  const callupLocked = busy || readOnly || !!workspace?.workflow.callup_confirmed;
  const attendanceLocked = busy || readOnly || !workspace?.workflow.callup_confirmed || !!workspace?.workflow.attendance_confirmed;
  const memberName = (id: string) => members.find(m => m.id === id)?.name || 'Miembro del staff';

  async function act(action: string, payload: Record<string,unknown>, message: string) {
    if (!canAccess || !workspace || workspace.session_id !== sessionId || mutating.current || readOnly) return false;
    mutating.current = true; setBusy(true); setError(''); setNotice('');
    try { setWorkspace(await staffAction(workspace,action,payload)); setNotice(message); return true; }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); return false; }
    finally { mutating.current = false; setBusy(false); }
  }
  async function saveCallup(confirm: boolean) {
    if (!roster.length || roster.some(m => !callups[m.id])) { setError('Selecciona la convocatoria de cada miembro del staff.'); return; }
    if (confirm && callupWarnings.length && !acknowledged) { setError('Revisa el aviso de sanciones antes de confirmar.'); return; }
    await act(confirm ? 'confirm_callup' : 'save_callup',{rows:roster.map(m => ({staff_id:m.id,status:callups[m.id]})),acknowledge_sanctions:acknowledged},confirm ? 'Convocatoria del staff confirmada.' : 'Convocatoria del staff guardada.');
  }
  async function saveAttendance(confirm: boolean) {
    if (!visits.length || visits.some(m => !attendance[m.id]?.status || attendance[m.id].status !== 'present' && !attendance[m.id].notes.trim())) { setError('Revisa la asistencia de cada miembro y explica los retrasos o ausencias.'); return; }
    await act(confirm ? 'confirm_attendance' : 'save_attendance',{rows:visits.map(m => ({staff_id:m.id,...attendance[m.id]}))},confirm ? 'Asistencia del staff confirmada.' : 'Asistencia del staff guardada.');
  }
  return <div className="stack private-staff-page">
    <PageTitle title="Staff" subtitle="Miembros del equipo técnico y gestión por sesión."/>
    <div className="staff-privacy"><LockKeyhole size={16}/><span>Privado · Administración</span></div>
    <div className="staff-tabs" role="group" aria-label="Apartados del staff">{([['roster','Miembros'],['callup','Convocatoria'],['attendance','Asistencia'],['cards','Tarjetas']] as const).map(([value,label]) => <button key={value} aria-pressed={section===value || value==='roster' && section==='legacy-roster'} disabled={busy} onClick={() => setSection(value)}>{label}</button>)}</div>
    {isDirectory ? <StaffDirectory onBusyChange={setBusy} onLegacyRoster={() => setSection('legacy-roster')}/> : <>
    <div className="staff-session-picker"><label>Sesión del staff<select value={sessionId} disabled={busy || !sessions.length} onChange={e => setSessionId(e.target.value)}>{sessions.map(s => <option key={s.id} value={s.id}>{s.name} · {buildSessionLabel(s)}{!['planned','completed'].includes(s.status) ? ' · Solo consulta' : ''}</option>)}</select></label><button className="chip" disabled={busy || loading} onClick={() => setRefresh(n => n+1)}>Actualizar staff</button></div>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="success" role="status">{notice}</p>}
    {loading ? <Card><p role="status">Cargando staff…</p></Card> : !sessions.length ? <Card><p>Para registrar convocatoria, asistencia o tarjetas, crea primero una sesión. La lista de miembros está disponible en Miembros.</p></Card> : workspace && <>
      {readOnly && <p className="muted">Sesión de solo consulta.</p>}
      {!members.length && <Card><p>Añade primero los miembros del equipo técnico.</p><button className="secondary" onClick={() => setSection('roster')}>Añadir miembros</button></Card>}
      {section==='legacy-roster' && <>
        <Card><h3>Miembros del staff</h3>{members.map(m => <div className="staff-person" key={m.id}><div><strong>{m.name}</strong><p className="muted">{m.job || 'Equipo técnico'} · {m.active ? 'Activo' : 'Inactivo'}</p></div><button className="chip" disabled={busy || readOnly} onClick={() => void act('member_active',{staff_id:m.id,active:!m.active},'Estado del miembro actualizado.')}>{m.active ? 'Desactivar' : 'Activar'}</button></div>)}</Card>
        <Card><form className="stack" onSubmit={async e => { e.preventDefault(); if (await act('add_member',memberForm,'Miembro añadido al staff.')) setMemberForm({name:'',job:''}); }}><h3>Añadir miembro</h3><label>Nombre del miembro<input required maxLength={120} value={memberForm.name} disabled={busy || readOnly} onChange={e => setMemberForm({...memberForm,name:e.target.value})}/></label><label>Función en el equipo<input maxLength={120} value={memberForm.job} disabled={busy || readOnly} onChange={e => setMemberForm({...memberForm,job:e.target.value})} placeholder="Entrenador, fisio…"/></label><button className="primary" disabled={busy || readOnly}><Plus size={16}/>Añadir miembro</button></form></Card>
      </>}
      {section==='callup' && !!roster.length && <Card><div className="staff-section-heading"><h3>Convocatoria del staff</h3><span>{workspace.workflow.callup_confirmed ? 'Confirmada' : 'Borrador'}</span></div>
        {roster.map(m => <label className="staff-person" key={m.id}><span><strong>{m.name}</strong><small>{m.job}</small></span><select aria-label={`Convocatoria de ${m.name}`} value={callups[m.id] || ''} disabled={callupLocked} onChange={e => { setCallups({...callups,[m.id]:e.target.value}); setAcknowledged(false); }}><option value="">Seleccionar</option>{callupOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
        {!!callupWarnings.length && <div className="staff-sanction-warning" role="alert"><p><ShieldAlert size={16}/>Convocados con sanción activa: {callupWarnings.map(m => m.name).join(', ')}.</p>{!workspace.workflow.callup_confirmed && <label><input type="checkbox" checked={acknowledged} disabled={callupLocked} onChange={e => setAcknowledged(e.target.checked)}/>He revisado las sanciones para este partido</label>}</div>}
        {!workspace.workflow.callup_confirmed ? <div className="staff-actions"><button className="secondary" disabled={callupLocked} onClick={() => void saveCallup(false)}>Guardar convocatoria del staff</button><button className="primary" disabled={callupLocked} onClick={() => void saveCallup(true)}>Confirmar convocatoria del staff</button></div> : <button className="secondary" disabled={busy || readOnly || workspace.workflow.attendance_confirmed} onClick={() => void act('reopen_callup',{},'Convocatoria del staff reabierta.')}>Reabrir convocatoria del staff</button>}
        {workspace.workflow.attendance_confirmed && <small className="muted">Para cambiar la convocatoria, reabre primero la asistencia del staff.</small>}
      </Card>}
      {section==='attendance' && <Card><div className="staff-section-heading"><h3>Asistencia del staff</h3><span>{workspace.workflow.attendance_confirmed ? 'Confirmada' : 'Borrador'}</span></div>
        {!workspace.workflow.callup_confirmed && <p>Confirma primero la convocatoria del staff.</p>}
        {workspace.workflow.callup_confirmed && !visits.length && <p>No hay miembros convocados para esta sesión.</p>}
        {visits.map(m => <div className="staff-attendance-person" key={m.id}><label><strong>{m.name}</strong><select aria-label={`Asistencia de ${m.name}`} disabled={attendanceLocked} value={attendance[m.id]?.status || ''} onChange={e => setAttendance({...attendance,[m.id]:{notes:attendance[m.id]?.notes || '',status:e.target.value}})}><option value="">Seleccionar asistencia</option>{attendanceOptions.map(value => <option key={value} value={value}>{translateAttendance(value)}</option>)}</select></label><label className="staff-note">{attendance[m.id]?.status && attendance[m.id].status!=='present' ? 'Motivo (obligatorio)' : 'Notas'}<textarea aria-label={`Notas de asistencia de ${m.name}`} maxLength={4000} disabled={attendanceLocked} value={attendance[m.id]?.notes || ''} onChange={e => setAttendance({...attendance,[m.id]:{status:attendance[m.id]?.status || '',notes:e.target.value}})}/></label></div>)}
        {!workspace.workflow.attendance_confirmed ? <div className="staff-actions"><button className="secondary" disabled={attendanceLocked || !visits.length} onClick={() => void saveAttendance(false)}>Guardar asistencia del staff</button><button className="primary" disabled={attendanceLocked || !visits.length} onClick={() => void saveAttendance(true)}>Confirmar asistencia del staff</button></div> : <button className="secondary" disabled={busy || readOnly} onClick={() => void act('reopen_attendance',{},'Asistencia del staff reabierta.')}>Reabrir asistencia del staff</button>}
      </Card>}
      {section==='cards' && <>
        <Card><h3>Tarjetas y sanciones</h3>{members.map(m => <div className="staff-person" key={m.id}><div><strong>{m.name}</strong><p className="muted">Histórico: {m.historical_yellows} 🟨 · {m.historical_reds} 🟥</p><small>Acumulación actual: {m.cycle_yellows} / 5 amarillas</small></div>{activeSanctions.some(s => s.staff_id===m.id) && <span className="error">Sanción</span>}</div>)}</Card>
        {!!activeSanctions.length && <Card><h3>Sanciones pendientes</h3>{activeSanctions.map(s => <div className="staff-person" key={s.id}><div><strong>{memberName(s.staff_id)}</strong><p>{s.matches_total} {s.matches_total===1 ? 'partido' : 'partidos'} · {s.source==='yellow_accumulation' ? 'Acumulación de amarillas' : 'Expulsión'}</p></div><button className="chip" disabled={busy || readOnly} onClick={() => setServeId(s.id)}>Marcar cumplida</button></div>)}</Card>}
        <Card><form className="stack" onSubmit={async e => { e.preventDefault(); if (await act('add_card',cardForm,'Tarjeta guardada.')) setCardForm({...cardForm,reason:''}); }}><h3>Registrar tarjeta</h3><label>Miembro convocado<select required disabled={busy || readOnly || !workspace.workflow.callup_confirmed} value={cardForm.staff_id} onChange={e => setCardForm({...cardForm,staff_id:e.target.value})}><option value="">Seleccionar miembro</option>{called.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Tipo de tarjeta<select disabled={busy || readOnly} value={cardForm.type} onChange={e => setCardForm({...cardForm,type:e.target.value})}>{['yellow','double_yellow','straight_red'].map(value => <option key={value} value={value}>{translateCard(value)}</option>)}</select></label><label>Motivo de la tarjeta<textarea required maxLength={4000} disabled={busy || readOnly} value={cardForm.reason} onChange={e => setCardForm({...cardForm,reason:e.target.value})}/></label>{cardForm.type!=='yellow' && <label>Partidos de sanción<input type="number" min={1} max={20} required disabled={busy || readOnly} value={cardForm.matches} onChange={e => setCardForm({...cardForm,matches:e.target.value})}/></label>}<button className="primary" disabled={busy || readOnly || !cardForm.staff_id}>Guardar tarjeta del staff</button></form></Card>
        <Card><h3>Tarjetas de esta sesión</h3>{workspace.cards.length ? workspace.cards.map(c => <div className="staff-person" key={c.id}><div><strong>{memberName(c.staff_id)} · {translateCard(c.type)}</strong><p>{c.reason}</p></div></div>) : <p>No hay tarjetas registradas.</p>}</Card>
        {!!workspace.suspensions.some(s => s.served_at) && <details><summary>Sanciones cumplidas</summary><Card>{workspace.suspensions.filter(s => s.served_at).map(s => <p key={s.id}>{memberName(s.staff_id)} · {s.matches_total} {s.matches_total===1 ? 'partido' : 'partidos'} · Cumplida</p>)}</Card></details>}
      </>}
    </>}
    </>}
    {serveId && <Modal title="Marcar sanción cumplida" onClose={() => { if (!busy) setServeId(''); }}><p>Confirma que {memberName(activeSanctions.find(s => s.id===serveId)?.staff_id || '')} ha cumplido todos los partidos de esta sanción.</p><p>Las tarjetas se conservan en el histórico. Si es por acumulación de amarillas, el recuento para la próxima sanción empieza de nuevo.</p><button className="primary" disabled={busy} onClick={async () => { if (await act('serve_suspension',{suspension_id:serveId},'Sanción marcada como cumplida.')) setServeId(''); }}>Confirmar sanción cumplida</button></Modal>}
  </div>;
}
