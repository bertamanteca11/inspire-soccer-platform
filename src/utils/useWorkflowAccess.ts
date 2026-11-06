import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { Workflow } from '../lib/workflows';
import { workflowError } from './workflowErrors';
// Backend checks are authoritative. Missing migration/network errors disable editing.
export function useWorkflowAccess(sessionId: string, workflow: Workflow, confirmed: boolean) {
  const [access, setAccess] = useState({ sessionId: '', ready: false, canEdit: false, error: '' });
  useEffect(() => {
    let cancelled = false;
    setAccess({ sessionId, ready: false, canEdit: false, error: '' });
    supabase.rpc('batch4_workflow_access', { p_session: sessionId, p_workflow: workflow }).then(({ data, error }) => {
      if (!cancelled) setAccess({ sessionId, ready: true, canEdit: !error && data === true, error: workflowError(error) });
    }, () => { if (!cancelled) setAccess({ sessionId, ready: true, canEdit: false, error: 'No se pudieron verificar los permisos.' }); });
    return () => { cancelled = true; };
  }, [sessionId, workflow, confirmed]);
  return { ...access, canEdit: access.sessionId === sessionId && access.ready && access.canEdit };
}
