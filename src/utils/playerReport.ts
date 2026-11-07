import { attendanceStats, isUnjustifiedAbsence, uniqueAttendanceRecords } from './attendance';
import { countableEvaluations, distinctRows, isCompletedSportingSession, operationalStandouts } from './evaluationEligibility';
import { evaluationTotal, fieldScore, SCORE_FIELDS } from './evaluationScores';
import { calendarDate, copenhagenToday } from './copenhagenDates';
import { translateAttendance, translateCard, translateSessionType } from './formatters';

export type ReportRow = Record<string, any>;
export type ReportData = {
  from: string; to: string; sessions: ReportRow[]; callups: ReportRow[];
  evaluations: ReportRow[]; attendance: ReportRow[]; cards: ReportRow[];
  injuries: ReportRow[]; standouts: ReportRow[]; suspensions: ReportRow[];
};
export const reportDate = (date?: string | null) => date && /^\d{4}-\d{2}-\d{2}$/.test(date)
  ? date.slice(8,10) + '/' + date.slice(5,7) + '/' + date.slice(0,4) : 'Sin fecha';
export const reportNumber = (value: number | null) => value === null ? 'N/D' : value.toFixed(2).replace('.', ',');
export const reportCount = (count: number, singular: string, plural = singular+'s') => `${count} ${count === 1 ? singular : plural}`;
const mean = (scores: number[]) => scores.length ? scores.reduce((a,b) => a+b,0)/scores.length : null;
const validDate = (date: unknown): date is string => {
  if (typeof date !== 'string') return false;
  try { calendarDate(date); return true; } catch { return false; }
};
function timestampDate(value: unknown) {
  const date = typeof value === 'string' ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? copenhagenToday(date) : null;
}
function performanceGroup(rows: ReportRow[], type: 'training' | 'match') {
  const scored = rows.filter(e => type === 'training' ? e.session.type === 'training' : e.session.type !== 'training');
  const scores = scored.map(e => evaluationTotal(e)!).filter(n => n !== null);
  const half = Math.floor(scores.length/2);
  const first = scores.length >= 4 ? mean(scores.slice(0,half)) : null;
  const last = scores.length >= 4 ? mean(scores.slice(-half)) : null;
  return { count: scores.length, average: mean(scores), qualities: SCORE_FIELDS.map(field => ({
    field, average: mean(scored.map(e => fieldScore(e,field)).filter((n): n is number => n !== null)),
    count: scored.filter(e => fieldScore(e,field) !== null).length,
  })), trend: first !== null && last !== null ? { first, last, delta: last-first, sample: half } : null };
}

