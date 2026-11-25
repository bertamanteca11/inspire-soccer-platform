export type CardLike = {type?:string;discipline_kind?:string|null;voided_at?:string|null};
export function cardKind(card?:CardLike|null):string { return card?.discipline_kind || card?.type || 'none'; }
export function cardYellows(card:CardLike):number {
  if(card.voided_at)return 0;
  const kind=cardKind(card);return kind==='double_yellow'?2:['yellow','yellow_red'].includes(kind)?1:0;
}
export function isDismissal(card:CardLike):boolean { return !card.voided_at&&['double_yellow','straight_red','yellow_red'].includes(cardKind(card)); }
export function isPendingSanction(row:{status:string}):boolean { return ['awaiting_decision','active','partially_served'].includes(row.status); }
// Saving a new decision can initialise a legacy dismissal with no service history.
// Completed/cancelled cases, accumulation cycles and any ledger history still need
// an explicit review; never discard or infer a previously served match.
export function hasEmptyLegacyService(row:{id:string;source:string;status:string;needs_review:boolean;matches_served:number;verified_matches_served:number},services:{suspension_id:string}[]):boolean {
  return row.needs_review&&['active','awaiting_decision'].includes(row.status)
    &&['straight_red','double_yellow','yellow_red','manual'].includes(row.source)
    &&row.matches_served===0&&row.verified_matches_served===0&&!services.some(s=>s.suspension_id===row.id);
}
export function sanctionRemaining(row:{matches_total:number|null;matches_served:number;needs_review?:boolean}):string {
  if(row.needs_review)return 'Cumplimiento anterior pendiente de revisar';
  if(row.matches_total===null)return 'Pendiente de resolución';
  const remaining=Math.max(0,Number(row.matches_total)-Number(row.matches_served));
  return `${remaining} ${remaining===1?'partido pendiente':'partidos pendientes'}`;
}
export const sanctionStatus:Record<string,string>={awaiting_decision:'Pendiente de resolución',active:'Pendiente',partially_served:'Parcialmente cumplida',served:'Cumplida',cancelled:'Cancelada'};
export type ServiceCandidate={id:string;name:string;session_date:string;type:string;status:string;attendance_status?:string|null;callup_status?:string|null};
export function serviceCandidates(row:{player_id:string;applicable_from:string|null;origin_match_date?:string|null},matches:ServiceCandidate[],services:{player_id:string;session_id:string;revoked_at?:string|null}[]) {
  if(!row.applicable_from)return [];
  return matches.filter(m=>m.type==='league_match'&&m.status==='completed'&&m.session_date>=row.applicable_from!
    &&(!row.origin_match_date||m.session_date>row.origin_match_date)
    &&!services.some(s=>s.player_id===row.player_id&&s.session_id===m.id&&!s.revoked_at));
}
