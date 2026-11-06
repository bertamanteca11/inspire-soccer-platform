import { supabase } from '../supabase';
import type { AppSession } from '../utils/appTypes';
import { isActiveSession } from '../utils/sessionArchive';
import { copenhagenToday } from '../utils/copenhagenDates';
import { workflowRows } from './workflowReads';

export async function getNextAvailableSession() {
  const today = copenhagenToday();

  const future = await workflowRows<AppSession>((from,to) => supabase
    .from('sessions')
    .select('*')
    .gte('session_date', today)
    .in('status', ['planned', 'completed'])
    .order('session_date', { ascending: true })
    .order('id', { ascending: true })
    .range(from,to));

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
    if (!Array.isArray(data)) throw new Error('Lectura incompleta del catálogo de sesiones.');
    if (!data.length) return rows.sort((a, b) => b.session_date.localeCompare(a.session_date) || a.id.localeCompare(b.id));
    rows.push(...data as AppSession[]); offset += data.length;
  }
}
