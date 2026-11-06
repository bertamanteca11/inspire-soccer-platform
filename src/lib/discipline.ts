import { supabase } from '../supabase';
import { workflowError } from '../utils/workflowErrors';

export async function saveDisciplinaryCard(sessionId: string, playerId: string, draft: {type: string; reason: string; matches: string}, expected: unknown) {
  const {data,error}=await supabase.rpc('batch4_save_card',{
    p_session:sessionId,p_player:playerId,p_type:draft.type,p_reason:draft.reason || null,
    p_matches:Number(draft.matches),p_expected:expected || null,
  });
  if(error)throw new Error(workflowError(error));
  if(!data || data.session_id!==sessionId || data.player_id!==playerId || data.saved!==true)throw new Error('No se ha verificado la tarjeta. Recarga antes de reintentar.');
  return data;
}

export async function completeSuspension(id: string, initializeLegacyCycle = false) {
  const {data,error}=await supabase.rpc(initializeLegacyCycle?'batch4_initialize_discipline_cycle':'batch4_complete_suspension',{p_suspension:id});
  if(error)throw new Error(workflowError(error));
  if(!data || data.id!==id || data.status!=='served' || (initializeLegacyCycle?data.cycle_initialized!==true:data.matches_served!==data.matches_total))throw new Error('No se ha verificado la sanción cumplida. Recarga antes de reintentar.');
  return data;
}
