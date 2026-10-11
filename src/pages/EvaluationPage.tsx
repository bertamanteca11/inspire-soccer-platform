import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { supabase } from '../supabase';
import type { Attendance, Evaluation, Player, Role } from '../types';
import type { AppSession } from '../utils/appTypes';
import { translatePosition } from '../utils/formatters';
import { getRatingCounts } from '../utils/stats';
import { Card } from '../components/ui';

const matchRatingFields = [
  ['tactical_discipline', 'Disciplina táctica'],
  ['effort_commitment', 'Esfuerzo / compromiso'],
  ['decision_making', 'Toma de decisiones'],
  ['mentality_attitude', 'Mentalidad / actitud'],
  ['coachability', 'Capacidad de corrección'],
] as const;

const trainingRatingFields = [
  ['tactical_discipline', 'A. Esfuerzo / Intensidad', {
    1: 'Indiferente / Desinteresado',
    3: 'Aceptable / Normal',
    5: 'Máximo esfuerzo, ritmo acelerado, intensidad',
  }],
  ['effort_commitment', 'B. Actitud / Lenguaje corporal', {
    1: 'Negativo, quejoso, desinteresado',
    3: 'Neutral',
    5: 'Positivo, anima a sus compañeros',
  }],
  ['decision_making', 'C. Concentración / Capacidad de aprendizaje', {
    1: 'No escucha, distraído',
    3: 'Promedio',
    5: 'Totalmente comprometido, aplica correcciones de inmediato',
  }],
  ['mentality_attitude', 'D. Nivel competitivo', {
    1: 'Evita duelos, pasivo',
    3: 'Compite con normalidad',
    5: 'Muy competitivo, motiva a los demás',
  }],
] as const;

const cardOptions = [
  ['none', 'Sin tarjeta'],
  ['yellow', 'Amarilla'],
  ['double_yellow', 'Doble amarilla'],
  ['straight_red', 'Roja directa'],
] as const;

const DEFAULT_SCORE = 3;
const ALL_SCORE_FIELDS = ['tactical_discipline','effort_commitment','decision_making','mentality_attitude','coachability'] as const;

