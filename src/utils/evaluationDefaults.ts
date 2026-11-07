import type { AppSession } from './appTypes';
import { newEvaluationDraft, isSportingActivity } from './evaluationEligibility';

// Open operational editors start at 3 regardless of the session's creation date.
// Stored decisions (including N/A) and confirmed-session gaps always prevail.
export function usesEvaluationDefaults(session: AppSession): boolean {
  return session.callup_confirmed===true
    && session.attendance_confirmed===true && session.evaluation_confirmed===false
    && session.records_only_confirmed!==true && ['planned','completed'].includes(session.status)
    && isSportingActivity(session);
}

export function evaluationEditorRow(session: AppSession, playerId: string, stored?: any): any {
  if(stored)return stored;
  if(!playerId)return undefined;
  if(!usesEvaluationDefaults(session))return undefined;
  return {id:null,session_id:session.id,player_id:playerId,coachability:3,
    not_applicable:false,comment:null,...newEvaluationDraft(true)};
}

export function reviewedEvaluationRows(session: AppSession, rows: readonly any[], eligibleIds: readonly string[]): any[] {
  const result=[...rows];
  for(const id of eligibleIds){
    if(!rows.some(row=>row.player_id===id)){
      const draft=evaluationEditorRow(session,id);if(draft)result.push(draft);
    }
  }
  return result;
}
