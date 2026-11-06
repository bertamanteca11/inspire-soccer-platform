import {sportPlayers,sportSessions,sportCallups,sportAttendance,sportEvaluations,sportStandouts} from './evaluation.fixture';
export const players=sportPlayers.map((p,i)=>({...p,status:i===4?'inactive':p.status,career_notes:'Trayectoria de '+p.display_name}));
export const sessions=sportSessions;
export const calls=sportCallups.map(row=>({...row,players:players.find(p=>p.id===row.player_id)}));
export const visits=sportAttendance.map(row=>({...row,players:players.find(p=>p.id===row.player_id)}));
export const evaluations=sportEvaluations.map(row=>({...row,comment:'Comentario histórico de '+players.find(p=>p.id===row.player_id)!.display_name}));
export const standouts=sportStandouts;
export const injuries=[{id:'injury-1',session_id:sessions[0].id,player_id:players[0].id,start_date:'2026-10-20',status:'active',injury_type:'Tobillo',notes:'Revisión semanal',players:{display_name:players[0].display_name}}];
