import { supabase } from '../supabase';
import type { AppSession } from '../utils/appTypes';
import type { Role } from '../types';
import { isActiveSession, sessionWriteError, verifiedSessionRow } from '../utils/sessionArchive';

export async function changeSessionArchiveStatus(session: AppSession, target: 'archived' | 'planned' | 'completed', role: Role): Promise<AppSession> {
  if (role !== 'admin') throw new Error('Solo un administrador puede archivar o restaurar sesiones.');
  if (!(target === 'archived' && isActiveSession(session)
    || session.status === 'archived' && ['planned', 'completed'].includes(target))) {
    throw new Error('Transición de archivo no válida. Recarga la sesión y revisa su estado.');
  }
  // Compare-and-set: do not overwrite a concurrent archive/restore. Ask for the
  // actual returned row, not merely a successful HTTP status or zero-row update.
  const { data, error } = await supabase.from('sessions').update({ status: target })
    .eq('id', session.id).eq('status', session.status).select('*');
  if (error) throw new Error(sessionWriteError(error));
  return verifiedSessionRow(data as AppSession[] | null, session.id, target);
}
