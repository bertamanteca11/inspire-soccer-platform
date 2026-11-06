import { useEffect, useRef, useState } from 'react';
import { Archive, ChevronDown, History, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '../supabase';
import type { Role } from '../types';
import type { AppSession } from '../utils/appTypes';
import { buildSessionLabel, translateSessionStatus } from '../utils/formatters';
import { Card, Modal, PageTitle } from '../components/ui';
import { loadAllSessions } from '../lib/data';
import { changeSessionArchiveStatus } from '../lib/sessionArchive';
import { isActiveSession, sessionWriteError, verifiedSessionRow } from '../utils/sessionArchive';
import { copenhagenToday } from '../utils/copenhagenDates';

type Props = {
  role: Role; reload: (id?: string) => Promise<void>; selectedSession: AppSession | null;
  setSelectedSession: (session: AppSession | null) => void;
  onViewHistory?: (id: string) => void;
  onArchiveChange?: (session: AppSession) => Promise<void>;
};
const emptyForm = () => ({ name: '', session_date: copenhagenToday(), start_time: '', type: 'training', responsible: '', opponent: '', home_away: 'home', status: 'planned' });
export function SessionsPage({ role, reload, selectedSession, setSelectedSession, onViewHistory, onArchiveChange }: Props) {
  const [sessions, setSessions] = useState<AppSession[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [creationKind, setCreationKind] = useState<'' | 'operational' | 'historical'>('');
  const [editing, setEditing] = useState<AppSession | null>(null), [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [archiveDialog, setArchiveDialog] = useState<AppSession | null>(null);
  const [restoreAs, setRestoreAs] = useState<'' | 'planned' | 'completed'>('');
  const loadId = useRef(0), mutating = useRef(false);
  const canEdit = role === 'admin' || role === 'coach';
  const canArchive = role === 'admin';

  async function loadSessions() {
    const id = ++loadId.current;
    setLoading(true); setMessage(null);
    try { const rows = await loadAllSessions(); if (id === loadId.current) setSessions(rows); }
    catch (error) { if (id === loadId.current) { setSessions([]); setMessage({ text: String(error instanceof Error ? error.message : error), error: true }); } }
    finally { if (id === loadId.current) setLoading(false); }
  }
  useEffect(() => { void loadSessions(); return () => { loadId.current++; }; }, []);
  function openEdit(session?: AppSession) {
    if (!canEdit || busy || session && !isActiveSession(session)) return;
    setMessage(null); setEditing(session || null); setCreationKind('');
    setForm(session ? { name: session.name || '', session_date: session.session_date, start_time: session.start_time || '', type: session.type, responsible: session.responsible || '', opponent: session.opponent || '', home_away: session.home_away || 'home', status: session.status } : emptyForm());
    setShowModal(true);
  }
  function replaceSession(row: AppSession) { setSessions(current => [...current.filter(s => s.id !== row.id), row].sort((a, b) => b.session_date.localeCompare(a.session_date) || a.id.localeCompare(b.id))); }
  async function saveSession(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit || mutating.current || !['planned', 'completed'].includes(form.status)) return;
    if (!editing && (!creationKind || creationKind === 'operational' && form.status !== 'planned')) { setMessage({ text: 'Selecciona el origen. Las sesiones operativas nuevas deben estar planificadas.', error: true }); return; }
    mutating.current = true; setBusy(true); setMessage(null);
    const payload = { ...form, start_time: form.start_time || null, responsible: form.responsible || null, opponent: form.opponent || null, home_away: form.home_away || null };
    try {
      // Updating metadata never resets rating limits or other unedited fields.
      const result = editing
        ? await supabase.from('sessions').update(payload).eq('id', editing.id).eq('status', editing.status).select('*')
        : await supabase.from('sessions').insert({ ...payload, high_rating_limit: 6, low_rating_limit: 3, ...(creationKind === 'operational' ? { draft_defaults_version: 1 } : {}) }).select('*');
      if (result.error) throw new Error(sessionWriteError(result.error));
      const id = editing?.id || result.data?.[0]?.id;
      if (!id) throw new Error('No se pudo verificar la sesión creada. Recarga antes de reintentar.');
      const row = verifiedSessionRow(result.data as AppSession[] | null, id, form.status);
      replaceSession(row); setShowModal(false); setMessage({ text: 'Sesión guardada y verificada correctamente.', error: false });
      if (selectedSession?.id === row.id) setSelectedSession(row);
      await reload(row.id);
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : String(error), error: true }); }
    finally { mutating.current = false; setBusy(false); }
  }
  async function confirmArchive() {
    if (!archiveDialog || !canArchive || mutating.current || archiveDialog.status === 'archived' && !restoreAs) return;
    const target = archiveDialog.status === 'archived' ? restoreAs as 'planned' | 'completed' : 'archived';
    mutating.current = true; setBusy(true); setMessage(null);
    try {
      const row = await changeSessionArchiveStatus(archiveDialog, target, role);
      replaceSession(row); setArchiveDialog(null);
      setMessage({ text: target === 'archived' ? 'Sesión archivada y verificada correctamente. Sus registros se conservan.' : 'Sesión restaurada y verificada correctamente.', error: false });
      if (row.status === 'archived' && selectedSession?.id === row.id) setSelectedSession(null);
      try { await onArchiveChange?.(row); }
      catch { setMessage({ text: 'El cambio de archivo está verificado, pero no se pudo actualizar la selección operativa. Recarga la aplicación.', error: true }); }
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : String(error), error: true }); }
    finally { mutating.current = false; setBusy(false); }
  }
  const active = sessions.filter(isActiveSession), archived = sessions.filter(s => s.status === 'archived');
  const visible = view === 'active' ? active : archived;
  const other = sessions.filter(s => !isActiveSession(s) && s.status !== 'archived');
  return <div className="stack sessions-page">
    <div className="row"><PageTitle title="Sesiones" subtitle="Entrenos, partidos y pruebas."/>{canEdit && <button className="icon-btn big" aria-label="Crear sesión" disabled={busy} onClick={() => openEdit()}><Plus size={20}/></button>}</div>
    <div className="segmented"><button className={view === 'active' ? 'selected' : ''} disabled={busy} onClick={() => setView('active')}>Activas ({active.length})</button><button className={view === 'archived' ? 'selected' : ''} disabled={busy} onClick={() => setView('archived')}>Archivadas ({archived.length})</button></div>
    <div className="sessions-toolbar"><span>{view === 'active' ? 'Selecciona una sesión para trabajar' : 'Consulta o restaura sesiones anteriores'}</span><button className="sessions-refresh" aria-label="Actualizar sesiones" disabled={busy || loading} onClick={() => void loadSessions()}><RefreshCw size={16}/><span>Actualizar</span></button></div>
    {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'error' : 'success'}>{message.text}</p>}
    {loading ? <Card><p role="status">Cargando sesiones…</p></Card> : !visible.length ? <Card><p>{view === 'active' ? 'No hay sesiones activas.' : 'No hay sesiones archivadas.'}</p></Card> : visible.map(s => {
      const current = selectedSession?.id === s.id;
      const summary = <><span className={`session-icon ${s.type === 'training' || s.type === 'tryout' ? 'training' : 'match'}`} aria-hidden="true">{s.type === 'training' ? '🏃' : s.type === 'tryout' ? '🎯' : '⚽'}</span><span className="session-copy"><strong>{s.name}</strong><span className="session-meta">{buildSessionLabel(s)}</span><span className="session-badges"><span className={`session-status ${s.status}`}>{translateSessionStatus(s.status)}</span>{current && <span className="session-selected">Seleccionada</span>}</span></span></>;
      return <Card key={s.id} className={current ? 'session-card current' : 'session-card'}>
        <div className="session-main-row">
          {isActiveSession(s) ? <button className="session-select" aria-label={`Seleccionar sesión: ${s.name}`} aria-pressed={current} disabled={busy} onClick={() => { setSelectedSession(s); void reload(s.id).catch(error => setMessage({ text: String(error), error: true })); }}>{summary}</button> : <div className="session-select">{summary}</div>}
          {isActiveSession(s) && canEdit && <button className="chip session-edit" disabled={busy} onClick={() => openEdit(s)}>Editar</button>}
        </div>
        {(onViewHistory || canArchive) && <details className="session-options">
          <summary>Más opciones <ChevronDown size={14}/></summary>
          <div className="session-option-actions">
            {onViewHistory && <button disabled={busy} onClick={() => onViewHistory(s.id)}><History size={16}/>Ver registros históricos</button>}
            {canArchive && <button disabled={busy} onClick={() => { setArchiveDialog(s); setRestoreAs(''); setMessage(null); }}><Archive size={16}/>{s.status === 'archived' ? 'Restaurar sesión' : 'Archivar sesión'}</button>}
          </div>
        </details>}
      </Card>;
    })}
    {!!other.length && <Card><p role="alert">{other.length} sesiones con estado no operativo. Se conservan y pueden consultarse en el historial.</p>{other.map(s => <p key={s.id}>{s.name} · {translateSessionStatus(s.status)} {onViewHistory && <button onClick={() => onViewHistory(s.id)}>Ver registros históricos</button>}</p>)}</Card>}
    {archiveDialog && <Modal title={archiveDialog.status === 'archived' ? 'Restaurar sesión' : 'Archivar sesión'} onClose={() => { if (!busy) setArchiveDialog(null); }}>
      <p><strong>{archiveDialog.name}</strong> · {archiveDialog.session_date}</p><p>Sesión {archiveDialog.id}</p>
      <p>Esta acción solo cambia el estado. No elimina ni modifica asistencia, evaluaciones, convocatoria, límites de puntuación ni registros históricos.</p>
      {archiveDialog.status === 'archived' && <label>Restaurar como<select value={restoreAs} disabled={busy} onChange={e => setRestoreAs(e.target.value as typeof restoreAs)}><option value="">Seleccionar estado explícitamente</option><option value="planned">Planificada</option><option value="completed">Completada</option></select><small>El estado anterior al archivo no está almacenado. No se infiere que la sesión esté completada.</small></label>}
      <button className="primary" disabled={busy || archiveDialog.status === 'archived' && !restoreAs} onClick={() => void confirmArchive()}>{busy ? 'Verificando…' : archiveDialog.status === 'archived' ? 'Confirmar restauración' : 'Confirmar archivo'}</button>
    </Modal>}
    {showModal && <Modal title={editing ? 'Editar sesión' : 'Crear sesión'} onClose={() => { if (!busy) setShowModal(false); }}><form className="stack" onSubmit={saveSession}>
      {!editing && <label>Origen<select aria-label="Origen sesión" value={creationKind} onChange={e => setCreationKind(e.target.value as typeof creationKind)} required disabled={busy}><option value="">Seleccionar origen</option><option value="operational">Nueva sesión operativa</option><option value="historical">Registro histórico / importado</option></select></label>}
      <input aria-label="Nombre sesión" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required disabled={busy}/>
      <input aria-label="Fecha sesión" type="date" value={form.session_date} onChange={e => setForm({ ...form, session_date: e.target.value })} required disabled={busy}/>
      <input aria-label="Hora sesión" type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} disabled={busy}/>
      <select aria-label="Tipo sesión" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} disabled={busy}><option value="training">Entreno</option><option value="friendly_match">Partido amistoso</option><option value="league_match">Partido liga</option><option value="tryout">Tryout</option><option value="scrimmage">Scrimmage</option></select>
      <input aria-label="Responsable" value={form.responsible} onChange={e => setForm({ ...form, responsible: e.target.value })} disabled={busy}/>
      <input aria-label="Rival" value={form.opponent} onChange={e => setForm({ ...form, opponent: e.target.value })} disabled={busy}/>
      <select aria-label="Local o visitante" value={form.home_away} onChange={e => setForm({ ...form, home_away: e.target.value })} disabled={busy}><option value="home">Local</option><option value="away">Visitante</option><option value="neutral">Neutral</option></select>
      <select aria-label="Estado sesión" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} disabled={busy}><option value="planned">Planificada</option><option value="completed">Completada</option></select>
      <button className="primary" disabled={busy}>Guardar sesión</button>
    </form></Modal>}
  </div>;
}
