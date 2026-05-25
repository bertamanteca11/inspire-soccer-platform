import { supabase } from '../supabase';
import type { AppSession } from '../utils/appTypes';

export async function getNextAvailableSession() {
  const today = new Date().toISOString().slice(0, 10);

  const future = await supabase
    .from('sessions')
    .select('*')
    .gte('session_date', today)
    .in('status', ['planned', 'completed'])
    .order('session_date', { ascending: true })
    .limit(20);

  const futureSessions = (future.data || []) as AppSession[];

  const openFuture =
    futureSessions.find(s => !s.callup_confirmed || !s.attendance_confirmed || !s.evaluation_confirmed) ||
    futureSessions[0];

  if (openFuture) return openFuture;

  const latest = await supabase
    .from('sessions')
    .select('*')
    .in('status', ['planned', 'completed'])
    .order('session_date', { ascending: false })
    .limit(1);

  const latestSession = (latest.data || [])[0] as AppSession | undefined;
  if (latestSession) return latestSession;

  const anySession = await supabase
    .from('sessions')
    .select('*')
    .order('session_date', { ascending: false })
    .limit(1);

  return ((anySession.data || [])[0] as AppSession | undefined) || null;
}

export async function loadAllSessions() {
  const { data } = await supabase
    .from('sessions')
    .select('*')
    .order('session_date', { ascending: false });

  return (data || []) as AppSession[];
}
