import { supabase } from '../supabase';
import { loadAllSessions } from './data';
import { loadAttendanceStatistics } from './attendance';
import { countableEvaluations, type EligibilityRow, type SportingEvaluation, type SportingSession } from '../utils/evaluationEligibility';

// Read-only source for current performance. Historical details and all writes
// continue to use evaluations. No fallback to unfiltered data on view errors.
export function officialEvaluations() {
  return supabase.from('official_evaluations');
}

export async function readPerformancePages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; ) {
    const result = await read(offset,offset+499);
    if (result.error) throw new Error(result.error.message);
    if (!Array.isArray(result.data)) throw new Error('Lectura incompleta. Recarga antes de continuar.');
    if (!result.data.length) return rows;
    rows.push(...result.data); offset += result.data.length;
  }
}
export async function loadPerformanceData() {
  const [sessions, attendance, callups, rawEvaluations] = await Promise.all([
    loadAllSessions(), loadAttendanceStatistics(),
    readPerformancePages<EligibilityRow>((from,to) => supabase.from('callups').select('id,session_id,player_id,status,evaluable').order('id').range(from,to)),
    readPerformancePages<SportingEvaluation>((from,to) => officialEvaluations().select('*,players(display_name)').order('id').range(from,to)),
  ]);
  if (attendance.error) throw new Error(attendance.error.message);
  const result = countableEvaluations(rawEvaluations, sessions as SportingSession[], callups, attendance.data);
  return { ...result, sessions, attendance: attendance.data, callups, rawEvaluations };
}
