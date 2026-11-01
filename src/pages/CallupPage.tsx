import { sortPlayersByJersey } from '../utils/playerOrder';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, RotateCcw, Save, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabase';
import type { Player, Role } from '../types';
import type { AppSession } from '../utils/appTypes';
import { translatePosition, translateStatus } from '../utils/formatters';
import { Card, PageTitle } from '../components/ui';

type CallupRow = {
  id: string;
  session_id: string;
  player_id: string;
  status: string;
  evaluable: boolean;
  notes?: string | null;
};

type CallupChoice = { status: string; evaluable: boolean };

function defaultChoice(player: Player): CallupChoice {
  return {
    status: player.status === 'trial' ? 'trial' : player.status === 'guest' ? 'guest_not_evaluable' : 'called_up',
    evaluable: player.status !== 'guest',
  };
}

export function CallupPage({ role, session, reload, setError }: {
  role: Role;
  session: AppSession;
  reload: any;
  setError: any;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [callups, setCallups] = useState<CallupRow[]>([]);
  const [suspensions, setSuspensions] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CallupChoice | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localLocked, setLocalLocked] = useState(!!session.callup_confirmed);
  const playerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const requestId = useRef(0);

  const locked = localLocked;
  const isAdmin = role === 'admin';

  useEffect(() => {
    setLocalLocked(!!session.callup_confirmed);
  }, [session.id, session.callup_confirmed]);

  useEffect(() => {
    const request = ++requestId.current;
    async function load() {
      setLoading(true);
      const [playersRes, callupsRes, suspensionsRes] = await Promise.all([
        supabase.from('players').select('*').in('status', ['active', 'injured', 'trial', 'guest']).order('shirt_number', { ascending: true, nullsFirst: false }),
        supabase.from('callups').select('*').eq('session_id', session.id),
        supabase.from('active_suspensions').select('*'),
      ]);
      if (request !== requestId.current) return;
      const error = playersRes.error || callupsRes.error || suspensionsRes.error;
      if (error) setError(error.message);
      const allPlayers = sortPlayersByJersey((playersRes.data || []) as Player[]);
      const existing = (callupsRes.data || []) as CallupRow[];
      const byPlayer = new Map(existing.map(row => [row.player_id, row]));
      const hasExisting = existing.length > 0;
      const initial: Record<string, CallupChoice | null> = {};
      for (const p of allPlayers) {
        const row = byPlayer.get(p.id);
        if (row) initial[p.id] = { status: row.status, evaluable: row.evaluable };
        else if (!session.callup_confirmed && !hasExisting) initial[p.id] = defaultChoice(p);
        else initial[p.id] = null; // Historical missing row: unknown, not automatically uncalled
      }
      setPlayers(allPlayers);
      setCallups(existing);
      setDrafts(initial);
      setSuspensions(suspensionsRes.data || []);
      setLoading(false);
    }
    void load();
    return () => { requestId.current += 1; };
  }, [session.id, session.callup_confirmed]);

  async function persistChoice(player: Player, choice: CallupChoice): Promise<boolean> {
    const { data, error } = await supabase.from('callups').upsert({
      session_id: session.id,
      player_id: player.id,
      status: choice.status,
      evaluable: choice.evaluable,
    }, { onConflict: 'session_id,player_id' }).select('*').single();
    if (error) { setError(error.message); return false; }
    if (data) setCallups(prev => [...prev.filter(c => c.player_id !== player.id), data as CallupRow]);
    return true;
  }

  async function togglePlayer(player: Player) {
    if (locked || saving) return;
    setSaving(true);
    setError('');
    const current = drafts[player.id];
    const next: CallupChoice = current === null || current?.status === 'not_called' ? defaultChoice(player) : { status: 'not_called', evaluable: false };
    const ok = await persistChoice(player, next);
    if (ok) {
      setDrafts(prev => ({ ...prev, [player.id]: next }));
      const currentIndex = players.findIndex(p => p.id === player.id);
      const nextPlayer = players[(currentIndex + 1) % players.length];
      requestAnimationFrame(() => {
        if (nextPlayer && nextPlayer.id !== player.id) {
          playerRefs.current[nextPlayer.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
    setSaving(false);
  }

  async function confirmConvocatoria() {
    if (locked || saving) return;
    const unresolved = players.filter(p => drafts[p.id] === null || drafts[p.id] === undefined);
    if (unresolved.length) {
      setError(`Hay ${unresolved.length} jugadores sin convocatoria histórica registrada. Debes revisar su estado individualmente antes de confirmar; no los marcaremos automáticamente como no convocados.`);
      return;
    }
    if (!window.confirm('¿Confirmar convocatoria? Después de confirmar, el coach no podrá modificarla.')) return;
    setSaving(true);
    setError('');
    // Save one explicit status for every visible player, including not_called.
    // Never delete attendance, evaluations, comments or disciplinary records.
    const rows = players.map(p => ({
      session_id: session.id,
      player_id: p.id,
      status: drafts[p.id]!.status,
      evaluable: drafts[p.id]!.evaluable,
    }));
    if (rows.length) {
      const { error } = await supabase.from('callups').upsert(rows, { onConflict: 'session_id,player_id' });
      if (error) { setError(error.message); setSaving(false); return; }
    }
    const { error } = await supabase.from('sessions').update({
      callup_confirmed: true,
      callup_confirmed_at: new Date().toISOString(),
    }).eq('id', session.id);
    if (error) { setError(error.message); setSaving(false); return; }
    setLocalLocked(true);
    await reload(session.id);
    setSaving(false);
  }

  async function reopenConvocatoria() {
    if (!isAdmin || saving) return;
    if (!window.confirm('¿Reabrir convocatoria? Esto permitirá hacer cambios otra vez.')) return;
    setSaving(true);
    const { error } = await supabase.from('sessions').update({
      callup_confirmed: false,
      callup_confirmed_at: null,
    }).eq('id', session.id);
    if (error) { setError(error.message); setSaving(false); return; }
    setLocalLocked(false);
    await reload(session.id);
    setSaving(false);
  }

  if (loading) return <div className="stack"><PageTitle title={`Convocatoria: ${session.name}`} subtitle="Cargando jugadores..." /><Card><p>Cargando convocatoria...</p></Card></div>;

  const calledCount = players.filter(p => drafts[p.id] && drafts[p.id]!.status !== 'not_called').length;
  const savedIds = new Set(callups.map(c => c.player_id));
  const missingCount = players.filter(p => !savedIds.has(p.id)).length;

  return <div className="stack">
    <PageTitle title={`Convocatoria: ${session.name}`} subtitle="Marca quién está convocado. Las asistencias, evaluaciones y comentarios se conservan aunque cambies una convocatoria." />
    {suspensions.length > 0 && <Card className="warning">
      <AlertTriangle size={18} />
      <div><strong>Sanciones activas (revisar según la fecha del partido)</strong>
        {suspensions.map((s: any) => <p key={s.id}>{s.display_name}: {s.matches_remaining} partido(s)</p>)}
      </div>
    </Card>}
    {missingCount > 0 && callups.length > 0 && <Card className="warning">
      <AlertTriangle size={18} />
      <p>Hay {missingCount} jugadores sin registro explícito de convocatoria. «Sin registro» no significa «No convocado». Revisa cada uno con el entrenador antes de confirmar; pulsa «Sin registro» para marcarlo convocado y vuelve a pulsar para marcarlo no convocado.</p>
    </Card>}
    <Card className={locked ? 'locked-card confirmed-card' : ''}>
      <p className="kicker">Estado</p>
      <h2>{locked ? 'Convocatoria confirmada' : `${calledCount} convocados`}</h2>
      {locked ? <div className="stack">
        <button className="primary confirmed" disabled><CheckCircle2 size={18} /> Convocatoria confirmada</button>
        {isAdmin && <button className="secondary danger" disabled={saving} onClick={reopenConvocatoria}><RotateCcw size={16} /> Reabrir convocatoria</button>}
      </div> : <button className="primary" disabled={saving || players.length === 0} onClick={confirmConvocatoria}><Save size={18} /> {saving ? 'Guardando...' : 'Confirmar convocatoria'}</button>}
    </Card>
    {players.map(player => {
      const choice = drafts[player.id];
      const selected = choice !== null && choice !== undefined && choice.status !== 'not_called';
      const hasSaved = savedIds.has(player.id);
      const label = choice === null || choice === undefined ? 'Sin registro' : selected ? 'Convocado' : 'No convocado';
      return <div key={player.id} ref={node => { playerRefs.current[player.id] = node; }}>
        <Card><div className="row">
          <div><strong>{player.shirt_number ? `${player.shirt_number}. ` : ''}{player.display_name}</strong><p>{translatePosition(player.position)} · {translateStatus(player.status)}</p></div>
          <button disabled={locked || saving} className={selected ? 'chip active' : 'chip'} onClick={() => void togglePlayer(player)}>{label}</button>
        </div></Card>
      </div>;
    })}
  </div>;
}
