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
  ['injured', 'Lesionado'],
] as const;

const attendanceNeedsExplanation = [
  'late',
  'justified_late',
  'justified_absence',
  'unjustified_absence',
  'injured',
];

const absentStatuses = ['justified_absence', 'unjustified_absence'];

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
  const [localAttendance, setLocalAttendance] = useState<Attendance[]>(attendance || []);
  const [localLocked, setLocalLocked] = useState(!!session.attendance_confirmed);
  const [saving, setSaving] = useState(false);

  const locked = localLocked;
  const isAdmin = role === 'admin';

  useEffect(() => {
    setLocalAttendance(attendance || []);

    const initial: Record<string, { status: string; notes: string }> = {};
    players.forEach((p: Player) => {
      const rec = (attendance || []).find((a: Attendance) => a.player_id === p.id);
      initial[p.id] = {
        status: rec?.status || 'present',
        notes: rec?.notes || '',
      };
    });
    setDrafts(initial);
  }, [attendance, players]);

  useEffect(() => {
    setLocalLocked(!!session.attendance_confirmed);
  }, [session.attendance_confirmed]);

  async function saveAttendance(showAlert = true) {
    if (locked) return;
    setSaving(true);
    setError('');

    const rows = players.map((p: Player) => {
      const draft = drafts[p.id] || { status: 'present', notes: '' };
      const needsNotes = attendanceNeedsExplanation.includes(draft.status);
      return {
        session_id: session.id,
        player_id: p.id,
        status: draft.status,
        notes: needsNotes ? draft.notes || null : null,
      };
    });

    const { error } = await supabase
      .from('attendance')
      .upsert(rows, { onConflict: 'session_id,player_id' });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    const refreshed = await supabase.from('attendance').select('*').eq('session_id', session.id);
    setLocalAttendance(refreshed.data || []);

    await syncEvaluationsWithAttendance(rows);
    await reload(session.id);

    setSaving(false);
    if (showAlert) alert('Asistencia guardada.');
  }

  async function syncEvaluationsWithAttendance(rows: any[]) {
    for (const row of rows) {
      if (absentStatuses.includes(row.status)) {
        await supabase
          .from('evaluations')
          .delete()
          .eq('session_id', session.id)
          .eq('player_id', row.player_id);
      } else {
        await supabase
          .from('evaluations')
          .upsert(
            { session_id: session.id, player_id: row.player_id },
            { onConflict: 'session_id,player_id' }
          );
      }
    }
  }

  async function confirmAttendance() {
    const confirmed = window.confirm('¿Confirmar asistencia? Se guardará y el coach no podrá modificarla después.');
    if (!confirmed) return;

    await saveAttendance(false);

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
        status: prev[playerId]?.status || 'present',
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
            <button className="secondary" onClick={() => saveAttendance(true)} disabled={saving}>
              <Save size={16} /> {saving ? 'Guardando...' : 'Guardar asistencia'}
            </button>
            <button className="primary" onClick={confirmAttendance}>
              Confirmar asistencia
            </button>
          </div>
        )}
      </Card>

      {players.map((p: Player) => {
        const draft = drafts[p.id] || {
          status: localAttendance.find((a: Attendance) => a.player_id === p.id)?.status || 'present',
          notes: localAttendance.find((a: Attendance) => a.player_id === p.id)?.notes || '',
        };
        const needs = attendanceNeedsExplanation.includes(draft.status);
        const missingNote = needs && !draft.notes.trim();

        return (
          <Card key={p.id} className={missingNote ? 'needs-note' : ''}>
            <div className="row">
              <strong>{p.display_name}</strong>
              <span>{translatePosition(p.position)}</span>
            </div>

            {needs && (
              <>
                <textarea
                  disabled={locked}
                  placeholder="Explicación recomendada..."
                  value={draft.notes}
                  onChange={e => setDraft(p.id, { notes: e.target.value })}
                />
                {missingNote && <p className="tiny-warning">Explicación pendiente/recomendada.</p>}
              </>
            )}

            <div className="chips">
              {attendanceOptions.map(([value, label]) => (
                <button
                  disabled={locked}
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