export function buildPlayerReport(player: ReportRow, data: ReportData) {
  calendarDate(data.from); calendarDate(data.to);
  if (data.from > data.to) throw new Error('El periodo del informe no es válido.');
  const sessions = distinctRows(data.sessions).filter(s => isCompletedSportingSession(s as any)
    && s.session_date >= data.from && s.session_date <= data.to).sort((a,b) => a.session_date.localeCompare(b.session_date) || a.id.localeCompare(b.id));
  const sessionMap = new Map(sessions.map(s => [s.id,s]));
  const scoped = (rows: ReportRow[]) => distinctRows(rows).filter(r => r.player_id === player.id && sessionMap.has(r.session_id));
  const attendance = uniqueAttendanceRecords(scoped(data.attendance));
  const calls = scoped(data.callups);
  const evaluations = countableEvaluations(scoped(data.evaluations) as any[], sessions as any[], calls, attendance).evaluations
    .sort((a,b) => a.session.session_date.localeCompare(b.session.session_date) || a.id.localeCompare(b.id));
  const stats = attendanceStats(attendance);
  const present = stats.present + stats.lateTotal + stats.injuredPresent;
  const classified = present + stats.absences;
  const calledIds = new Set(calls.filter(c => ['called_up','trial','guest_not_evaluable'].includes(c.status)).map(c => c.session_id));
  const missingAttendance = [...calledIds].filter(id => !attendance.some(a => a.session_id === id)).length;
  const cards = scoped(data.cards);
  const yellows = cards.reduce((sum,c) => sum + (c.type === 'yellow' ? 1 : c.type === 'double_yellow' ? 2 : 0),0);
  const reds = cards.filter(c => ['straight_red','double_yellow'].includes(c.type)).length;
  const injuryRows = distinctRows(data.injuries).filter(i => i.player_id === player.id);
  const injuries = injuryRows.filter(i => validDate(i.start_date) && i.start_date <= data.to
    && (!validDate(i.end_date) || i.end_date >= data.from)).sort((a,b) => b.start_date.localeCompare(a.start_date)).map(i => ({
      title: String(i.injury_type || i.body_area || 'Lesión registrada'), start: i.start_date as string,
      end: validDate(i.end_date) && i.end_date <= data.to ? i.end_date : null,
      state: validDate(i.end_date) && i.end_date <= data.to ? 'Alta dentro del periodo'
        : i.status === 'recovered' && !validDate(i.end_date) ? 'Alta sin fecha; evolución no verificable'
        : 'Sin alta registrada dentro del periodo',
    }));
  const undatedInjuries = injuryRows.filter(i => !validDate(i.start_date)).length;
  const allSessionMap = new Map(data.sessions.map(s => [s.id,s]));
  const suspensions = distinctRows(data.suspensions).filter(s => {
    if (s.player_id !== player.id) return false;
    // Prefer the sporting origin over a later creation/backfill timestamp.
    if (s.created_from_session_id) return sessionMap.has(s.created_from_session_id);
    const date = timestampDate(s.created_at);
    return !!date && date >= data.from && date <= data.to;
  }).map(s => ({ total: Number(s.matches_total) || 0,
    remaining: Math.max(0,(Number(s.matches_total)||0)-(Number(s.matches_served)||0)),
    state: s.status === 'served' ? 'Cumplida' : s.status === 'active' ? 'Activa' : String(s.status || 'Sin estado'),
    date: allSessionMap.get(s.created_from_session_id)?.session_date || timestampDate(s.created_at),
  }));
  const currentSuspensions = distinctRows(data.suspensions).filter(s => s.player_id === player.id && s.status === 'active')
    .map(s => ({ remaining: Math.max(0,(Number(s.matches_total)||0)-(Number(s.matches_served)||0)) }));
  const standouts = scoped(operationalStandouts(data.standouts as any[],sessions as any[]));
  const training = performanceGroup(evaluations,'training'), match = performanceGroup(evaluations,'match');
  const avg = mean(evaluations.map(e => evaluationTotal(e)!).filter(n => n !== null));
  const incidents = attendance.filter(a => isUnjustifiedAbsence(a.status) || ['late','justified_late'].includes(a.status))
    .map(a => ({ date: sessionMap.get(a.session_id)!.session_date as string,
      label: translateAttendance(a.status), note: String(a.notes || ''), unjustified: isUnjustifiedAbsence(a.status) }))
    .sort((a,b) => Number(b.unjustified)-Number(a.unjustified) || b.date.localeCompare(a.date));
  const comments = evaluations.filter(e => typeof e.comment === 'string' && e.comment.trim())
    .map(e => ({ date: e.session.session_date, text: String(e.comment).trim() })).reverse();
  const recent = sessions.filter(s => attendance.some(a => a.session_id === s.id) || calls.some(c => c.session_id === s.id))
    .slice(-4).reverse().map(s => ({date:s.session_date,type:translateSessionType(s.type),
      attendance: attendance.filter(a => a.session_id === s.id).length > 1 ? 'Revisar registros duplicados'
        : translateAttendance(attendance.find(a => a.session_id === s.id)?.status) || 'Sin asistencia registrada',
      score: evaluationTotal(evaluations.find(e => e.session_id === s.id)),
    }));
  const warnings: string[] = [];
  if (missingAttendance) warnings.push(`${missingAttendance} convocatoria(s) sin asistencia registrada; no se cuentan como ausencias.`);
  if (stats.unrecorded + stats.unknown + stats.legacyInjured) warnings.push(`${stats.unrecorded + stats.unknown + stats.legacyInjured} registro(s) no permiten determinar presencia o ausencia.`);
  if (attendance.some((a,i) => attendance.some((b,j) => j < i && a.session_id === b.session_id))) warnings.push('Hay asistencias duplicadas: revisar los originales antes de interpretar el balance.');
  if (undatedInjuries) warnings.push(`${undatedInjuries} lesión(es) sin fecha de inicio: no se atribuyen a este periodo.`);
  const summary = [sessions.length ? `${reportCount(sessions.length,'sesión completada','sesiones completadas')} en el periodo; ${reportCount(present,'presencia registrada','presencias registradas')} y ${reportCount(evaluations.length,'evaluación válida','evaluaciones válidas')} del jugador.`
    : 'No hay sesiones deportivas completadas en el periodo seleccionado.',
    classified ? `${reportCount(stats.unjustifiedAbsences,'ausencia injustificada','ausencias injustificadas')}, ${reportCount(stats.justifiedAbsences,'justificada')} y ${reportCount(stats.lateTotal,'retraso')}. La presencia incluye los registros de asistencia al fisio.`
      : 'No hay asistencia clasificada suficiente para valorar la continuidad; los registros ausentes no se convierten en faltas.',
    evaluations.length ? `Valoración media ${reportNumber(avg)} / 5. Entrenamientos: ${reportNumber(training.average)}; otras actividades deportivas: ${reportNumber(match.average)}.`
      : 'Sin evaluaciones válidas en este periodo: no se asigna una nota ni se interpreta como bajo rendimiento.',
    `${reportCount(injuries.length,'lesión','lesiones')} con fechas que coinciden con el periodo; ${reportCount(yellows,'amarilla')} y ${reportCount(reds,'expulsión','expulsiones')}.`,
  ];
  const focus: string[] = [];
  if (stats.unjustifiedAbsences) focus.push(`Revisar ${reportCount(stats.unjustifiedAbsences,'ausencia injustificada','ausencias injustificadas')} y los motivos registrados.`);
  if (injuries.some(i => !i.end)) focus.push('Revisar la evolución de las lesiones sin alta fechada dentro del periodo.');
  if (reds || suspensions.length || currentSuspensions.length) focus.push('Consultar las sanciones y su estado antes de preparar la convocatoria.');
  if (warnings.length) focus.push(warnings[0]);
  if (!focus.length) focus.push('Revisar con el jugador los comentarios del cuerpo técnico y la evolución de sus valoraciones.');
  return { player, from:data.from, to:data.to, sessions, attendance:stats, present, classified,
    presenceRate:classified ? Math.round(present/classified*100) : null,
    missingAttendance,evaluations,average:avg,training,match,injuries,undatedInjuries,
    cards:cards.map(c => ({date:sessionMap.get(c.session_id)!.session_date,label:translateCard(c.type)})),
    yellows,reds,suspensions,currentSuspensions,incidents,comments,recent,warnings,summary,focus,
    top:standouts.filter(s => s.category === 'top').length,bottom:standouts.filter(s => s.category === 'bottom').length };
}
export type PlayerReport = ReturnType<typeof buildPlayerReport>;
