import { supabase } from '../supabase';

export type StaffMember = { id: string; name: string; job: string; active: boolean; cycle_yellows: number; historical_yellows: number; historical_reds: number };
export type StaffCallup = { staff_id: string; status: string };
export type StaffAttendance = { staff_id: string; status: string; notes: string | null };
export type StaffCard = { id: string; staff_id: string; type: string; reason: string; created_at: string };
export type StaffSuspension = { id: string; staff_id: string; source: string; matches_total: number; served_at: string | null };
export type StaffWorkspace = {
  session_id: string | null; revision: number; workflow: { callup_confirmed: boolean; attendance_confirmed: boolean };
  members: StaffMember[]; callups: StaffCallup[]; attendance: StaffAttendance[]; cards: StaffCard[]; suspensions: StaffSuspension[];
};
function verifiedWorkspace(data: any, sessionId: string | null): StaffWorkspace {
  if (data?.session_id !== sessionId || !Number.isSafeInteger(data?.revision) || data.revision < 0 ||
    typeof data?.workflow?.callup_confirmed !== 'boolean' || typeof data?.workflow?.attendance_confirmed !== 'boolean' ||
    !['members','callups','attendance','cards','suspensions'].every(key => Array.isArray(data[key]))) {
    throw new Error('No se han podido verificar los datos del staff. Actualiza antes de continuar.');
  }
  return data;
}
function staffError(error: { code?: string; message: string }) {
  if (error.code === '42501') return 'No tienes acceso a esta sección privada o la sesión no admite cambios.';
  if (['PGRST202','PGRST205','42P01','42883'].includes(error.code || '')) return 'La sección de staff está pendiente de instalar en Supabase.';
  if (error.code === '23514') return 'Revisa los datos: los retrasos y ausencias necesitan una explicación.';
  return error.message;
}
export async function readStaffWorkspace(sessionId: string | null) {
  const { data, error } = await supabase.rpc('private_staff_workspace', { p_session: sessionId });
  if (error) throw new Error(staffError(error));
  return verifiedWorkspace(data, sessionId);
}
export async function staffAction(workspace: StaffWorkspace, action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('private_staff_action', {
    p_session: workspace.session_id, p_action: action, p_payload: payload, p_revision: workspace.revision,
  });
  if (error) throw new Error(staffError(error));
  const result = verifiedWorkspace(data, workspace.session_id);
  if (result.revision !== workspace.revision + 1) throw new Error('El guardado no se ha podido verificar. Actualiza antes de reintentar.');
  return result;
}
