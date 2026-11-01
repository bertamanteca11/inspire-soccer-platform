import { supabase } from '../supabase';
import { readAttendancePages } from '../utils/attendance';

// Statistics only: input, eligibility and callup workflows retain their queries.
export function loadAttendanceStatistics(filters: {
  playerId?: string;
  sessionId?: string;
  sessionIds?: string[];
} = {}) {
  if (filters.sessionIds?.length === 0) return Promise.resolve({ data: [], error: null });
  return readAttendancePages((from, to) => {
    let query = supabase.from('attendance').select('*,players(display_name)').order('id');
    if (filters.playerId) query = query.eq('player_id', filters.playerId);
    if (filters.sessionId) query = query.eq('session_id', filters.sessionId);
    if (filters.sessionIds) query = query.in('session_id', filters.sessionIds);
    return query.range(from, to);
  });
}
