import { useEffect, useState } from 'react';
import { CheckCircle2, RotateCcw, Save } from 'lucide-react';
import { supabase } from '../supabase';
import type { Player, Role } from '../types';
import type { AppSession } from '../utils/appTypes';
import { translatePosition, translateStatus } from '../utils/formatters';
import { Card, PageTitle } from '../components/ui';

export function CallupPage({ role, session, reload, setError }: { role: Role; session: AppSession; reload: any; setError: any }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [callups, setCallups] = useState<any[]>([]);
  const [localLocked, setLocalLocked] = useState(!!session.callup_confirmed);
  const [loading, setLoading] = useState(true);

  const locked = localLocked;
  const isAdmin = role === 'admin';

  async function loadCallups() {
    setLoading(true);

    const playersRes = await supabase
      .from('players')
      .select('*')
      .in('status', ['active', 'trial', 'guest'])
      .order('shirt_number', { ascending: true, nullsFirst: false });

    const allPlayers = playersRes.data || [];

    const callupsRes = await supabase
      .from('callups')
      .select('*')
      .eq('session_id', session.id);

    let existingCallups = callupsRes.data || [];

    // Si la sesión todavía no tiene convocatoria, creamos por defecto
    // todos los jugadores activos/prueba/invitados como convocados.
    // Así el coach solo tiene que quitar los NO convocados.
      if (existingCallups.length === 0 && allPlayers.length > 0) {

    const rows = allPlayers.map((player: any) => ({

      session_id: session.id,

      player_id: player.id,

      status:

        player.status === 'trial'

          ? 'trial'

          : player.status === 'guest'

            ? 'guest_not_evaluable'

            : 'called_up',

      evaluable: player.status !== 'guest',

    }));

    const { error } = await supabase

      .from('callups')

      .upsert(rows, { onConflict: 'session_id,player_id' });

    if (error) {

      setError(error.message);

    }

    const refreshed = await supabase

      .from('callups')

      .select('*')

      .eq('session_id', session.id);

    existingCallups = refreshed.data || [];

  }

  setPlayers(allPlayers);

  setCallups(existingCallups);

  setLoading(false);

}

  useEffect(() => {
    setLocalLocked(!!session.callup_confirmed);
    loadCallups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.callup_confirmed]);

  async function confirmConvocatoria() {
    const confirmed = window.confirm('¿Confirmar convocatoria? Después de confirmar, el coach no podrá modificarla.');
    if (!confirmed) return;

    // Aseguramos asistencia/evaluación para todos los convocados.
    for (const callup of callups) {
      await supabase.from('attendance').upsert(
        {
          session_id: session.id,
          player_id: callup.player_id,
          status: 'present',
        },
        { onConflict: 'session_id,player_id' }
      );

      if (callup.evaluable) {
        await supabase.from('evaluations').upsert(
          {
            session_id: session.id,
            player_id: callup.player_id,
          },
          { onConflict: 'session_id,player_id' }
        );
      }
    }

    const { error } = await supabase
      .from('sessions')
      .update({ callup_confirmed: true, callup_confirmed_at: new Date().toISOString() })
      .eq('id', session.id);

    if (error) {
      setError(error.message);
      return;
    }

    setLocalLocked(true);
    await loadCallups();
    await reload(session.id);
  }

  async function reopenConvocatoria() {
    if (!isAdmin) return;

    const confirmed = window.confirm('¿Reabrir convocatoria? Esto permitirá hacer cambios otra vez.');
    if (!confirmed) return;

    const { error } = await supabase
      .from('sessions')
      .update({ callup_confirmed: false, callup_confirmed_at: null })
      .eq('id', session.id);

    if (error) {
      setError(error.message);
      return;
    }

    setLocalLocked(false);
    await loadCallups();
    await reload(session.id);
  }

  async function togglePlayer(player: Player) {
    if (locked) return;

    setError('');
    const existing = callups.find(c => c.player_id === player.id);

    if (existing) {
      const { error } = await supabase.from('callups').delete().eq('id', existing.id);
      if (error) {
        setError(error.message);
        return;
      }

      await supabase.from('attendance').delete().eq('session_id', session.id).eq('player_id', player.id);
      await supabase.from('evaluations').delete().eq('session_id', session.id).eq('player_id', player.id);
    } else {
      const evaluable = player.status !== 'guest';
      const status = player.status === 'trial' ? 'trial' : player.status === 'guest' ? 'guest_not_evaluable' : 'called_up';

      const { error } = await supabase.from('callups').insert({
        session_id: session.id,
        player_id: player.id,
        status,
        evaluable,
      });

      if (error) {
        setError(error.message);
        return;
      }
    }

    await loadCallups();
    await reload(session.id);
  }

  if (loading) {
    return (
      <div className="stack">
        <PageTitle title={`Convocatoria: ${session.name}`} subtitle="Cargando jugadores..." />
        <Card><p>Cargando convocatoria...</p></Card>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageTitle title={`Convocatoria: ${session.name}`} subtitle="Todos aparecen convocados por defecto. Quita solo los no convocados." />

      <Card className={locked ? 'locked-card confirmed-card' : ''}>
        <p className="kicker">Estado</p>
        <h2>{locked ? 'Convocatoria confirmada' : `${callups.length} convocados`}</h2>

        {locked ? (
          <div className="stack">
            <button className="primary confirmed" disabled><CheckCircle2 size={18} /> Convocatoria confirmada</button>
            {isAdmin && <button className="secondary danger" onClick={reopenConvocatoria}><RotateCcw size={16} /> Reabrir convocatoria</button>}
          </div>
        ) : (
          <button className="primary" onClick={confirmConvocatoria}><Save size={18} /> Confirmar convocatoria</button>
        )}
      </Card>

      {players.map(player => {
        const selected = callups.some(c => c.player_id === player.id);
        return (
          <Card key={player.id}>
            <div className="row">
              <div>
                <strong>{player.shirt_number ? `${player.shirt_number}. ` : ''}{player.display_name}</strong>
                <p>{translatePosition(player.position)} · {translateStatus(player.status)}</p>
              </div>
              <button disabled={locked} className={selected ? 'chip active' : 'chip'} onClick={() => togglePlayer(player)}>
                {selected ? 'Convocado' : 'No convocado'}
              </button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
