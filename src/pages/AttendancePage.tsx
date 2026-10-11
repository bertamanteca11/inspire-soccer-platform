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
  const [localAttendance, setLocalAttendance] = useState<Attendance[]>(attendance || []);
  const [localLocked, setLocalLocked] = useState(!!session.attendance_confirmed);
  const [saving, setSaving] = useState(false);
  const [roster, setRoster] = useState<Player[]>([]);
  const [savedNotice, setSavedNotice] = useState('');
  const [calledIds, setCalledIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    supabase.from('callups').select('player_id,status').eq('session_id',session.id).then(({data,error}) => { if(error)setError(error.message);else setCalledIds(new Set((data||[]).filter(c=>c.status!=='not_called').map(c=>c.player_id))); });
    supabase.from('players').select('*').in('status', ['active', 'injured', 'trial', 'guest']).order('display_name').then(({data,error}) => {
      if (error) setError(error.message);
      else setRoster((data || []) as Player[]);
    });
  }, [session.id]);
  const attendancePlayers = roster.length ? roster : players;

  const locked = localLocked;
  const isAdmin = role === 'admin';

  useEffect(() => {
    setLocalAttendance(attendance || []);

    const initial: Record<string, { status: string; notes: string }> = {};
    attendancePlayers.forEach((p: Player) => {
      const rec = (attendance || []).find((a: Attendance) => a.player_id === p.id);
      initial[p.id] = {
        status: rec?.status ?? 'present',
        notes: rec?.notes || '',
      };
    });
    setDrafts(initial);
  }, [attendance, players, roster]);

  useEffect(() => {
    setLocalLocked(!!session.attendance_confirmed);
  }, [session.attendance_confirmed]);

  async function saveAttendance(showAlert = true): Promise<boolean> {
    if (locked) return false;
    setSaving(true);
    setError('');

    const pending = attendancePlayers.filter(p=>!drafts[p.id]?.status);
    if(pending.length){setError('Selecciona la situación de todos los jugadores antes de guardar: '+pending.map(p=>p.display_name).join(', '));setSaving(false);return false;}
    const rows = attendancePlayers.map((p: Player) => {
      const draft = drafts[p.id];
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
      return false;
    }

    const refreshed = await supabase.from('attendance').select('*').eq('session_id', session.id);
    setLocalAttendance(refreshed.data || []);

    await reload(session.id);

    setSaving(false);
    if (showAlert) setSavedNotice('Asistencia guardada correctamente.');
    return true;
  }

  async function confirmAttendance() {
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
        status: prev[playerId]?.status ?? 'present',
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

      {savedNotice && <div role="status" className="save-feedback success">{savedNotice}</div>}
      <Card><p className="muted">Indica la situación de TODOS los jugadores, también de los no convocados. Por comodidad, los jugadores sin registro previo aparecen como presentes. Revisa y cambia las ausencias y los lesionados ANTES de guardar, especialmente los no convocados. Solo se evaluará a los convocados que realmente entrenaron. Los comentarios de asistencia explican las ausencias.</p></Card>
      {attendancePlayers.map((p: Player) => {
        const draft = drafts[p.id] || {
          status: localAttendance.find((a: Attendance) => a.player_id === p.id)?.status ?? 'present',
          notes: localAttendance.find((a: Attendance) => a.player_id === p.id)?.notes || '',
        };
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
                  disabled={locked}
                  placeholder="Explicación recomendada..."
                  value={draft.notes}
                  onChange={e => setDraft(p.id, { notes: e.target.value })}
                />
                {missingNote && <p className="tiny-warning">Explicación pendiente/recomendada.</p>}
              </>
            )}

            <div className="chips">
              <button disabled className={draft.status?'chip':'chip active'}>{draft.status?'':'Sin registrar'}</button>
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
