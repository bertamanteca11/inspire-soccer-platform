import { supabase } from '../supabase';
import { readPerformancePages } from './performance';
import type { SportingEvaluation } from '../utils/evaluationEligibility';

// Deliberately separate from operational metrics. Never used as a fallback when
// eligibility or the official view cannot be read.
export function loadHistoricalEvaluations(playerId = '', sessionId = '') {
  return readPerformancePages<SportingEvaluation>((from,to) => {
    let query = supabase.from('evaluations').select('*,players(display_name)').order('id');
    if (playerId) query = query.eq('player_id',playerId);
    if (sessionId) query = query.eq('session_id',sessionId);
    return query.range(from,to);
  });
}
