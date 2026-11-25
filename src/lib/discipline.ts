import { supabase } from '../supabase';
import { workflowError } from '../utils/workflowErrors';
import type {ServiceCandidate} from '../utils/discipline';

export type DisciplineBalance={player_id:string;display_name:string;cycle_yellows:number;yellow_threshold:number;historical_yellows:number;historical_reds:number;
  second_yellow_dismissals:number;direct_reds:number;yellow_red_dismissals:number;needs_cycle_review:boolean;undecided_yellow_events:number};
export type DisciplineCase={id:string;player_id:string;display_name:string;source:string;status:string;matches_total:number|null;matches_served:number;matches_remaining:number|null;
  verified_matches_served:number;needs_review:boolean;revision:number;reason:string|null;decision_notes:string|null;decision_date:string|null;applicable_from:string|null;
  origin_match_name:string|null;origin_match_date:string|null;created_from_session_id:string|null;linked_card_id:string|null;accumulation_threshold:number|null;request_key?:string|null};
export type DisciplineRules={revision:number;competition_name:string;season_start:string;yellow_threshold:number;double_yellow_units:number|null;yellow_red_units:number|null};
export type DisciplineService={id:string;suspension_id:string;player_id:string;session_id:string;session_name:string;session_date:string;notes:string;revoked_at:string|null};
export type DisciplineWorkspace={version:2;rules:DisciplineRules;balances:DisciplineBalance[];cases:DisciplineCase[];service_matches:DisciplineService[];matches:ServiceCandidate[]};
function checkedWorkspace(data:unknown):DisciplineWorkspace {
  const value=data as DisciplineWorkspace;
  if(!value||value.version!==2||!value.rules||!Array.isArray(value.cases)||!Array.isArray(value.balances)||!Array.isArray(value.service_matches)||!Array.isArray(value.matches))
    throw new Error('No se ha podido verificar la gestión de sanciones. Recarga antes de guardar.');
  return value;
}
export async function loadDisciplineWorkspace(playerId?:string):Promise<DisciplineWorkspace|null> {
  const {data,error}=await supabase.rpc('discipline_workspace',{p_player:playerId||null});
  if(error?.code==='PGRST202')return null;
  if(error)throw new Error(workflowError(error));
  return checkedWorkspace(data);
}
export async function disciplineAction(action:string,payload:Record<string,unknown>,revision?:number):Promise<DisciplineWorkspace> {
  const {data,error}=await supabase.rpc('discipline_action',{p_action:action,p_payload:payload,p_expected_revision:revision??null});
  if(error)throw new Error(error.code==='40001'?'Los datos han cambiado. Actualiza las sanciones antes de guardar.':error.message||workflowError(error));
  return checkedWorkspace(data);
}

export async function saveDisciplinaryCard(sessionId: string, playerId: string, draft: {type: string; reason: string; matches: string}, expected: unknown, modern=false) {
  const {data,error}=await supabase.rpc(modern?'discipline_save_card':'batch4_save_card',{
    p_session:sessionId,p_player:playerId,p_type:draft.type,p_reason:draft.reason || null,
    p_matches:modern?(draft.matches.trim()===''?null:Number(draft.matches)):Number(draft.matches),p_expected:expected || null,
  });
  if(error)throw new Error(modern ? error.message || workflowError(error) : workflowError(error));
  if(!data || data.session_id!==sessionId || data.player_id!==playerId || data.saved!==true)throw new Error('No se ha verificado la tarjeta. Recarga antes de reintentar.');
  return data;
}

export async function completeSuspension(id: string, initializeLegacyCycle = false) {
  const {data,error}=await supabase.rpc(initializeLegacyCycle?'batch4_initialize_discipline_cycle':'batch4_complete_suspension',{p_suspension:id});
  if(error)throw new Error(workflowError(error));
  if(!data || data.id!==id || data.status!=='served' || (initializeLegacyCycle?data.cycle_initialized!==true:data.matches_served!==data.matches_total))throw new Error('No se ha verificado la sanción cumplida. Recarga antes de reintentar.');
  return data;
}
