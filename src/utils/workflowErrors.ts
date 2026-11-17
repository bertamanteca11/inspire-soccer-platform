type BackendError = { code?: string; message?: string } | null | undefined;
export function workflowError(error: BackendError): string {
  if (!error) return '';
  if (error.code === 'PGRST202' || /could not find the function|schema cache.*function/i.test(error.message || '')) {
    return 'La actualización de la base de datos está pendiente. Puedes consultar los registros, pero los cambios y las confirmaciones están desactivados. Un administrador debe completar la actualización de forma coordinada.';
  }
  // Translate only known validation messages; never expose SQL, row contents or
  // arbitrary backend details as a permission error in the operational editor.
  const validationMessages: Record<string, string> = {
    'Numeric score for non-sporting record': 'Hay notas guardadas de jugadores que no figuran como evaluables en esta sesión. Un administrador debe revisar esos registros antes de confirmar.',
    'Stale evaluation snapshot; reload': 'Las evaluaciones han cambiado desde que las revisaste. Recarga la sesión y comprueba las notas antes de confirmar.',
    'Stale workflow state; reload': 'El estado de la sesión ha cambiado en otro dispositivo. Recarga para comprobar si ya está confirmada.',
    'Missing eligible evaluation': 'Faltan evaluaciones de jugadores con participación deportiva registrada. Revisa todos los jugadores antes de confirmar.',
    'Duplicate workflow records': 'Hay registros duplicados de convocatoria, asistencia o evaluación. Un administrador debe revisarlos antes de confirmar.',
    'Invalid evaluation state': 'Revisa que la convocatoria y la asistencia estén confirmadas y que la evaluación siga abierta. Después recarga la sesión.',
    'Confirm callups and attendance first': 'Primero hay que confirmar la convocatoria y la asistencia.',
    'Invalid score': 'Hay una puntuación guardada que no es válida. Revisa las cuatro cualidades antes de confirmar.',
    'Invalid N/A flags': 'Hay marcas N/A guardadas con un formato no válido. Un administrador debe revisar la sesión antes de confirmarla.',
    'Invalid N/A flag': 'Hay una marca N/A guardada con un formato no válido. Un administrador debe revisar la sesión antes de confirmarla.',
    'Maximum high ratings reached': 'Se ha alcanzado el máximo de notas altas (4–5) en una cualidad. Revisa las puntuaciones antes de confirmar.',
    'Maximum low ratings reached': 'Se ha alcanzado el máximo de notas bajas (1–2) en una cualidad. Revisa las puntuaciones antes de confirmar.',
    'Review and initialize the legacy completed accumulation cycle before saving cards': 'Un administrador debe revisar el recuento de tarjetas de una sanción cumplida antes de poder confirmar esta sesión.',
  };
  const message = error.message?.trim() || '';
  if (Object.prototype.hasOwnProperty.call(validationMessages, message)) return validationMessages[message];
  if (error.code === '42501') return 'Tu cuenta no tiene permiso para realizar este cambio. Si la sesión está bloqueada, debe revisarla un administrador.';
  return 'No se ha podido comprobar el permiso o completar el cambio. Recarga la pantalla y vuelve a intentarlo. Si continúa, contacta con un administrador.';
}
