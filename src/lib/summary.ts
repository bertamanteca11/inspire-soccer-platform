import { supabase } from '../supabase';
import { loadPerformanceData } from './performance';
import type { SummarySession } from '../utils/summaryScope';
import type { AttendanceRecord } from '../utils/attendance';

export type SummaryEvaluation = Record<string, any> & { id: string; session_id: string; player_id: string };
export type SummaryCard = { id: string; session_id: string; player_id: string; type: string; players?: { display_name?: string } | null };
export type SummaryPlayer = { id: string; display_name: string };
export type SummaryData = { sessions: SummarySession[]; attendance: AttendanceRecord[]; evaluations: SummaryEvaluation[]; cards: SummaryCard[]; players: SummaryPlayer[]; excluded?: { row: SummaryEvaluation; reason: string }[] };

// Each query has a stable primary-key order and uses the actual returned length,
// including servers with a page cap below the requested size. Fail closed.
export async function readSummaryPages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; ) {
    const result = await read(offset, offset + 499);
    if (result.error) throw new Error(result.error.message);
    if (!Array.isArray(result.data)) throw new Error('Lectura incompleta del resumen. Recarga antes de consultar los totales.');
    if (!result.data.length) return rows;
    rows.push(...result.data); offset += result.data.length;
  }
}

export async function loadSummaryData(): Promise<SummaryData> {
  const [performance, cards, players] = await Promise.all([
    loadPerformanceData(),
    readSummaryPages<SummaryCard>((from, to) => supabase.from('cards').select('*,players(display_name)').order('id').range(from, to)),
    readSummaryPages<SummaryPlayer>((from, to) => supabase.from('players').select('id,display_name').order('id').range(from, to)),
  ]);
  return { sessions: performance.sessions, attendance: performance.attendance, evaluations: performance.evaluations, cards, players, excluded: performance.excluded };
}
