import { workflowAction } from '../lib/workflows';
import { useWorkflowAccess } from '../utils/useWorkflowAccess';
import { sortPlayersByJersey } from '../utils/playerOrder';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { supabase } from '../supabase';
import type { Attendance, Evaluation, Player, Role } from '../types';
import type { AppSession } from '../utils/appTypes';
import { translatePosition } from '../utils/formatters';
import { getRatingCounts } from '../utils/stats';
import { isFieldNA, evaluationTotal, fieldScore } from '../utils/evaluationScores';
import { eligibilityReason, distinctRows, isSportingActivity, newEvaluationDraft, ratingLimit, type EligibilityRow } from '../utils/evaluationEligibility';
import { readPerformancePages } from '../lib/performance';
import { Card } from '../components/ui';
import { SessionHeading } from '../components/SessionHeading';

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
  ['coachability', 'E. Capacidad de corrección (quinta calidad almacenada)'],
] as const;

const cardOptions = [
  ['none', 'Sin tarjeta'],
  ['yellow', 'Amarilla'],
  ['double_yellow', 'Doble amarilla'],
  ['straight_red', 'Roja directa'],
] as const;


const ALL_SCORE_FIELDS = ['tactical_discipline','effort_commitment','decision_making','mentality_attitude','coachability'] as const;


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
  const [dirtyComments, setDirtyComments] = useState<Record<string,boolean>>({});
  const [savedNotice, setSavedNotice] = useState('');
  const [savedCards, setSavedCards] = useState<any[]>([]);
  const [savingCard, setSavingCard] = useState(false);
  const [cardDrafts, setCardDrafts] = useState<Record<string, {type:string;reason:string;matches:string}>>({});
  const [localEvaluations, setLocalEvaluations] = useState<Evaluation[]>(evaluations || []);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [callups, setCallups] = useState<EligibilityRow[]>([]);
  const [eligibilityLoading, setEligibilityLoading] = useState(true);
  const [eligibilityError, setEligibilityError] = useState('');
  const eligibilityRequest = useRef(0);
  const [localLocked, setLocalLocked] = useState(!!session.evaluation_confirmed);
  const [adminRecordsMode, setAdminRecordsMode] = useState(false);
  const [roster, setRoster] = useState<Player[]>([]);
  const [recordIndex, setRecordIndex] = useState(0);
  const [recordSaving, setRecordSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmationPending = useRef(false);

  const access = useWorkflowAccess(session.id, 'evaluation', localLocked);
  const locked = localLocked || !['admin','coach'].includes(role) || !access.canEdit;
  const recordsOnlyCompleted = Boolean((session as AppSession & { records_only_confirmed?: boolean }).records_only_confirmed);
  const isAdmin = role === 'admin';

  useEffect(() => { setLocalEvaluations((evaluations || []).filter(e => e.session_id === session.id)); }, [evaluations, session.id]);
  useEffect(() => { setComments({}); setDirtyComments({}); setCardDrafts({}); }, [session.id]);
  // Initialize comments without overwriting edits or recently saved text with stale props.
  useEffect(() => {
    setComments(prev => {
      const next = { ...prev };
      for (const e of localEvaluations) {
        if (!(e.player_id in next)) next[e.player_id] = e.comment || '';
      }
      return next;
    });
  }, [localEvaluations]);
  useEffect(() => { void loadCards(); }, [session.id]);
  useEffect(() => setLocalLocked(!!session.evaluation_confirmed), [session.id, session.evaluation_confirmed]);
  useEffect(() => { void loadAttendance(); return () => { eligibilityRequest.current++; }; }, [session.id]);
  useEffect(() => { setAdminRecordsMode(false); setRecordIndex(0); }, [session.id]);
  useEffect(() => {
    if (!isAdmin || !adminRecordsMode) return;
    let cancelled = false;
    supabase.from('players').select('*').order('display_name').then(({data,error}) => {
      if (cancelled) return;
      if (error) setError(error.message);
      else setRoster((data || []) as Player[]);
    });
    return () => { cancelled = true; };
  }, [isAdmin, adminRecordsMode, session.id]);

  useEffect(() => {
    if (!isAdmin || !adminRecordsMode) return;
    let cancelled = false;
    supabase.from('evaluations').select('*').eq('session_id',session.id).then(({data,error}) => {
      if (cancelled) return;
      if (error) { setError(error.message); return; }
      setLocalEvaluations(prev => {
        const byId = new Map(prev.map(e => [e.player_id,e]));
        for (const row of (data || []) as Evaluation[]) byId.set(row.player_id,row);
        return [...byId.values()];
      });
    });
    return () => { cancelled = true; };
  }, [isAdmin,adminRecordsMode,session.id]);

  async function loadCards() {
    const { data, error } = await supabase.from('cards').select('*').eq('session_id', session.id);
    if (error) setError(error.message); else setSavedCards(data || []);
  }

  async function loadAttendance() {
    const request = ++eligibilityRequest.current;
    setEligibilityLoading(true); setEligibilityError(''); setAttendance([]); setCallups([]);
    try {
      const [visits, calls] = await Promise.all([
        readPerformancePages<Attendance>((a,b) => supabase.from('attendance').select('*').eq('session_id',session.id).order('id').range(a,b)),
        readPerformancePages<EligibilityRow>((a,b) => supabase.from('callups').select('*').eq('session_id',session.id).order('id').range(a,b)),
      ]);
      if (request === eligibilityRequest.current) { setAttendance(visits); setCallups(calls); }
    } catch (failure) { if (request === eligibilityRequest.current) setEligibilityError(String(failure)); }
    finally { if (request === eligibilityRequest.current) setEligibilityLoading(false); }
  }

  const evaluablePlayers = useMemo(() => {
    return sortPlayersByJersey(players).filter((p: Player) => {
      return !eligibilityReason(session.id,p.id,callups,attendance)
        && distinctRows(localEvaluations).filter(e => e.session_id === session.id && e.player_id === p.id).length <= 1;
    });
  }, [players, attendance, callups, session.id, localEvaluations]);

  const player = evaluablePlayers[index] || evaluablePlayers[0];
  const ev = localEvaluations.find((e: Evaluation) => e.player_id === player?.id);
  const existingPlayerCard = savedCards.find(c => c.player_id === player?.id);
  const cardDraft = cardDrafts[player?.id] || {type:existingPlayerCard?.type || 'none', reason:existingPlayerCard?.reason || '', matches:'1'};
  const cardType = cardDraft.type;
  const cardReason = cardDraft.reason;
  const suspensionMatches = cardDraft.matches;
  function setCardDraft(playerId: string, patch: Partial<{type:string;reason:string;matches:string}>) {
    setCardDrafts(prev => ({...prev, [playerId]: {...(prev[playerId] || {type:'none',reason:'',matches:'1'}), ...patch}}));
  }
  const counters = useMemo(() => getRatingCounts(distinctRows(localEvaluations).filter(e => evaluablePlayers.some(p => p.id === e.player_id))), [localEvaluations,evaluablePlayers]);
  const recordPlayers = sortPlayersByJersey(roster);
  const recordPlayer = recordPlayers[recordIndex];
  const recordCard = savedCards.find(c => c.player_id === recordPlayer?.id);
  const recordDraft = recordPlayer ? (cardDrafts[recordPlayer.id] || {type:recordCard?.type || 'none',reason:recordCard?.reason || '',matches:'1'}) : null;

  useEffect(() => {
    if (index >= evaluablePlayers.length) setIndex(0);
  }, [index, evaluablePlayers.length]);

  if (!session.callup_confirmed) return <div className="stack"><SessionHeading session={session}/><Card><p>Primero hay que confirmar la convocatoria.</p></Card></div>;
  if (!session.attendance_confirmed) return <div className="stack"><SessionHeading session={session}/><Card><p>Primero hay que confirmar la asistencia.</p></Card></div>;
  if (eligibilityLoading) return <div className="stack"><SessionHeading session={session}/><Card><p role="status">Verificando convocatoria y asistencia…</p></Card></div>;
  if (role !== 'admin' && role !== 'coach') return <div className="stack"><SessionHeading session={session}/><Card><p>Solo lectura: consulta las evaluaciones en Resumen o Historial.</p></Card></div>;
  if (eligibilityError) return <div className="stack"><SessionHeading session={session}/><Card><p role="alert">No se pudo verificar la elegibilidad: {eligibilityError}</p></Card></div>;
  if (!isSportingActivity(session) || !['planned','completed'].includes(session.status)) return <div className="stack"><SessionHeading session={session}/><Card><p role="alert">Esta sesión no admite evaluación operativa. Sus registros se conservan en el historial.</p></Card></div>;
  if (evaluablePlayers.length === 0 && !adminRecordsMode) return <div className="stack"><SessionHeading session={session}/><Card><h2>No hay jugadores para evaluar</h2><p>No hay participantes con elegibilidad verificable. Revisa convocatoria, asistencia y posibles evaluaciones duplicadas. Los originales se conservan.</p></Card></div>;

  async function ensureEval(target: Player = player): Promise<Evaluation | null> {
    if (locked) return null;
    if (!adminRecordsMode && eligibilityReason(session.id,target.id,callups,attendance)) { setError('No se ha verificado la elegibilidad del jugador.'); return null; }
    if (distinctRows(localEvaluations).filter(e => e.player_id === target.id).length > 1) { setError('Evaluaciones duplicadas: revisar registros originales.'); return null; }
    const existing = localEvaluations.find(e => e.player_id === target.id);
    if (existing) return existing;

    const { data, error } = await supabase
      .from('evaluations')
      .insert({ session_id: session.id, player_id: target.id, ...newEvaluationDraft(), ...(adminRecordsMode ? {not_applicable:true} : {}) })
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
    if (locked || confirmationPending.current) return false;
    setError('');

    const currentValue = fieldScore(localEvaluations.find(e => e.player_id === target.id),field);
    let highLimit: number, lowLimit: number;
    try { highLimit = ratingLimit(session.high_rating_limit,6); lowLimit = ratingLimit(session.low_rating_limit,3); }
    catch (failure) { setError(String(failure)); return false; }

    if (typeof value === 'number') {
      if (!Number.isInteger(value) || value < 1 || value > 5) return false;
      const isNewHigh = value >= 4;
      const wasHigh = currentValue !== null && currentValue >= 4;
      const isNewLow = value <= 2;
      const wasLow = currentValue !== null && currentValue <= 2;

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

    // Selecting a numeric score reverses N/A before final confirmation.
    // Both values are saved in one request so they cannot become inconsistent.
    const previous = localEvaluations.find(e => e.player_id === target.id) as any;
    const patch = ALL_SCORE_FIELDS.includes(field as any)
      ? { [field]: value, not_applicable: false, na_fields: {...((previous || record)?.na_fields || {}), [field]: false}, submitted_at: new Date().toISOString() }
      : { [field]: value, submitted_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from('evaluations')
      .update(patch)
      .eq('id', record.id)
      .select('*')
      .single();

    if (error) { setError(cleanDbError(error.message)); return false; }

    setLocalEvaluations(prev => [...prev.filter(e => e.id !== data.id), data as Evaluation]);
    if (field === 'comment') { setComments(prev => ({ ...prev, [target.id]: String(value) })); setDirtyComments(prev => ({...prev, [target.id]: false})); }
    setSavedNotice('Cambios guardados correctamente');
    return true;
  }

  async function setQualityNA(field: string, target: Player = player) {
    if (locked || confirmationPending.current) return false;
    setError('');
    const record = await ensureEval(target);
    if (!record) return false;
    const flags = {...((record as any).na_fields || {})};
    flags[field] = true; // Only a numeric selection can restore a numeric value.
    const {data, error} = await supabase.from('evaluations')
      .update({na_fields:flags, submitted_at:new Date().toISOString()})
      .eq('id',record.id).select('*').single();
    if (error) {setError(cleanDbError(error.message)); return false;}
    setLocalEvaluations(prev => [...prev.filter(e => e.id !== data.id), data as Evaluation]);
    setSavedNotice('Cambios guardados correctamente');
    return true;
  }

  // A player has one editable card selection per match. Re-entering the
  // player must NEVER insert another card for the same selection.
  async function saveCardIfNeeded(target: Player = player) {
    const draft = cardDrafts[target.id];
    if (!draft) return true; // No changes to the saved selection.
    if (locked || savingCard) return false;
    const existing = savedCards.filter(c => c.player_id === target.id);
    if (existing.length > 1) {
      setError(`Hay ${existing.length} tarjetas registradas para ${target.display_name}. Revísalas antes de modificar el desplegable para evitar alterar tarjetas históricas.`);
      return false;
    }
    const old = existing[0];
    if (draft.type === (old?.type || 'none') && (draft.reason || '') === (old?.reason || '')) {
      setCardDrafts(prev => { const next = {...prev}; delete next[target.id]; return next; });
      return true;
    }
    if (draft.type !== 'none' && draft.type !== 'yellow' && !draft.reason.trim()) {
      setError('Si marcas una roja o doble amarilla debes añadir el motivo.');
      return false;
    }
    // Changing a red card can affect a separate suspension record; avoid
    // silently leaving inconsistent disciplinary data.
    if (old && ['straight_red','double_yellow'].includes(old.type) && draft.type !== old.type) {
      setError('Esta tarjeta roja ya tiene un registro. Para cambiarla, revisa también su sanción antes de editarla.');
      return false;
    }
    setSavingCard(true);
    setError('');
    try {
      let error: any = null;
      if (draft.type === 'none') {
        if (old) ({ error } = await supabase.from('cards').delete().eq('id', old.id));
      } else if (old) {
        ({ error } = await supabase.from('cards').update({type:draft.type, reason:draft.reason || null}).eq('id', old.id));
      } else {
        ({ error } = await supabase.from('cards').insert({session_id:session.id, player_id:target.id, type:draft.type, reason:draft.reason || null}));
      }
      if (error) { setError(error.message); return false; }
      // Refresh before clearing the draft so the select keeps the saved value.
      const { data, error: readError } = await supabase.from('cards').select('*').eq('session_id', session.id);
      if (readError) { setError(readError.message); return false; }
      setSavedCards(data || []);
      setCardDrafts(prev => { const next = {...prev}; delete next[target.id]; return next; });
      if (!old && ['straight_red','double_yellow'].includes(draft.type)) {
        const { error: suspensionError } = await supabase.from('suspensions').insert({
          player_id:target.id,
          source:draft.type === 'straight_red' ? 'straight_red' : 'double_yellow',
          matches_total:Math.max(1, Number(draft.matches) || 1),
          matches_served:0,
          status:'active',
          reason:draft.reason || `Sanción por ${draft.type}`,
          created_from_session_id:session.id,
        });
        if (suspensionError) { setError('Tarjeta guardada, pero no se pudo crear la sanción: ' + suspensionError.message); return false; }
      }
      if (draft.type === 'yellow' && !old) {
        const accumulation = await supabase.rpc('create_yellow_accumulation_suspensions');
        if (accumulation.error) setError('Tarjeta guardada, pero revisa la acumulación: ' + accumulation.error.message);
      }
      setSavedNotice('Tarjeta guardada para ' + target.display_name);
      return true;
    } finally {
      setSavingCard(false);
    }
  }

  // Save drafts on navigation without finalizing the session evaluation.
  async function saveComment(target: Player) {
    if (locked) return false;
    const text = comments[target.id] ?? '';
    const existing = localEvaluations.find(e => e.player_id === target.id);
    if (text === (existing?.comment ?? '')) return true;

    setError('');
    const record = await ensureEval(target);
    if (!record) return false;

    const { data, error } = await supabase
      .from('evaluations')
      .update({ comment: text, submitted_at: new Date().toISOString() })
      .eq('id', record.id)
      .select('*')
      .single();

    if (error) {
      setError('No se pudo guardar el comentario: ' + cleanDbError(error.message));
      return false;
    }

    setLocalEvaluations(prev => [...prev.filter(e => e.id !== data.id), data as Evaluation]);
    setDirtyComments(prev => ({ ...prev, [target.id]: false }));
    setSavedNotice('Comentario guardado correctamente');
    return true;
  }

  async function saveRecordAndNavigate(nextIndex?: number) {
    if (!recordPlayer || recordSaving) return;
    setRecordSaving(true);
    try {
      if (!await saveComment(recordPlayer)) return;
      if (!await saveCardIfNeeded(recordPlayer)) return;
      if (nextIndex !== undefined) setRecordIndex(nextIndex);
      setSavedNotice('Registros guardados. No se ha confirmado ninguna evaluación deportiva.');
    } finally { setRecordSaving(false); }
  }

  async function previous() {
    if (confirmationPending.current) return;
    if (!await saveComment(player)) return;
    if (!await saveCardIfNeeded(player)) return;
    setIndex(i => (i - 1 + evaluablePlayers.length) % evaluablePlayers.length);
  }

  async function goToPlayer(nextIndex: number) {
    if (confirmationPending.current) return;
    if (!await saveComment(player)) return;
    if (!await saveCardIfNeeded(player)) return;
    setIndex(nextIndex);
  }

  async function next() {
    if (confirmationPending.current) return;
    if (!await saveComment(player)) return;
    if (!await saveCardIfNeeded(player)) return;
    // Navigation must never finalize an evaluation; only Confirm does that.
    setIndex(current => (current + 1) % evaluablePlayers.length);
  }

  async function confirmRecordsOnly() {
    if (!isAdmin || locked || recordSaving) return;
    if (!window.confirm('¿Finalizar los registros de este partido sin puntuaciones deportivas? Después quedarán bloqueados.')) return;

    setRecordSaving(true);
    try {
      if (recordPlayer && !await saveComment(recordPlayer)) return;
      for (const target of recordPlayers) {
        if (!await saveCardIfNeeded(target)) return;
      }

      // Never silently convert a previously scored session to records-only.
      const { data: existing, error: readError } = await supabase
        .from('evaluations').select('*').eq('session_id', session.id);
      if (readError) { setError(readError.message); return; }
      const hasScores = (existing || []).some((row: any) =>
        ALL_SCORE_FIELDS.some(field => row[field] != null && !isFieldNA(row, field))
      );
      if (hasScores) {
        setError('Esta sesión ya tiene puntuaciones deportivas. No puede cerrarse como «Solo registros» sin revisar primero esas evaluaciones.');
        return;
      }

      await workflowAction(session.id, 'evaluation', 'confirm', existing || [], true);

      setLocalLocked(true);
      setSavedNotice('Partido finalizado sin evaluación deportiva.');
      await reload(session.id);
    } catch (error) { setError(String(error)); } finally {
      setRecordSaving(false);
    }
  }

  async function confirmEvaluation() {
    if (recordsOnlyCompleted || locked || confirmationPending.current || eligibilityLoading || eligibilityError) return;
    if (!window.confirm('Confirmar evaluacion con las puntuaciones explicitas y N/A revisados?')) return;
    confirmationPending.current = true; setConfirming(true);
    setError('');
    try {
      const [latest,calls,visits] = await Promise.all([
        readPerformancePages<Evaluation>((a,b)=>supabase.from('evaluations').select('*').eq('session_id',session.id).order('id').range(a,b)),
        readPerformancePages<EligibilityRow>((a,b)=>supabase.from('callups').select('*').eq('session_id',session.id).order('id').range(a,b)),
        readPerformancePages<Attendance>((a,b)=>supabase.from('attendance').select('*').eq('session_id',session.id).order('id').range(a,b)),
      ]);
      const eligibleNow = players.filter(p => !eligibilityReason(session.id,p.id,calls,visits));
      if (!eligibleNow.length || eligibleNow.length !== evaluablePlayers.length || eligibleNow.some(p=>!evaluablePlayers.some(old=>old.id===p.id))) throw new Error('La elegibilidad ha cambiado. Recarga y revisa antes de confirmar.');
      const reviewed: Evaluation[] = [];
      for (const target of eligibleNow) {
        const rows = distinctRows(latest).filter(e=>e.player_id===target.id);
        if(rows.length!==1) throw new Error(target.display_name+': falta una evaluacion explicita o hay registros duplicados.');
        const row=rows[0];
        if(!row.not_applicable && ALL_SCORE_FIELDS.some(field=>!isFieldNA(row,field)&&fieldScore(row,field)===null)) throw new Error(target.display_name+': revisa las cualidades sin puntuacion valida ni N/A.');
        reviewed.push(row);
      }
      const counts=getRatingCounts(reviewed), high=ratingLimit(session.high_rating_limit,6), low=ratingLimit(session.low_rating_limit,3);
      if(ALL_SCORE_FIELDS.some(field=>(counts.high[field]||0)>high||(counts.low[field]||0)>low)) throw new Error('Los limites de puntuacion requieren revision antes de confirmar.');
      for(const target of eligibleNow) if(!await saveCardIfNeeded(target))return;
      if(!await saveComment(player))return;
      const disciplinary = await supabase.rpc('create_yellow_accumulation_suspensions');
      if (disciplinary.error) throw new Error(disciplinary.error.message);
      const finalRows = await readPerformancePages<Evaluation>((a,b)=>supabase.from('evaluations').select('*').eq('session_id',session.id).order('id').range(a,b));
      await workflowAction(session.id, 'evaluation', 'confirm', finalRows);
      setLocalLocked(true);
      if(moveToNextOpenSession)await moveToNextOpenSession();else await reload(session.id);
    } catch(failure){setError(String(failure));}
    finally { confirmationPending.current = false; setConfirming(false); }
  }

  async function reopenEvaluation() {
    if (!isAdmin) return;
    const confirmed = window.confirm('¿Reabrir evaluación? Esto permitirá hacer cambios otra vez.');
    if (!confirmed) return;

    try {
      await workflowAction(session.id, 'evaluation', 'reopen');
      setLocalLocked(false);
      await reload(session.id);
    } catch (error) { setError(String(error)); }
  }

  const current: any = ev || {};
  const isMatch = ['friendly_match', 'league_match', 'tryout', 'scrimmage'].includes(session.type);
  const activeRatingFields = session.type === 'training' ? trainingRatingFields : matchRatingFields;
  const highLimit = session.high_rating_limit ?? 6;
  const lowLimit = session.low_rating_limit ?? 3;

  return (
    <div className="stack">
      {access.error && <p role="alert">No se pueden verificar los permisos: {access.error}</p>}
      <SessionHeading session={session}/>
      <Card><details><summary>Criterios de evaluación</summary><p>Solo se evalúa a jugadores convocados y evaluables con asistencia deportiva registrada. Las puntuaciones no seleccionadas no reciben un 3 automático.</p>
        {session.type === 'training' && <p>Se conservan las cinco calidades y las notas históricas.</p>}</details>
        {!!localEvaluations.filter(e => !evaluablePlayers.some(p => p.id === e.player_id)).length && <p role="alert">Hay evaluaciones no elegibles o duplicadas fuera del cómputo. Se conservan para revisión histórica.</p>}
      </Card>
      {isAdmin && localLocked && !recordsOnlyCompleted && <Card>
        <p className="muted">Si este es un partido histórico sin puntuaciones, pulsa «Reabrir evaluación» para acceder a «Solo registros». Reabrir no borra comentarios, tarjetas, asistencia ni N/A.</p>
      </Card>}
      {isAdmin && !locked && <Card>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,padding:5,marginTop:16,background:'#e4e7e3',borderRadius:18}}>
          <button type="button" disabled={confirming} onClick={() => { if (recordPlayer && dirtyComments[recordPlayer.id]) { setError('Guarda el comentario antes de cambiar de modo.'); return; } setAdminRecordsMode(false); }}
            style={{border:'none',borderRadius:13,padding:'12px 8px',fontWeight:700,cursor:'pointer',background:!adminRecordsMode?'#efffbb':'transparent',color:'#111'}}>
            Evaluación deportiva
          </button>
          <button type="button" disabled={confirming} onClick={() => setAdminRecordsMode(true)}
            style={{border:'none',borderRadius:13,padding:'12px 8px',fontWeight:700,cursor:'pointer',background:adminRecordsMode?'#efffbb':'transparent',color:'#111'}}>
            Solo registros (sin puntuación)
          </button>
        </div>
        <p className="muted" style={{marginTop:10}}>{adminRecordsMode ? 'Registra comentarios y tarjetas sin generar puntuaciones deportivas.' : 'Evalúa a los jugadores y registra sus comentarios y tarjetas.'}</p>
      </Card>}
      {adminRecordsMode && isAdmin && !locked ? <>
        <Card>
          <h2>Registros del partido · sin evaluación deportiva</h2>
          <p className="muted">Selecciona cualquier jugador de la plantilla, aunque no esté convocado. Los comentarios y tarjetas se guardan al cambiar de jugador o al pulsar «Guardar registros». No se generan notas de 3. Al finalizar los registros, el partido quedará bloqueado.</p>
        </Card>
        {recordPlayer ? <>
          <Card>
            <strong>Jugador</strong>
            <select value={recordIndex} disabled={recordSaving} onChange={e => void saveRecordAndNavigate(Number(e.target.value))}>
              {recordPlayers.map((p,i) => <option key={p.id} value={i}>{p.display_name}</option>)}
            </select>
          </Card>
          <Card key={'record-comment-'+recordPlayer.id}>
            <strong>Comentario de {recordPlayer.display_name}</strong>
            <textarea disabled={recordSaving} value={comments[recordPlayer.id] ?? localEvaluations.find(e=>e.player_id===recordPlayer.id)?.comment ?? ''}
              onChange={e => {setComments(prev=>({...prev,[recordPlayer.id]:e.target.value}));setDirtyComments(prev=>({...prev,[recordPlayer.id]:true}));setSavedNotice('');}}
              placeholder="Motivo de no convocatoria, no participación, observaciones..." />
          </Card>
          {['friendly_match','league_match','tryout','scrimmage'].includes(session.type) && <Card>
            <strong>Tarjeta de {recordPlayer.display_name}</strong>
            <select disabled={recordSaving || savingCard} value={recordDraft?.type || 'none'} onChange={e => setCardDraft(recordPlayer.id,{type:e.target.value})}>
              {cardOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {(recordDraft?.type || 'none') !== 'none' && <>
              <textarea disabled={recordSaving} placeholder="Motivo de la tarjeta" value={recordDraft?.reason || ''} onChange={e=>setCardDraft(recordPlayer.id,{reason:e.target.value})} />
              {['straight_red','double_yellow'].includes(recordDraft?.type || '') && <input disabled={recordSaving} type="number" min="1" value={recordDraft?.matches || '1'} onChange={e=>setCardDraft(recordPlayer.id,{matches:e.target.value})} placeholder="Partidos de sanción" />}
            </>}
            <p className="muted">Registrada: {savedCards.filter(c=>c.player_id===recordPlayer.id).map(c=>c.type).join(', ') || 'Ninguna'}</p>
          </Card>}
          <div className="row" style={{gap:10}}>
            <button className="secondary" disabled={recordSaving} onClick={() => void saveRecordAndNavigate((recordIndex-1+recordPlayers.length)%recordPlayers.length)}>← Anterior</button>
            <button className="primary" disabled={recordSaving} onClick={() => void saveRecordAndNavigate()}>Guardar registros</button>
            <button className="secondary" disabled={recordSaving} onClick={() => void saveRecordAndNavigate((recordIndex+1)%recordPlayers.length)}>Siguiente →</button>
          </div>
          <Card>
            <strong>Finalizar partido sin puntuaciones</strong>
            <p className="muted">Guarda los registros pendientes y marca el partido como completado. No se generan notas deportivas. Después quedará bloqueado, como una evaluación confirmada.</p>
            <button className="primary" disabled={recordSaving || savingCard} onClick={() => void confirmRecordsOnly()}>
              <CheckCircle2 size={18} /> Confirmar solo registros
            </button>
          </Card>
        </> : <Card><p>Cargando plantilla…</p></Card>}
        {savedNotice && <div role="status" className="save-feedback success">{savedNotice}</div>}
      </> : <>
      <Card className={locked ? 'locked-card confirmed-card' : ''}>

        {localLocked ? (
          <div className="stack">
            <button className="primary confirmed" disabled><CheckCircle2 size={18} /> {recordsOnlyCompleted ? "Registros confirmados · sin notas" : "Evaluación confirmada"}</button>
            {isAdmin && <button className="secondary danger" onClick={reopenEvaluation}><RotateCcw size={16} /> Reabrir evaluación</button>}
          </div>
        ) : (
          <button className="primary" disabled={locked || confirming} onClick={confirmEvaluation}>{confirming ? 'Verificando evaluación…' : 'Confirmar evaluación'}</button>
        )}
      </Card>

      {savedNotice && <div role="status" className="save-feedback success">{savedNotice}</div>}
      <Card><div className="row"><strong>Orden de evaluación</strong><select aria-label="Orden de evaluación" value={mode} onChange={e => setMode(e.target.value as 'category'|'player')}><option value="category">Por cualidad (todos los jugadores)</option><option value="player">Por jugador (todas las cualidades)</option></select></div></Card>
      {mode === 'category' ? <>
        <Card><strong>Cualidad que estás evaluando</strong><select value={categoryIndex} onChange={e => setCategoryIndex(Number(e.target.value))}>{(session.type === 'training' ? trainingRatingFields : matchRatingFields).map(([field,label],i) => <option key={field} value={i}>{label}</option>)}</select></Card>
        {(session.type === 'training' ? trainingRatingFields : matchRatingFields).slice(categoryIndex,categoryIndex+1).map(([field,label]) => <Card key={field}><h2>{label}</h2><p className="muted">Valora esta cualidad en todos los jugadores antes de pasar a la siguiente.</p>{evaluablePlayers.map(p => {const rating = localEvaluations.find(e => e.player_id === p.id); const na=isFieldNA(rating, field); return <div key={p.id} className="rating-player-row"><strong>{p.display_name}</strong><div className="rating">{[1,2,3,4,5].map(n => <button key={n} disabled={locked || confirming} className={!na && fieldScore(rating,field) === n ? 'rate active' : 'rate'} onClick={() => update(field,n,p)}>{n}</button>)}<button disabled={locked || confirming} className={na ? 'rate active' : 'rate'} onClick={() => setQualityNA(field,p)}>N/A</button></div></div>})}</Card>)}
        <div className="row"><button className="secondary" disabled={categoryIndex===0} onClick={()=>setCategoryIndex(i=>i-1)}>Cualidad anterior</button><button className="primary" onClick={()=>{if(categoryIndex < (session.type==='training'?trainingRatingFields:matchRatingFields).length-1)setCategoryIndex(i=>i+1);else setMode('player')}}>{categoryIndex < (session.type==='training'?trainingRatingFields:matchRatingFields).length-1 ? 'Siguiente cualidad' : 'Revisar comentarios'}</button></div>
      </> : <>
      <div className="progress">{index + 1} / {evaluablePlayers.length}</div>

      <Card>
        <div className="search-label"><Search size={16} /> Ir a jugador</div>
        <select value={index} onChange={e => void goToPlayer(Number(e.target.value))}>
          {evaluablePlayers.map((p: Player, i: number) => <option key={p.id} value={i}>{i + 1}. {p.display_name}</option>)}
        </select>
      </Card>

      <Card>
        <div className="row">
          <div><p className="kicker">Jugador</p><h2>{player.display_name}</h2><p>{translatePosition(player.position)}</p></div>
          <div className="score-badge">{evaluationTotal(current) ?? 'N/A'}</div>
        </div>
        <div className="row" style={{marginTop:12}}><button className="secondary" disabled={locked || confirming} onClick={previous}>← Anterior</button><button className="primary" disabled={locked || confirming} onClick={next}>Siguiente jugador →</button></div>
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
              <button disabled={locked || confirming} key={n} className={!isFieldNA(current,field) && fieldScore(current,field) === n ? 'rate active' : 'rate'} onClick={() => update(field, n)}>{n}</button>
            ))}
            <button disabled={locked || confirming} className={isFieldNA(current,field) ? 'rate active' : 'rate'} onClick={() => setQualityNA(field)}>N/A</button>
          </div>
        </Card>
      ))}

      {isMatch && (
        <Card>
          <strong>Tarjetas</strong>
          <select disabled={locked || confirming || savingCard} value={cardType} onChange={e => setCardDraft(player.id, {type:e.target.value})}>
            {cardOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>

          <p className="muted">Tarjeta registrada para {player.display_name}: {savedCards.filter(c=>c.player_id===player.id).map(c=>c.type==='yellow'?'🟨 Amarilla':'🟥 '+(c.type==='double_yellow'?'Doble amarilla':'Roja')).join(' · ') || 'Ninguna'}</p>
          {cardType !== 'none' && (
            <>
              <textarea disabled={locked || confirming} placeholder="Motivo de la tarjeta..." value={cardReason} onChange={e => setCardDraft(player.id, {reason:e.target.value})} />
              {(cardType === 'straight_red' || cardType === 'double_yellow') && (
                <input
                  disabled={locked || confirming}
                  type="number"
                  min="1"
                  placeholder="Partidos de sanción"
                  value={suspensionMatches}
                  onChange={e => setCardDraft(player.id, {matches:e.target.value})}
                />
              )}
            </>
          )}
          <p className="muted">{savingCard ? 'Guardando tarjeta…' : cardType === 'none' ? 'Selección guardada.' : 'La selección se guardará al pasar a otro jugador o confirmar la evaluación.'}</p>
        </Card>
      )}

      <Card key={'comment-'+player.id}>
        <strong>Comentario de {player.display_name}</strong>
        <textarea disabled={locked || confirming} value={comments[player.id] ?? ''} onChange={e => {setComments(prev => ({...prev,[player.id]:e.target.value})); setDirtyComments(prev => ({...prev,[player.id]:true})); setSavedNotice('');}} placeholder="Comentario individual..." />
        <p className="muted">El comentario se guarda al cambiar de jugador o al confirmar la evaluación.</p>
      </Card>

      <div className="row" style={{justifyContent:'space-between', gap:12}}>
        <button className="secondary" disabled={locked || confirming} onClick={previous}>← Jugador anterior</button>
        <button className="primary" disabled={locked || confirming} onClick={next}>Siguiente jugador <ChevronRight size={18} /></button>
      </div>
      </>}
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
