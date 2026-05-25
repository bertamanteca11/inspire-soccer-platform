import type { Session } from '../types';

export type Tab = 'home'|'players'|'sessions'|'callup'|'attendance'|'evaluation'|'injuries'|'summary'|'history';

export type AppSession = Session & {
  start_time?: string | null;
  callup_confirmed?: boolean;
  callup_confirmed_at?: string | null;
  attendance_confirmed?: boolean;
  attendance_confirmed_at?: string | null;
  evaluation_confirmed?: boolean;
  evaluation_confirmed_at?: string | null;
  opponent?: string | null;
  low_rating_limit?: number | null;
  responsible?: string | null;
  home_away?: string | null;
};

export type PlayerCardTotal = {
  player_id: string;
  display_name: string;
  yellow_cards: number;
  red_cards: number;
  total_cards?: number;
};

export const ratingFields = [
  ['tactical_discipline', 'Disciplina táctica'],
  ['effort_commitment', 'Esfuerzo / compromiso'],
  ['decision_making', 'Toma de decisiones'],
  ['mentality_attitude', 'Mentalidad / actitud'],
  ['coachability', 'Capacidad de corrección'],
] as const;

export const attendanceOptions = [
  ['present', 'Presente'],
  ['late', 'Tarde'],
  ['justified_late', 'Tarde justificado'],
  ['justified_absence', 'Ausencia justificada'],
  ['unjustified_absence', 'Ausencia injustificada'],
  ['injured', 'Lesionado'],
] as const;

export const attendanceNeedsExplanation = ['late','justified_late','justified_absence','unjustified_absence','injured'];

export const cardOptions = [
  ['none', 'Sin tarjeta'],
  ['yellow', 'Amarilla'],
  ['double_yellow', 'Doble amarilla'],
  ['straight_red', 'Roja directa'],
] as const;
