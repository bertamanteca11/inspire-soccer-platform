type BackendError = { code?: string; message?: string } | null | undefined;
export function workflowError(error: BackendError): string {
  if (!error) return '';
  if (error.code === 'PGRST202' || /could not find the function|schema cache.*function/i.test(error.message || '')) {
    return 'La actualización de la base de datos está pendiente. Puedes consultar los registros, pero los cambios y las confirmaciones están desactivados. Un administrador debe completar la actualización de forma coordinada.';
  }
  if (error.code === '42501') return 'Tu cuenta no tiene permiso para realizar este cambio. Si la sesión está bloqueada, debe revisarla un administrador.';
  return 'No se ha podido comprobar el permiso o completar el cambio. Recarga la pantalla y vuelve a intentarlo. Si continúa, contacta con un administrador.';
}
