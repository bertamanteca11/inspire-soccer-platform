import type { AppSession } from './appTypes';

export function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export function buildSessionLabel(session: AppSession) {
  const time = session.start_time || '';
  const opponent = session.opponent ? ` · vs ${session.opponent}` : '';
  return `${translateSessionType(session.type)} · ${formatDate(session.session_date)}${time ? ` · ${time}` : ''}${opponent}`;
}

export function translatePosition(position?: string | null) {
  const map: Record<string, string> = { goalkeeper: 'Portero', defender: 'Defensa', midfielder: 'Mediocentro', winger: 'Extremo', forward: 'Delantero' };
  return position ? map[position] || position : '';
}

export function translateStatus(status?: string | null) {
  const map: Record<string, string> = { active: 'Activo', injured: 'Lesionado', inactive: 'Baja', trial: 'Prueba', guest: 'Invitado' };
  return status ? map[status] || status : '';
}

export function translateSessionType(type?: string | null) {
  const map: Record<string, string> = { training: 'Entreno', league_match: 'Partido liga', friendly_match: 'Partido amistoso', tryout: 'Tryout', scrimmage: 'Scrimmage' };
  return type ? map[type] || type : '';
}

export function translateInjuryStatus(status?: string | null) {
  const map: Record<string, string> = { active: 'Abierta', recovered: 'Superada', pending_review: 'Pendiente revisión', minor_discomfort: 'Molestia leve' };
  return status ? map[status] || status : '';
}

export function translateAttendance(status?: string | null) {
  const map: Record<string, string> = { present:'Presente', late:'Tarde', justified_late:'Tarde justificado', justified_absence:'Ausencia justificada', unjustified_absence:'Ausencia injustificada', injured:'Lesionado' };
  return status ? map[status] || status : '';
}

export function cleanDbError(message: string) {
  if (message.includes('Maximum high ratings')) return 'Has llegado al máximo de jugadores con puntuación alta en esta categoría. Cambia una evaluación anterior para continuar.';
  if (message.includes('Maximum low ratings')) return 'Has llegado al máximo de jugadores con puntuación baja en esta categoría. Cambia una evaluación anterior para continuar.';
  if (message.includes('locked')) return 'Esta sesión está bloqueada. Solo un administrador puede editarla.';
  return message;
}
