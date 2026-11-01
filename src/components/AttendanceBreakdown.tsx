import { ATTENDANCE_METRICS, attendanceStats, type AttendanceRecord } from '../utils/attendance';

export function AttendanceBreakdown({ rows, error = '' }: { rows: readonly AttendanceRecord[]; error?: string }) {
  if (error) return <p role="alert">No se pudo cargar la asistencia: {error}</p>;
  const stats = attendanceStats(rows);
  return <section className="profile-section">
    <strong>Detalle de asistencia</strong>
    {ATTENDANCE_METRICS.map(([key, label]) => <p key={key}>{label}: <strong>{stats[key]}</strong></p>)}
    <p className="muted">Sin registro no implica ausencia. Las ausencias explícitas cuentan también sin convocatoria.
      El estado antiguo «injured» se mantiene sin clasificar como ausencia.</p>
  </section>;
}
