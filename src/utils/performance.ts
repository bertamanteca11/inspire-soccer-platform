// Keep aligned with the existing public.official_evaluations view.
export const OFFICIAL_PERFORMANCE_START = '2026-10-14';
export const OFFICIAL_PERFORMANCE_LABEL = 'Rendimiento oficial desde el 14/10/2026';

export type PerformanceSession = {
  session_date?: string | null;
  records_only_confirmed?: boolean | null;
};

// Used for session summaries and subjective Top/Bottom records (not attendance).
export function isOfficialPerformanceSession(session?: PerformanceSession | null): boolean {
  return !!session?.session_date && session.session_date >= OFFICIAL_PERFORMANCE_START
    && session.records_only_confirmed !== true;
}
