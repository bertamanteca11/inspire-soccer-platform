import { sortPlayersByJersey } from '../utils/playerOrder';
import { attendanceDraft } from '../utils/attendanceDrafts';
import { useEffect, useState } from 'react';
import { CheckCircle2, RotateCcw, Save } from 'lucide-react';
import { supabase } from '../supabase';
import type { Attendance, Player, Role } from '../types';
import type { AppSession } from '../utils/appTypes';
import { translatePosition } from '../utils/formatters';
import { Card, PageTitle } from '../components/ui';

const attendanceOptions = [
  ['present', 'Presente'],
  ['late', 'Tarde'],
  ['justified_late', 'Tarde justificado'],
  ['justified_absence', 'Ausencia justificada'],
  ['unjustified_absence', 'Ausencia'],
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
    setRosterLoading(true); setRosterError(''); setRoster([]); setCalledIds(new Set()); setSavedNotice('');
    Promise.all([
      supabase.from('callups').select('player_id,status').eq('session_id', session.id),
      supabase.from('players').select('*').in('status', ['active', 'injured', 'trial', 'guest']).order('display_name'),
    ]).then(([callups, playerRows]) => {
      if (cancelled) return;
      const error = callups.error || playerRows.error;
      if (error) { setRosterError(error.message); setError(error.message); }
      else { setCalledIds(new Set((callups.data || []).filter(c => c.status !== 'not_called').map(c => c.player_id))); setRoster((playerRows.data || []) as Player[]); }
      setRosterLoading(false);
    }).catch(error => { if (!cancelled) { setRosterError(String(error)); setRosterLoading(false); } });
    return () => { cancelled = true; };
  }, [session.id]);
  const attendancePlayers = sortPlayersByJersey(roster.length ? roster : players);

  const locked = localLocked;
  const isAdmin = role === 'admin';

  useEffect(() => {
    const initial: Record<string, { status: string; notes: string }> = {};
    attendancePlayers.forEach((p: Player) => {
      initial[p.id] = attendanceDraft(attendance || [], session.id, p.id);
    });
    setDrafts(initial);
  }, [session.id, attendance, players, roster]);

  useEffect(() => {
    setLocalLocked(!!session.attendance_confirmed);
  }, [session.id, session.attendance_confirmed]);

  async function saveAttendance(showAlert = true): Promise<boolean> {
    if (locked || saving || rosterLoading || rosterError || !attendancePlayers.length) return false;
    setSaving(true);
    setError('');
    setSavedNotice('');

    try {
    const pending = attendancePlayers.filter(p=>!drafts[p.id]?.status);
    if(pending.length){setError('Selecciona la situación de todos los jugadores antes de guardar: '+pending.map(p=>p.display_name).join(', '));setSaving(false);return false;}
    const rows = attendancePlayers.map((p: Player) => {
      const draft = drafts[p.id];
      return {
        session_id: session.id,
        player_id: p.id,
        status: draft.status,
        notes: draft.notes || null,
      };
    });

    const { error } = await supabase
      .from('attendance')
      .upsert(rows, { onConflict: 'session_id,player_id' });

    if (error) {
      setError(error.message);
      return false;
    }

    const refreshed = await supabase.from('attendance').select('*').eq('session_id', session.id);
    if (refreshed.error) {
      setError('Se guardó la asistencia, pero no se pudo verificar la lectura. Recarga antes de confirmar: ' + refreshed.error.message);
      return false;
    }

    await reload(session.id);

    if (showAlert) setSavedNotice('Asistencia guardada correctamente.');
    return true;
    } catch (error) {
      setError('No se pudo completar la operación de asistencia. Recarga para verificar los registros antes de confirmar: ' + (error instanceof Error ? error.message : String(error)));
      return false;
    } finally { setSaving(false); }
  }

  async function confirmAttendance() {
    if (locked || saving || rosterLoading || rosterError) return;
    const confirmed = window.confirm('¿Confirmar asistencia? Se guardará y el coach no podrá modificarla después.');
    if (!confirmed) return;

    const saved = await saveAttendance(false);
    if (!saved) return;

    const { error } = await supabase
      .from('sessions')
      .update({ attendance_confirmed: true, attendance_confirmed_at: new Date().toISOString() })
      .eq('id', session.id);

    if (error) {
      setError(error.message);
      return;
    }

    setLocalLocked(true);
    if (moveToNextOpenSession) await moveToNextOpenSession();
    else await reload(session.id);
  }

  async function reopenAttendance() {
    if (!isAdmin) return;

    const confirmed = window.confirm('¿Reabrir asistencia? Esto permitirá hacer cambios otra vez.');
    if (!confirmed) return;

    const { error } = await supabase
      .from('sessions')
      .update({ attendance_confirmed: false, attendance_confirmed_at: null })
      .eq('id', session.id);

    if (error) {
      setError(error.message);
      return;
    }

    setLocalLocked(false);
    await reload(session.id);
  }

  function setDraft(playerId: string, update: Partial<{ status: string; notes: string }>) {
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
        <PageTitle title={`Asistencia: ${session.name}`} subtitle="Primero hay que confirmar la convocatoria." />
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
      <PageTitle title={`Asistencia: ${session.name}`} subtitle="Puedes guardar cambios sin cerrar la asistencia. Confirmar asistencia la bloquea para el coach." />

      <Card className={locked ? 'locked-card confirmed-card' : ''}>
        <p className="kicker">Estado</p>
        <h2>{locked ? 'Asistencia cerrada' : 'Asistencia abierta'}</h2>

        {locked ? (
          <div className="stack">
            <button className="primary confirmed" disabled><CheckCircle2 size={18} /> Asistencia cerrada</button>
            {isAdmin && <button className="secondary danger" onClick={reopenAttendance}><RotateCcw size={16} /> Reabrir asistencia</button>}
          </div>
        ) : (
          <div className="stack">
            <button className="secondary" onClick={() => saveAttendance(true)} disabled={saving || rosterLoading || !!rosterError}>
              <Save size={16} /> {saving ? 'Guardando...' : 'Guardar asistencia'}
            </button>
            <button className="primary" disabled={saving || rosterLoading || !!rosterError} onClick={confirmAttendance}>
              Confirmar asistencia
            </button>
          </div>
        )}
      </Card>

      {savedNotice && <div role="status" className="save-feedback success">{savedNotice}</div>}
      {rosterLoading && <p role="status">Cargando plantilla y convocatoria…</p>}
      {rosterError && <p role="alert">No se puede guardar sin verificar la plantilla: {rosterError}</p>}
      <Card><p className="muted">Los jugadores sin asistencia almacenada aparecen como «Sin registrar». No se consideran presentes ni ausentes. Selecciona explícitamente la situación de cada jugador antes de guardar o confirmar; también la de los no convocados. Los registros y notas existentes se conservan.</p></Card>
      {attendancePlayers.map((p: Player) => {
        const draft = drafts[p.id] || attendanceDraft(attendance || [], session.id, p.id);
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
