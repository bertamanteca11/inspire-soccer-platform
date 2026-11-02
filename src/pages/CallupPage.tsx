import { callupDraft, defaultCallup as defaultChoice, type CallupChoice } from '../utils/workflowDrafts';
import { workflowAction } from '../lib/workflows';
import { workflowRows } from '../lib/workflowReads';
import { useWorkflowAccess } from '../utils/useWorkflowAccess';
import { sortPlayersByJersey } from '../utils/playerOrder';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, RotateCcw, Save, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabase';
import type { Player, Role } from '../types';
import type { AppSession } from '../utils/appTypes';
import { translatePosition, translateStatus } from '../utils/formatters';
import { Card } from '../components/ui';
import { SessionHeading } from '../components/SessionHeading';
import { ProgressiveAlerts } from '../components/ProgressiveAlerts';

type CallupRow = {
  id: string;
  session_id: string;
  player_id: string;
  status: string;
  evaluable: boolean;
  notes?: string | null;
};

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

  const access = useWorkflowAccess(session.id, 'callup', localLocked);
  const locked = localLocked || role !== 'admin' || !access.canEdit;
  const isAdmin = role === 'admin';

  useEffect(() => {
    setLocalLocked(!!session.callup_confirmed);
  }, [session.id, session.callup_confirmed]);

  useEffect(() => {
    const request = ++requestId.current;
    async function load() {
      setLoading(true);
      const [playersRes, callupsRes, suspensionsRes] = await Promise.all([
        workflowRows<Player>((a,b) => supabase.from('players').select('*').order('id').range(a,b)),
        workflowRows<CallupRow>((a,b) => supabase.from('callups').select('*').eq('session_id', session.id).order('player_id').range(a,b)),
        supabase.from('active_suspensions').select('*'),
      ]);
      if (request !== requestId.current) return;
      const error = playersRes.error || callupsRes.error || suspensionsRes.error;
      if (error) { setError(error.message); setPlayers([]); setDrafts({}); setLoading(false); return; }
      const existing = (callupsRes.data || []) as CallupRow[];
      const savedIds = new Set(existing.map(row => row.player_id));
      const allPlayers = sortPlayersByJersey(((playersRes.data || []) as Player[]).filter(p => savedIds.has(p.id) || ['active','injured','trial','guest'].includes(p.status)));
      if (existing.some(row => !allPlayers.some(p => p.id === row.player_id))) { setError('Plantilla incompleta. Recarga antes de guardar.'); setPlayers([]); setLoading(false); return; }
      if (new Set(existing.map(row => row.player_id)).size !== existing.length) { setError('Convocatoria duplicada. Revisión necesaria.'); setPlayers([]); setLoading(false); return; }
      const initial: Record<string, CallupChoice | null> = {};
      for (const p of allPlayers) initial[p.id] = callupDraft(session, p, existing);
      setPlayers(allPlayers);
      setCallups(existing);
      setDrafts(initial);
      setSuspensions(suspensionsRes.data || []);
      setLoading(false);
    }
    void load();
    return () => { requestId.current += 1; };
  }, [session.id, session.callup_confirmed]);

  function togglePlayer(player: Player) {
    if (locked || saving) return;
    const current = drafts[player.id];
    const next = !current || current.status === 'not_called' ? defaultChoice(player) : { status: 'not_called', evaluable: false };
    setDrafts(prev => ({ ...prev, [player.id]: next }));
    const nextPlayer = players[(players.findIndex(p => p.id === player.id) + 1) % players.length];
    if (nextPlayer?.id !== player.id) playerRefs.current[nextPlayer.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    try {
      await workflowAction(session.id, 'callup', 'confirm', rows);
      setLocalLocked(true);
      await reload(session.id);
    } catch (error) { setError(String(error)); }
    finally { setSaving(false); }
  }

  async function reopenConvocatoria() {
    if (!isAdmin || saving) return;
    if (!window.confirm('¿Reabrir convocatoria? Esto permitirá hacer cambios otra vez.')) return;
    setSaving(true);
    try {
      await workflowAction(session.id, 'callup', 'reopen');
      setLocalLocked(false);
      await reload(session.id);
    } catch (error) { setError(String(error)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="stack"><SessionHeading session={session}/><Card><p>Cargando convocatoria...</p></Card></div>;

  const calledCount = players.filter(p => drafts[p.id] && drafts[p.id]!.status !== 'not_called').length;
  const savedIds = new Set(callups.map(c => c.player_id));
  const missingCount = players.filter(p => !savedIds.has(p.id)).length;

  return <div className="stack">
    {access.error && <p role="alert">No se pueden verificar los permisos: {access.error}</p>}
    <SessionHeading session={session}/>
    {suspensions.length > 0 && <Card className="warning">
      <AlertTriangle size={18} />
      <div><strong>Sanciones activas (revisar según la fecha del partido)</strong>
        <ProgressiveAlerts items={suspensions.map((s: any) => ({key:s.id,content:<p>{s.display_name}: {s.matches_remaining} partido(s)</p>}))}/>
      </div>
    </Card>}
    {missingCount > 0 && players.some(p => drafts[p.id] === null) && <Card className="warning">
      <AlertTriangle size={18} />
      <p>Hay {missingCount} jugadores sin registro explícito de convocatoria. «Sin registro» no significa «No convocado». Revisa cada uno con el entrenador antes de confirmar; pulsa «Sin registro» para marcarlo convocado y vuelve a pulsar para marcarlo no convocado.</p>
    </Card>}
    <Card className={locked ? 'locked-card confirmed-card' : ''}>
      <p className="kicker">Estado</p>
      <h2>{locked ? 'Convocatoria confirmada' : `${calledCount} convocados`}</h2>
      {localLocked ? <div className="stack">
        <button className="primary confirmed" disabled><CheckCircle2 size={18} /> Convocatoria confirmada</button>
        {isAdmin && <button className="secondary danger" disabled={saving} onClick={reopenConvocatoria}><RotateCcw size={16} /> Reabrir convocatoria</button>}
      </div> : <button className="primary" disabled={locked || saving || players.length === 0} onClick={confirmConvocatoria}><Save size={18} /> {saving ? 'Guardando...' : 'Confirmar convocatoria'}</button>}
    </Card>
    {players.map(player => {
      const choice = drafts[player.id];
      const selected = choice !== null && choice !== undefined && choice.status !== 'not_called';
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
