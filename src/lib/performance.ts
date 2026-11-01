import { supabase } from '../supabase';

// Read-only source for current performance. Historical details and all writes
// continue to use evaluations. No fallback to unfiltered data on view errors.
export function officialEvaluations() {
  return supabase.from('official_evaluations');
}
