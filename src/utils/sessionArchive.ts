export const ACTIVE_SESSION_STATUSES = ['planned', 'completed'] as const;
export function isActiveSession(session?: { status?: string | null } | null): boolean {
  return !!session && ACTIVE_SESSION_STATUSES.some(status => status === session.status);
}

export function sessionWriteError(error: { code?: string; message?: string }): string {
  if (['42501', 'PGRST301', 'PGRST302'].includes(error.code || '')) return 'No tienes permisos para cambiar esta sesión. Un administrador debe revisar los permisos y las políticas de Supabase.';
  if (['22P02', '23514'].includes(error.code || '')) return 'La base de datos no admite este estado o rechaza la transición. Revisa el estado de sesión y las restricciones antes de reintentar.';
  return 'No se pudo guardar la sesión: ' + (error.message || 'Error desconocido');
}

export function verifiedSessionRow<T extends { id: string; status: string }>(rows: T[] | null, id: string, status: string): T {
  if (!rows || rows.length !== 1 || rows[0].id !== id || rows[0].status !== status) {
    throw new Error('No se ha verificado el cambio de la sesión. Puede haber cambiado, no existir o no estar permitido. Recarga antes de reintentar.');
  }
  return rows[0];
}
