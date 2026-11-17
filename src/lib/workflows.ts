import { supabase } from '../supabase';
import { workflowError } from '../utils/workflowErrors';
export type Workflow = 'callup' | 'attendance' | 'evaluation';
export type WorkflowDiagnostic = { session_id: string; workflow: Workflow; action: 'confirm' | 'reopen'; code: string | null; message: string };
export class WorkflowActionError extends Error {
  constructor(public readonly diagnostic: WorkflowDiagnostic, userMessage: string) {
    super(userMessage);
  }
}
export async function workflowAction(sessionId: string, workflow: Workflow, action: 'confirm' | 'reopen', rows: unknown[] = [], recordsOnly = false, expectedRows?: unknown[]) {
  const { data, error } = await supabase.rpc('batch4_workflow_action', {
    p_session: sessionId, p_workflow: workflow, p_action: action, p_rows: rows, p_records_only: recordsOnly,
    ...(expectedRows !== undefined ? { p_expected_rows: expectedRows } : {}),
  });
  if (error) throw new WorkflowActionError({session_id:sessionId,workflow,action,code:error.code || null,message:error.message || 'Unknown workflow error'},workflowError(error));
  if (!data || data.id !== sessionId || data[`${workflow}_confirmed`] !== (action === 'confirm')) throw new Error('No se verificó el estado. Recarga antes de reintentar.');
  return data;
}
