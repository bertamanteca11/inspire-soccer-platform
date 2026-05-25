import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { supabase } from '../supabase';
import type { Attendance, Evaluation, Player, Role } from '../types';
import type { AppSession } from '../utils/appTypes';
import { translatePosition } from '../utils/formatters';
import { getRatingCounts } from '../utils/stats';
import { Card } from '../components/ui';

const ratingFields = [
  ['tactical_discipline', 'Disciplina táctica'],
  ['effort_commitment', 'Esfuerzo / compromiso'],
  ['decision_making', 'Toma de decisiones'],
  ['mentality_attitude', 'Mentalidad / actitud'],
  ['coachability', 'Capacidad de corrección'],
] as const;

const cardOptions = [
  ['none', 'Sin tarjeta'],
  ['yellow', 'Amarilla'],
  ['double_yellow', 'Doble amarilla'],
  ['straight_red', 'Roja directa'],
] as const;

const absentStatuses = ['justified_absence', 'unjustified_absence'];

export function EvaluationPage({
  role,
  session,
  players,
  evaluations,
  reload,
  setError,
  moveToNextOpenSession,
}: {
  role: Role;
  session: AppSession;
  players: Player[];
  evaluations: Evaluation[];
  reload: any;
  setError: any;
  moveToNextOpenSession?: any;
}) {
  const [index, setIndex] = useState(0);
  const [cardType, setCardType] = useState('none');
  const [cardReason, setCardReason] = useState('');
  const [suspensionMatches, setSuspensionMatches] = useState('1');
  const [localEvaluations, setLocalEvaluations] = useState<Evaluation[]>(evaluations || []);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [localLocked, setLocalLocked] = useState(!!session.evaluation_confirmed);

  const locked = localLocked;
  const isAdmin = role === 'admin';

  useEffect(() => setLocalEvaluations(evaluations || []), [evaluations]);
  useEffect(() => setLocalLocked(!!session.evaluation_confirmed), [session.evaluation_confirmed]);
  useEffect(() => { loadAttendance(); }, [session.id]);

  async function loadAttendance() {
    const { data } = await supabase.from('attendance').select('*').eq('session_id', session.id);
    setAttendance(data || []);
  }

  const evaluablePlayers = useMemo(() => {
    return players.filter((p: Player) => {
      const att = attendance.find((a: Attendance) => a.player_id === p.id);
      return !absentStatuses.includes(att?.status || '');
    });
  }, [players, attendance]);

  const player = evaluablePlayers[index] || evaluablePlayers[0];
  const ev = localEvaluations.find((e: Evaluation) => e.player_id === player?.id);
  const counters = useMemo(() => getRatingCounts(localEvaluations), [localEvaluations]);

  useEffect(() => {
    if (index >= evaluablePlayers.length) setIndex(0);
  }, [index, evaluablePlayers.length]);

  if (!session.callup_confirmed) return <div className="stack"><Card><p className="kicker">Evaluación</p><h2>{session.name}</h2><p>Primero hay que confirmar la convocatoria.</p></Card></div>;
  if (!session.attendance_confirmed) return <div className="stack"><Card><p className="kicker">Evaluación</p><h2>{session.name}</h2><p>Primero hay que confirmar la asistencia. Así los ausentes quedan fuera de evaluación y no cuentan en las medias.</p></Card></div>;
  if (evaluablePlayers.length === 0) return <div className="stack"><Card><p className="kicker">Evaluación</p><h2>No hay jugadores para evaluar</h2><p>Los jugadores ausentes no aparecen en evaluación ni cuentan en las medias.</p></Card></div>;

  async function ensureEval(): Promise<Evaluation | null> {
    if (ev) return ev;

    const { data, error } = await supabase
      .from('evaluations')
      .insert({ session_id: session.id, player_id: player.id })
      .select('*')
      .single();

    if (error) {
      setError(error.message);
      return null;
    }

    setLocalEvaluations(prev => [...prev, data as Evaluation]);
    return data as Evaluation;
  }

  async function update(field: string, value: number | string | boolean) {
    if (locked) return false;
    setError('');

    const currentValue = Number((ev as any)?.[field]);
    const highLimit = session.high_rating_limit || 6;
    const lowLimit = session.low_rating_limit || 3;

    if (typeof value === 'number') {
      const isNewHigh = value >= 4;
      const wasHigh = currentValue >= 4;
      const isNewLow = value <= 2;
      const wasLow = currentValue > 0 && currentValue <= 2;

      if (isNewHigh && !wasHigh && counters.high[field] >= highLimit) {
        const msg = 'Has llegado al máximo de jugadores con puntuación alta en esta categoría. Cambia una evaluación anterior para continuar.';
        setError(msg); alert(msg); return false;
      }

      if (isNewLow && !wasLow && counters.low[field] >= lowLimit) {
        const msg = 'Has llegado al máximo de jugadores con puntuación baja en esta categoría. Cambia una evaluación anterior para continuar.';
        setError(msg); alert(msg); return false;
      }
    }

    const record = await ensureEval();
    if (!record) return false;

    const { data, error } = await supabase
      .from('evaluations')
      .update({ [field]: value, submitted_at: new Date().toISOString() })
      .eq('id', record.id)
      .select('*')
      .single();

    if (error) { setError(cleanDbError(error.message)); return false; }

    setLocalEvaluations(prev => [...prev.filter(e => e.id !== data.id), data as Evaluation]);
    return true;
  }

  async function saveCardIfNeeded() {
    if (locked || cardType === 'none') return true;

    if (cardType !== 'yellow' && !cardReason.trim()) {
      setError('Si marcas una roja o doble amarilla debes añadir el motivo.');
      return false;
    }

    const { error } = await supabase.from('cards').insert({
      session_id: session.id,
      player_id: player.id,
      type: cardType,
      reason: cardReason || null,
    });

    if (error) {
      setError(error.message);
      return false;
    }

    if (cardType === 'straight_red' || cardType === 'double_yellow') {
      const matches = Math.max(1, Number(suspensionMatches) || 1);
      const source = cardType === 'straight_red' ? 'straight_red' : 'double_yellow';

      const suspension = await supabase.from('suspensions').insert({
        player_id: player.id,
        source,
        matches_total: matches,
        matches_served: 0,
        status: 'active',
        reason: cardReason || `Sanción por ${cardType}`,
        created_from_session_id: session.id,
      });

      if (suspension.error) {
        setError(suspension.error.message);
        return false;
      }
    }

    await supabase.rpc('create_yellow_accumulation_suspensions');

    setCardType('none');
    setCardReason('');
    setSuspensionMatches('1');
    return true;
  }

  async function next() {
    const okCard = await saveCardIfNeeded();
    if (!okCard) return;

    await update('evaluated', true);
    setIndex(current => (current + 1) % evaluablePlayers.length);
  }

  async function confirmEvaluation() {
    const confirmed = window.confirm('¿Confirmar evaluación? El coach no podrá modificarla después.');
    if (!confirmed) return;

    await supabase.rpc('create_yellow_accumulation_suspensions');

    const { error } = await supabase
      .from('sessions')
      .update({ evaluation_confirmed: true, evaluation_confirmed_at: new Date().toISOString() })
      .eq('id', session.id);

    if (error) {
      setError(error.message);
      return;
    }

    setLocalLocked(true);
    if (moveToNextOpenSession) await moveToNextOpenSession();
    else await reload(session.id);
  }

  async function reopenEvaluation() {
    if (!isAdmin) return;
    const confirmed = window.confirm('¿Reabrir evaluación? Esto permitirá hacer cambios otra vez.');
    if (!confirmed) return;

    const { error } = await supabase
      .from('sessions')
      .update({ evaluation_confirmed: false, evaluation_confirmed_at: null })
      .eq('id', session.id);

    if (error) { setError(error.message); return; }

    setLocalLocked(false);
    await reload(session.id);
  }

  const current: any = ev || { tactical_discipline: 3, effort_commitment: 3, decision_making: 3, mentality_attitude: 3, coachability: 3, comment: '' };
  const isMatch = ['friendly_match', 'league_match', 'tryout', 'scrimmage'].includes(session.type);
  const highLimit = session.high_rating_limit || 6;
  const lowLimit = session.low_rating_limit || 3;

  return (
    <div className="stack">
      <Card className={locked ? 'locked-card confirmed-card' : ''}>
        <p className="kicker">Evaluación</p>
        <h2>{session.name}</h2>
        <p className="muted">Los jugadores ausentes no aparecen aquí ni cuentan en las medias.</p>

        {locked ? (
          <div className="stack">
            <button className="primary confirmed" disabled><CheckCircle2 size={18} /> Evaluación confirmada</button>
            {isAdmin && <button className="secondary danger" onClick={reopenEvaluation}><RotateCcw size={16} /> Reabrir evaluación</button>}
          </div>
        ) : (
          <button className="primary" onClick={confirmEvaluation}>Confirmar evaluación</button>
        )}
      </Card>

      <div className="progress">{index + 1} / {evaluablePlayers.length}</div>

      <Card>
        <div className="search-label"><Search size={16} /> Ir a jugador</div>
        <select value={index} onChange={e => setIndex(Number(e.target.value))}>
          {evaluablePlayers.map((p: Player, i: number) => <option key={p.id} value={i}>{i + 1}. {p.display_name}</option>)}
        </select>
      </Card>

      <Card>
        <div className="row">
          <div><p className="kicker">Jugador</p><h2>{player.display_name}</h2><p>{translatePosition(player.position)}</p></div>
          <div className="score-badge">{current.total_score || '-'}</div>
        </div>
      </Card>

      {ratingFields.map(([field, label]) => (
        <Card key={field}>
          <div className="row rating-header">
            <strong>{label}</strong>
            <div className="limit-stack">
              <span className={counters.high[field] >= highLimit ? 'limit danger' : 'limit'}>Altas: {counters.high[field]}/{highLimit}</span>
              <span className={counters.low[field] >= lowLimit ? 'limit danger' : 'limit'}>Bajas: {counters.low[field]}/{lowLimit}</span>
            </div>
          </div>
          <div className="rating">
            {[1, 2, 3, 4, 5].map(n => (
              <button disabled={locked} key={n} className={current[field] === n ? 'rate active' : 'rate'} onClick={() => update(field, n)}>{n}</button>
            ))}
          </div>
        </Card>
      ))}

      {isMatch && (
        <Card>
          <strong>Tarjetas</strong>
          <select disabled={locked} value={cardType} onChange={e => setCardType(e.target.value)}>
            {cardOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>

          {cardType !== 'none' && (
            <>
              <textarea disabled={locked} placeholder="Motivo de la tarjeta..." value={cardReason} onChange={e => setCardReason(e.target.value)} />
              {(cardType === 'straight_red' || cardType === 'double_yellow') && (
                <input
                  disabled={locked}
                  type="number"
                  min="1"
                  placeholder="Partidos de sanción"
                  value={suspensionMatches}
                  onChange={e => setSuspensionMatches(e.target.value)}
                />
              )}
            </>
          )}
        </Card>
      )}

      <Card>
        <strong>Comentario corto</strong>
        <textarea disabled={locked} defaultValue={current.comment || ''} onBlur={e => update('comment', e.target.value)} placeholder="Comentario corto..." />
      </Card>

      <button className="primary" onClick={next} disabled={locked}>Siguiente jugador <ChevronRight size={18} /></button>
      <button className="secondary" disabled={index === 0 || locked} onClick={() => setIndex(i => Math.max(0, i - 1))}>Anterior</button>
    </div>
  );
}

function cleanDbError(message: string) {
  if (message.includes('Maximum high ratings')) return 'Has llegado al máximo de jugadores con puntuación alta en esta categoría. Cambia una evaluación anterior para continuar.';
  if (message.includes('Maximum low ratings')) return 'Has llegado al máximo de jugadores con puntuación baja en esta categoría. Cambia una evaluación anterior para continuar.';
  if (message.includes('locked')) return 'Esta sesión está bloqueada. Solo un administrador puede editarla.';
  return message;
}
