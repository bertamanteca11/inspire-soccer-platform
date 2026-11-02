import { supabase } from '../supabase';
import type { AppSession } from '../utils/appTypes';
import { isActiveSession } from '../utils/sessionArchive';

export async function getNextAvailableSession() {
  const today = new Date().toISOString().slice(0, 10);

  const future = await supabase
    .from('sessions')
    .select('*')
    .gte('session_date', today)
    .in('status', ['planned', 'completed'])
    .order('session_date', { ascending: true })
    .limit(20);

  if (future.error) throw new Error(future.error.message);
  const futureSessions = ((future.data || []) as AppSession[]).filter(isActiveSession);

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

  if (latest.error) throw new Error(latest.error.message);
  const latestSession = ((latest.data || []) as AppSession[]).find(isActiveSession);
  if (latestSession) return latestSession;

  return null;
}

export async function loadAllSessions() {
  const rows: AppSession[] = [];
  for (let offset = 0; ; ) {
    const { data, error } = await supabase.from('sessions').select('*').order('id').range(offset, offset + 499);
    if (error) throw new Error(error.message);
    if (!data?.length) return rows.sort((a, b) => b.session_date.localeCompare(a.session_date) || a.id.localeCompare(b.id));
    rows.push(...data as AppSession[]); offset += data.length;
  }
}