const absentStatuses = ['justified_absence', 'unjustified_absence', 'injured', 'injured_present', 'injured_justified_absence', 'injured_unjustified_absence'];

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
  const [mode, setMode] = useState<'category' | 'player'>('category');
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [comments, setComments] = useState<Record<string,string>>({});
  const [savedNotice, setSavedNotice] = useState('');
  const [cardType, setCardType] = useState('none');
  const [cardReason, setCardReason] = useState('');
  const [suspensionMatches, setSuspensionMatches] = useState('1');
  const [localEvaluations, setLocalEvaluations] = useState<Evaluation[]>(evaluations || []);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [localLocked, setLocalLocked] = useState(!!session.evaluation_confirmed);

  const locked = localLocked;
  const isAdmin = role === 'admin';

  useEffect(() => { setLocalEvaluations(evaluations || []); setComments(Object.fromEntries((evaluations || []).map(e => [e.player_id, e.comment || '']))); }, [evaluations]);
  useEffect(() => setLocalLocked(!!session.evaluation_confirmed), [session.evaluation_confirmed]);
  useEffect(() => { loadAttendance(); }, [session.id]);

  async function loadAttendance() {
    const { data } = await supabase.from('attendance').select('*').eq('session_id', session.id);
    setAttendance(data || []);
  }

  const evaluablePlayers = useMemo(() => {
    return players.filter((p: Player) => {
      const att = attendance.find((a: Attendance) => a.player_id === p.id);
      return !!att && ['present','late','justified_late'].includes(att.status);
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

  async function ensureEval(target: Player = player): Promise<Evaluation | null> {
    const existing = localEvaluations.find(e => e.player_id === target.id);
    if (existing) return existing;

    const { data, error } = await supabase
      .from('evaluations')
      .insert({ session_id: session.id, player_id: target.id })
      .select('*')
      .single();

    if (error) {
      setError(error.message);
      return null;
    }

    setLocalEvaluations(prev => [...prev, data as Evaluation]);
    return data as Evaluation;
  }

  async function update(field: string, value: number | string | boolean, target: Player = player) {
    if (locked) return false;
    setError('');

    const currentValue = Number((localEvaluations.find(e => e.player_id === target.id) as any)?.[field]);
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

    const record = await ensureEval(target);
    if (!record) return false;

    const { data, error } = await supabase
      .from('evaluations')
      .update({ [field]: value, submitted_at: new Date().toISOString() })
      .eq('id', record.id)
      .select('*')
      .single();

    if (error) { setError(cleanDbError(error.message)); return false; }

    setLocalEvaluations(prev => [...prev.filter(e => e.id !== data.id), data as Evaluation]);
    setSavedNotice('Cambios guardados correctamente');
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
    if ((comments[player.id] ?? '') !== (ev?.comment ?? '')) {
      const okComment = await update('comment', comments[player.id] ?? '', player);
      if (!okComment) return;
    }
    const okCard = await saveCardIfNeeded();
    if (!okCard) return;

    const saved = await update('evaluated', true);
    if (!saved) return;
    setIndex(current => (current + 1) % evaluablePlayers.length);
  }

  async function confirmEvaluation() {
    const confirmed = window.confirm('¿Confirmar evaluación? El coach no podrá modificarla después.');
    if (!confirmed) return;

    // Persist the displayed default 3 for every eligible player before locking.
    // Never overwrite existing scores (including values 1, 2, 4 or 5).
    setError('');
    const { data: latest, error: readError } = await supabase.from('evaluations').select('*').eq('session_id', session.id);
    if (readError) { setError('No se pudieron revisar las evaluaciones: ' + readError.message); return; }
    const existingByPlayer = new Map((latest || []).map((record: any) => [record.player_id, record]));
    for (const target of evaluablePlayers) {
      const existing = existingByPlayer.get(target.id) as any;
      const defaults: Record<string, number> = {};
      for (const field of ALL_SCORE_FIELDS) {
        if (existing?.[field] == null) defaults[field] = DEFAULT_SCORE;
      }
      if (!existing) {
        const { error } = await supabase.from('evaluations').insert({session_id:session.id, player_id:target.id, ...defaults, evaluated:true});
        if (error) { setError('No se pudo guardar la evaluación de ' + target.display_name + ': ' + error.message); return; }
      } else if (Object.keys(defaults).length || !existing.evaluated) {
        const { error } = await supabase.from('evaluations').update({...defaults, evaluated:true}).eq('id', existing.id);
        if (error) { setError('No se pudo completar la evaluación de ' + target.display_name + ': ' + error.message); return; }
      }
    }
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
  const activeRatingFields = session.type === 'training' ? trainingRatingFields : matchRatingFields;
  const highLimit = session.high_rating_limit || 6;
  const lowLimit = session.low_rating_limit || 3;

  return (
    <div className="stack">
      <Card className={locked ? 'locked-card confirmed-card' : ''}>
        <p className="kicker">Evaluación</p>
        <h2>{session.name}</h2>
        <p className="muted">La puntuación 3 se aplica por defecto a las cualidades sin evaluar y se guarda al confirmar. Solo aparecen jugadores convocados con asistencia registrada como presente o tarde. Los lesionados presentes no se evalúan.</p>

        {locked ? (
          <div className="stack">
            <button className="primary confirmed" disabled><CheckCircle2 size={18} /> Evaluación confirmada</button>
            {isAdmin && <button className="secondary danger" onClick={reopenEvaluation}><RotateCcw size={16} /> Reabrir evaluación</button>}
          </div>
        ) : (
          <button className="primary" onClick={confirmEvaluation}>Confirmar evaluación</button>
        )}
      </Card>

      {savedNotice && <div role="status" className="save-feedback success">{savedNotice}</div>}
      <Card><div className="row"><strong>Orden de evaluación</strong><select aria-label="Orden de evaluación" value={mode} onChange={e => setMode(e.target.value as 'category'|'player')}><option value="category">Por cualidad (todos los jugadores)</option><option value="player">Por jugador (todas las cualidades)</option></select></div></Card>
      {mode === 'category' ? <>
        <Card><strong>Cualidad que estás evaluando</strong><select value={categoryIndex} onChange={e => setCategoryIndex(Number(e.target.value))}>{(session.type === 'training' ? trainingRatingFields : matchRatingFields).map(([field,label],i) => <option key={field} value={i}>{label}</option>)}</select></Card>
        {(session.type === 'training' ? trainingRatingFields : matchRatingFields).slice(categoryIndex,categoryIndex+1).map(([field,label]) => <Card key={field}><h2>{label}</h2><p className="muted">Valora esta cualidad en todos los jugadores antes de pasar a la siguiente.</p>{evaluablePlayers.map(p => {const rating = localEvaluations.find(e => e.player_id === p.id); return <div key={p.id} className="rating-player-row"><strong>{p.display_name}</strong><div className="rating">{[1,2,3,4,5].map(n => <button key={n} disabled={locked} className={((rating as any)?.[field] ?? DEFAULT_SCORE) === n ? 'rate active' : 'rate'} onClick={() => update(field,n,p)}>{n}</button>)}</div></div>})}</Card>)}
        <div className="row"><button className="secondary" disabled={categoryIndex===0} onClick={()=>setCategoryIndex(i=>i-1)}>Cualidad anterior</button><button className="primary" onClick={()=>{if(categoryIndex < (session.type==='training'?trainingRatingFields:matchRatingFields).length-1)setCategoryIndex(i=>i+1);else setMode('player')}}>{categoryIndex < (session.type==='training'?trainingRatingFields:matchRatingFields).length-1 ? 'Siguiente cualidad' : 'Revisar comentarios'}</button></div>
      </> : <>
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
        <div className="row" style={{marginTop:12}}><button className="secondary" disabled={locked} onClick={()=>setIndex(i=>(i-1+evaluablePlayers.length)%evaluablePlayers.length)}>← Anterior</button><button className="primary" disabled={locked} onClick={next}>Siguiente jugador →</button></div>
      </Card>

      {activeRatingFields.map(([field, label, description]) => (
        <Card key={field}>
          <div className="row rating-header">
            <strong>{label}</strong>
            {description && (
  <div className="evaluation-help">
    <p><strong>1</strong> — {description[1]}</p>
    <p><strong>3</strong> — {description[3]}</p>
    <p><strong>5</strong> — {description[5]}</p>
  </div>
)}
            <div className="limit-stack">
              <span className={counters.high[field] >= highLimit ? 'limit danger' : 'limit'}>Altas: {counters.high[field]}/{highLimit}</span>
              <span className={counters.low[field] >= lowLimit ? 'limit danger' : 'limit'}>Bajas: {counters.low[field]}/{lowLimit}</span>
            </div>
          </div>
          <div className="rating">
            {[1, 2, 3, 4, 5].map(n => (
              <button disabled={locked} key={n} className={(current[field] ?? DEFAULT_SCORE) === n ? 'rate active' : 'rate'} onClick={() => update(field, n)}>{n}</button>
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

      <Card key={'comment-'+player.id}>
        <strong>Comentario de {player.display_name}</strong>
        <textarea disabled={locked} value={comments[player.id] ?? current.comment ?? ''} onChange={e => setComments(prev => ({...prev,[player.id]:e.target.value}))} onBlur={e => {if ((comments[player.id] ?? '') !== (ev?.comment ?? '')) void update('comment',comments[player.id] ?? '',player)}} placeholder="Comentario individual..." />
        <button className="secondary" disabled={locked} onClick={()=>void update('comment',comments[player.id] ?? '',player)}>Guardar comentario</button>
      </Card>

      <button className="primary" onClick={next} disabled={locked}>Siguiente jugador <ChevronRight size={18} /></button>
      <button className="secondary" disabled={locked} onClick={() => setIndex(i => (i - 1 + evaluablePlayers.length) % evaluablePlayers.length)}>Anterior</button>
      </>}
    </div>
  );
}

function cleanDbError(message: string) {
  if (message.includes('Maximum high ratings')) return 'Has llegado al máximo de jugadores con puntuación alta en esta categoría. Cambia una evaluación anterior para continuar.';
  if (message.includes('Maximum low ratings')) return 'Has llegado al máximo de jugadores con puntuación baja en esta categoría. Cambia una evaluación anterior para continuar.';
  if (message.includes('locked')) return 'Esta sesión está bloqueada. Solo un administrador puede editarla.';
  return message;
}
