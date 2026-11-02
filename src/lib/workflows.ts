import { supabase } from '../supabase';
export type Workflow = 'callup' | 'attendance' | 'evaluation';
export async function workflowAction(sessionId: string, workflow: Workflow, action: 'confirm' | 'reopen', rows: unknown[] = [], recordsOnly = false) {
  const { data, error } = await supabase.rpc('batch4_workflow_action', { p_session: sessionId, p_workflow: workflow, p_action: action, p_rows: rows, p_records_only: recordsOnly });
  if (error) throw new Error(error.message);
  if (!data || data.id !== sessionId || data[`${workflow}_confirmed`] !== (action === 'confirm')) throw new Error('No se verificó el estado. Recarga antes de reintentar.');
  return data;
}
