import { operationalAttendanceDraft, attendanceSnapshot, usesDraftDefaults } from '../utils/workflowDrafts';
import { workflowAction } from '../lib/workflows';
import { workflowRows } from '../lib/workflowReads';
import { useWorkflowAccess } from '../utils/useWorkflowAccess';
import { sortPlayersByJersey } from '../utils/playerOrder';
import { attendanceDraft } from '../utils/attendanceDrafts';
import { useEffect, useState } from 'react';
import { CheckCircle2, RotateCcw, Save } from 'lucide-react';
import { supabase } from '../supabase';
import type { Attendance, Player, Role } from '../types';
import type { AppSession } from '../utils/appTypes';
import { translatePosition } from '../utils/formatters';
import { Card } from '../components/ui';
import { SessionHeading } from '../components/SessionHeading';

const attendanceOptions = [
  ['present', 'Presente'],
  ['late', 'Tarde'],
  ['justified_late', 'Tarde justificado'],
  ['justified_absence', 'Ausencia justificada'],
  ['unjustified_absence', 'Ausencia injustificada'],
  ['injured', 'Lesionado (sin especificar)'],
  ['injured_present', 'Lesionado presente (fisio)'],
  ['injured_justified_absence', 'Lesionado ausente justificado'],
  ['injured_unjustified_absence', 'Lesionado ausente no justificado'],
] as const;

const attendanceNeedsExplanation = [
  'late',
  'justified_late',
  'justified_absence',
  'unjustified_absence',
  'injured',
  'injured_present',
  'injured_justified_absence',
  'injured_unjustified_absence',
];

const absentStatuses = ['justified_absence', 'unjustified_absence', 'injured', 'injured_present', 'injured_justified_absence', 'injured_unjustified_absence'];

