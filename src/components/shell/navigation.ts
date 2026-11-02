import { Activity, Users, CalendarDays, BarChart3, ClipboardList, Star, HeartPulse, Shield, Award, FileText, History } from 'lucide-react';
import type { Role } from '../../types';
import type { Tab } from '../../utils/appTypes';

// Mirrors existing menu visibility; App's separate route guards stay unchanged.
export const destinations = [
  { tab: 'home', label: 'Inicio', icon: Activity, group: 'Vista general', staff: false },
  { tab: 'players', label: 'Equipo', icon: Users, group: 'Jugadores y rendimiento', staff: true },
  { tab: 'sessions', label: 'Sesiones', icon: CalendarDays, group: 'Operativa del equipo', staff: true },
  { tab: 'summary', label: 'Resumen', icon: BarChart3, group: 'Jugadores y rendimiento', staff: false },
  { tab: 'callup', label: 'Convocatoria', icon: Users, group: 'Operativa del equipo', staff: true },
  { tab: 'attendance', label: 'Asistencia', icon: ClipboardList, group: 'Operativa del equipo', staff: false },
  { tab: 'evaluation', label: 'Evaluar', icon: Star, group: 'Operativa del equipo', staff: false },
  { tab: 'standouts', label: 'Destacados', icon: Award, group: 'Jugadores y rendimiento', staff: true },
  { tab: 'injuries', label: 'Lesiones', icon: HeartPulse, group: 'Operativa del equipo', staff: false },
  { tab: 'veo', label: 'VEO Analytics', icon: BarChart3, group: 'Análisis e informes', staff: true },
  { tab: 'intelligence', label: 'Seguimiento semanal', icon: Shield, group: 'Análisis e informes', staff: true, adminOnly: true },
  { tab: 'reports', label: 'Informes', icon: FileText, group: 'Análisis e informes', staff: true },
  { tab: 'history', label: 'Histórico', icon: History, group: 'Análisis e informes', staff: true },
] satisfies { tab: Tab; label: string; icon: typeof Activity; group: string; staff: boolean; adminOnly?: boolean }[];
export function visibleDestinations(role: Role) {
  return destinations.filter(item => ('adminOnly' in item && item.adminOnly) ? role === 'admin' : !item.staff || role === 'admin' || role === 'coach');
}
export const primaryTabs: Tab[] = ['home', 'players', 'sessions', 'summary'];
// Match application-shell.css: a wide but short phone still uses mobile navigation.
export const SIDEBAR_MEDIA = '(min-width: 768px) and (min-height: 500px)';
export const navigationGroups = ['Vista general', 'Operativa del equipo', 'Jugadores y rendimiento', 'Análisis e informes'];