export function AttendancePage({
  role,
  session,
  players,
  attendance,
  reload,
  setError,
  moveToNextOpenSession,
}: {
  role: Role;
  session: AppSession;
  players: Player[];
  attendance: Attendance[];
  reload: any;
  setError: any;
  moveToNextOpenSession?: any;
}) {
  const [stored, setStored] = useState<Attendance[]>([]);
  const [draftSession, setDraftSession] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { status: string; notes: string }>>({});
  const [localLocked, setLocalLocked] = useState(!!session.attendance_confirmed);
  const [saving, setSaving] = useState(false);
  const [roster, setRoster] = useState<Player[]>([]);
  const [savedNotice, setSavedNotice] = useState('');
  const [calledIds, setCalledIds] = useState<Set<string>>(new Set());
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setRosterLoading(true); setRosterError(''); setRoster([]); setCalledIds(new Set()); setSavedNotice(''); setDraftSession('');
    Promise.all([
      workflowRows<{ player_id: string; status: string }>((a,b) => supabase.from('callups').select('player_id,status').eq('session_id', session.id).order('player_id').range(a,b)),
      workflowRows<Player>((a,b) => supabase.from('players').select('*').order('id').range(a,b)),
      workflowRows<Attendance>((a,b) => supabase.from('attendance').select('*').eq('session_id', session.id).order('player_id').range(a,b)),
    ]).then(([calls, playerRows, visits]) => {
      if (cancelled) return;
      const error = calls.error || playerRows.error || visits.error;
      if (error) throw new Error(error.message);
      const callRows = calls.data || [];
      const saved = (visits.data || []) as Attendance[];
      if (new Set(callRows.map(c => c.player_id)).size !== callRows.length || new Set(saved.map(c => c.player_id)).size !== saved.length) throw new Error('Registros duplicados. Revisión necesaria.');
      const called = new Set<string>(callRows.filter(c => ['called_up','trial','guest_not_evaluable'].includes(c.status)).map(c => c.player_id));
      const savedIds = new Set(saved.map(row => row.player_id));
      const all = (playerRows.data || []) as Player[];
      const list = all.filter(p => called.has(p.id) || savedIds.has(p.id) || ['active','injured','trial','guest'].includes(p.status));
      if ([...called, ...savedIds].some(id => !all.some(p => p.id === id))) throw new Error('Plantilla incompleta. Recarga antes de guardar.');
      const initial: Record<string, { status: string; notes: string }> = {};
      for (const p of list) initial[p.id] = operationalAttendanceDraft(session, p.id, saved, called.has(p.id));
      setStored(saved); setRoster(list); setCalledIds(called); setDrafts(initial); setDraftSession(session.id); setRosterLoading(false);
    }).catch(error => { if (!cancelled) { setRosterError(String(error)); setError(String(error)); setRosterLoading(false); } });
    return () => { cancelled = true; };
  }, [session.id, session.callup_confirmed, session.attendance_confirmed]);
  const attendancePlayers = sortPlayersByJersey(roster);
  const access = useWorkflowAccess(session.id, 'attendance', localLocked);
  const locked = localLocked || !['admin','coach'].includes(role) || !access.canEdit || draftSession !== session.id;
  const isAdmin = role === 'admin';
  const savePlayers = attendancePlayers.filter(p => !usesDraftDefaults(session) || calledIds.has(p.id) || stored.some(row => row.player_id === p.id) || !!drafts[p.id]?.status);
  function selectedRows() {
    return savePlayers.map(p => ({ session_id: session.id, player_id: p.id, status: drafts[p.id]?.status || '', notes: drafts[p.id]?.notes || null }));
  }

  useEffect(() => { setLocalLocked(!!session.attendance_confirmed); }, [session.id, session.attendance_confirmed]);
  async function saveAttendance(): Promise<boolean> {
    if (locked || saving || rosterLoading || rosterError || !savePlayers.length) return false;
    const rows = selectedRows();
    if (rows.some(row => !attendanceOptions.some(([value]) => value === row.status))) { setError('Selecciona la situación de los jugadores pendientes; utiliza un estado válido antes de guardar.'); return false; }
    setSaving(true); setError(''); setSavedNotice('');
    try {
      const result = await supabase.from('attendance').upsert(rows, { onConflict: 'session_id,player_id' });
      if (result.error) throw new Error(result.error.message);
      const refreshed = await workflowRows<Attendance>((a,b) => supabase.from('attendance').select('*').eq('session_id', session.id).order('player_id').range(a,b));
      if (refreshed.error) throw new Error('Se guardó la asistencia, pero no se pudo verificar la lectura: ' + refreshed.error.message);
      if (attendanceSnapshot(refreshed.data || []) !== attendanceSnapshot(rows)) throw new Error('No se verificaron todos los estados guardados. Recarga antes de confirmar.');
      setStored((refreshed.data || []) as Attendance[]);
      await reload(session.id);
      setSavedNotice('Asistencia guardada correctamente.'); return true;
    } catch (error) { setError(String(error)); return false; }
    finally { setSaving(false); }
  }
  async function confirmAttendance() {
    if (locked || saving || rosterLoading || rosterError) return;
    const rows = selectedRows();
    if (!rows.length || rows.some(row => !row.status) || attendanceSnapshot(rows) !== attendanceSnapshot(stored)) {
      setError('Guarda y verifica la asistencia antes de confirmar.'); return;
    }
    if (!window.confirm('Confirmar la asistencia guardada?')) return;
    setSaving(true);
    try {
      await workflowAction(session.id, 'attendance', 'confirm', rows);
      setLocalLocked(true);
      if (moveToNextOpenSession) await moveToNextOpenSession(); else await reload(session.id);
    } catch (error) { setError(String(error)); }
    finally { setSaving(false); }
  }
  async function reopenAttendance() {
    if (!isAdmin || saving || !window.confirm('Reabrir asistencia?')) return;
    setSaving(true);
    try {
      await workflowAction(session.id, 'attendance', 'reopen');
      setLocalLocked(false);
      await reload(session.id);
    } catch (error) { setError(String(error)); }
    finally { setSaving(false); }
  }
  function setDraft(playerId: string, update: Partial<{ status: string; notes: string }>) {
    if (locked || saving || rosterLoading || rosterError) return;
    setSavedNotice('');
    setDrafts(prev => ({
      ...prev,
      [playerId]: {
        status: prev[playerId]?.status ?? '',
        notes: prev[playerId]?.notes || '',
        ...update,
      },
    }));
  }

  if (!session.callup_confirmed) {
    return (
      <div className="stack">
        <SessionHeading session={session} subtitle="Primero hay que confirmar la convocatoria."/>
        <Card>
          <p className="kicker">Pendiente</p>
          <h2>Convocatoria no confirmada</h2>
          <p>Cuando la convocatoria esté confirmada, aparecerán aquí los jugadores convocados.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="stack">
      {access.error && <p role="alert">No se pueden verificar los permisos: {access.error}</p>}
      <SessionHeading session={session} subtitle="Guardar conserva cambios. Confirmar cierra los registros guardados."/>

      <Card className={locked ? 'locked-card confirmed-card' : ''}>
        <p className="kicker">Estado</p>
        <h2>{localLocked ? 'Asistencia cerrada' : 'Asistencia abierta'}</h2>

        {localLocked ? (
          <div className="stack">
            <button className="primary confirmed" disabled><CheckCircle2 size={18} /> Asistencia cerrada</button>
            {isAdmin && <button className="secondary danger" disabled={saving} onClick={reopenAttendance}><RotateCcw size={16} /> Reabrir asistencia</button>}
          </div>
        ) : (
          <div className="stack">
            <button className="secondary" onClick={() => saveAttendance()} disabled={locked || saving || rosterLoading || !!rosterError}>
              <Save size={16} /> {saving ? 'Guardando...' : 'Guardar asistencia'}
            </button>
            <button className="primary" disabled={locked || saving || rosterLoading || !!rosterError} onClick={confirmAttendance}>
              Confirmar asistencia
            </button>
          </div>
        )}
      </Card>

      {savedNotice && <div role="status" className="save-feedback success">{savedNotice}</div>}
      {rosterLoading && <p role="status">Cargando plantilla y convocatoria…</p>}
      {rosterError && <p role="alert">No se puede guardar sin verificar la plantilla: {rosterError}</p>}
      <Card><p className="muted">«Sin registrar» no suma presencia ni ausencia. Revisa el estado de cada jugador, incluidos los no convocados. «Ausencia injustificada» y «Ausencia justificada» cuentan por separado. Las notas existentes se conservan al cambiar el estado.</p>{localLocked && isAdmin && <p className="muted">Para corregir una asistencia, pulsa «Reabrir asistencia», cambia el estado, guarda y vuelve a confirmar.</p>}</Card>
      {attendancePlayers.map((p: Player) => {
        const draft = drafts[p.id] || { status: '', notes: '' };
        const needs = attendanceNeedsExplanation.includes(draft.status);
        const missingNote = needs && !draft.notes.trim();

        return (
          <Card key={p.id} className={missingNote ? 'needs-note' : ''}>
            <div className="row">
              <strong>{p.display_name} <small className="muted">{calledIds.has(p.id)?'· Convocado':'· No convocado'}</small></strong>
              <span>{translatePosition(p.position)}</span>
            </div>

            {needs && (
              <>
                <textarea
                  disabled={locked || saving || rosterLoading || !!rosterError}
                  placeholder="Explicación recomendada..."
                  value={draft.notes}
                  onChange={e => setDraft(p.id, { notes: e.target.value })}
                />
                {missingNote && <p className="tiny-warning">Explicación pendiente/recomendada.</p>}
              </>
            )}

            <div className="chips">
              {!draft.status && <span className="chip active">Sin registrar</span>}
              {attendanceOptions.map(([value, label]) => (
                <button
                  disabled={locked || saving || rosterLoading || !!rosterError}
                  aria-pressed={draft.status === value}
                  key={value}
                  className={draft.status === value ? 'chip active' : 'chip'}
                  onClick={() => setDraft(p.id, { status: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
