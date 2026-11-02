import { isUnjustifiedAbsence, isJustifiedAbsence, uniqueAttendanceRecords } from '../utils/attendance';
import { loadPerformanceData, readPerformancePages } from '../lib/performance';
import { isCompletedSportingSession, operationalStandouts } from '../utils/evaluationEligibility';
import { evaluationTotal } from '../utils/evaluationScores';
import { copenhagenToday, previousCopenhagenWeek, weekBounds, mondayOfWeek } from '../utils/copenhagenDates';
import { fieldScore } from '../utils/evaluationScores';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { Card, PageTitle } from '../components/ui';
type P={id:string;display_name:string};
type Item={player_id:string;score:number;reasons:string[]};
export function IntelligencePage(){
 const [players,setPlayers]=useState<P[]>([]),[rank,setRank]=useState<Item[]>([]),[concerns,setConcerns]=useState<Item[]>([]),[notes,setNotes]=useState<any[]>([]),[message,setMessage]=useState('');
 const [mustWins,setMustWins]=useState<any[]>([]),[mustWinPlayer,setMustWinPlayer]=useState(''),[trusted,setTrusted]=useState('yes'),[mustWinNotes,setMustWinNotes]=useState(''),[mustWinMonth,setMustWinMonth]=useState(copenhagenToday().slice(0,7));
 const [playerId,setPlayerId]=useState(''),[category,setCategory]=useState('attitude'),[detail,setDetail]=useState('');
 const request=useRef(0);
 const [blocked,setBlocked]=useState(true);
 const [week,setWeek]=useState(()=>previousCopenhagenWeek());
 const {to}=weekBounds(week);
 useEffect(()=>{void load();return()=>{request.current++}},[week]);
 useEffect(()=>{void loadMustWin()},[mustWinMonth]);
 async function loadMustWin(){const {data,error}=await supabase.from('must_win_reviews').select('*').eq('month_start',mustWinMonth+'-01');if(!error)setMustWins(data||[])}
 async function saveMustWin(e:React.FormEvent){e.preventDefault();const {error}=await supabase.from('must_win_reviews').upsert({player_id:mustWinPlayer,month_start:mustWinMonth+'-01',trusted:trusted==='yes',notes:mustWinNotes||null},{onConflict:'player_id,month_start'});if(error)setMessage('Error al guardar: '+error.message);else{setMessage('Revisión mensual guardada correctamente');setMustWinNotes('');await loadMustWin()}}

 async function load(){const version=++request.current;setMessage('');setBlocked(true);setRank([]);setConcerns([]);try {
 const [p,n,performance,standoutRows]=await Promise.all([
   supabase.from('players').select('id,display_name').order('id'),
   supabase.from('staff_flags').select('*').eq('week_start',week),
   loadPerformanceData(),
   readPerformancePages<any>((a,b)=>supabase.from('session_standouts').select('*').order('id').range(a,b))
 ]);
 if(version!==request.current)return;
 if(p.error||n.error)throw p.error||n.error;
 setPlayers((p.data||[]) as P[]);setNotes(n.data||[]);
 const ids=new Set(performance.sessions.filter(s=>isCompletedSportingSession(s)&&s.session_date>=week&&s.session_date<to).map(s=>s.id));
 const ev={data:performance.evaluations.filter(e=>ids.has(e.session_id))};
 const at={data:performance.attendance.filter(a=>!!a.session_id&&ids.has(a.session_id))};
 const st={data:operationalStandouts(standoutRows,performance.sessions).filter(t=>ids.has(t.session_id))};
 const sportingIds=ids;
 const distinctAttendance=uniqueAttendanceRecords(at.data);
 if(distinctAttendance.some(row=>distinctAttendance.filter(other=>other.session_id===row.session_id&&other.player_id===row.player_id).length>1))throw new Error('Asistencias duplicadas: el indicador semanal queda pendiente de revision, sin elegir una fila arbitraria.');
 const skippedStandouts=standoutRows.filter(t=>ids.has(t.session_id)).length-st.data.length;

 const excluded=performance.excluded.filter(e=>ids.has(e.row.session_id));
 if(excluded.length||skippedStandouts)setMessage(excluded.length+' evaluaciones y '+skippedStandouts+' destacados fuera del computo por alcance, elegibilidad o duplicados; originales conservados.');
 const m=new Map<string,Item>();const get=(id:string)=>{if(!m.has(id))m.set(id,{player_id:id,score:0,reasons:[]});return m.get(id)!};
 for(const e of ev.data||[]){if(!sportingIds.has(e.session_id) || !e.evaluated || e.not_applicable)continue;const x=get(e.player_id);const value=evaluationTotal(e);if(value!==null)x.score+=value;for(const k of ['tactical_discipline','decision_making','mentality_attitude'])if(fieldScore(e,k)!==null && Number(e[k])<=2)x.reasons.push(k.replace(/_/g, ' ')+': '+e[k]);}
 for(const a of uniqueAttendanceRecords(at.data||[])){const x=get(a.player_id);if(isUnjustifiedAbsence(a.status)){x.score-=2;x.reasons.push('Ausencia injustificada')}else if(a.status==='late'){x.score-=1;x.reasons.push('Llegada tarde')}else if(isJustifiedAbsence(a.status)||a.status==='justified_late'){x.reasons.push('Justificada: '+a.status.replace(/_/g,' '))}}
 for(const t of st.data||[]){if(!sportingIds.has(t.session_id))continue;const x=get(t.player_id);x.score+=t.category==='top'?2:-1;x.reasons.push(t.category==='top'?'Destacado positivo de la sesión':'Necesita seguimiento en la sesión')}
 setBlocked(false);const all=[...m.values()];setRank([...all].sort((a,b)=>b.score-a.score));setConcerns(all.filter(x=>x.reasons.some(r=>r.includes('Ausencia injustificada')||r.includes('Llegada tarde')||r.includes(': 1')||r.includes(': 2'))).sort((a,b)=>a.score-b.score));} catch(failure){if(version===request.current){setMessage('No se pudo leer el seguimiento: '+String(failure));setRank([]);setConcerns([]);}}}
 async function save(e:React.FormEvent){e.preventDefault();const {error}=await supabase.from('staff_flags').insert({player_id:playerId,week_start:week,category,detail});if(error)setMessage('Error al guardar: '+error.message);else{setDetail('');await load();setMessage('Nota privada guardada correctamente')}}
 const name=(id:string)=>players.find(p=>p.id===id)?.display_name||id;
 const categoryName=(value:string)=>({attitude:'Actitud y compromiso',on_field:'Rendimiento deportivo',off_field:'Fuera del campo',positive:'Observación positiva'} as Record<string,string>)[value]||value;
 const hasActivity=rank.length>0;
 return <div className="weekly-page stack">
  <PageTitle title="Seguimiento semanal" subtitle="Resumen para tomar decisiones · información privada para administradores"/>
  <section className="weekly-hero"><div><span className="weekly-eyebrow">PANEL DEL CUERPO TÉCNICO</span><h2>Lo importante de esta semana, de un vistazo</h2><p>Consulta participación, señales a revisar y notas del equipo. Los datos ayudan a preparar conversaciones; no sustituyen el criterio del entrenador.</p></div><label className="weekly-date">Semana que empieza el<input aria-label="Lunes de la semana" type="date" value={week} onChange={e=>{if(e.target.value)setWeek(mondayOfWeek(e.target.value))}}/></label></section>
  <div className="weekly-metrics"><div className="weekly-metric"><span>Jugadores con actividad registrada</span><strong>{blocked?'Pendiente':rank.length}</strong><small>Con evaluación, asistencia o destacados</small></div><div className="weekly-metric"><span>Situaciones a revisar</span><strong>{blocked?'Pendiente':concerns.length}</strong><small>Señales automáticas, no sanciones</small></div><div className="weekly-metric"><span>Notas privadas</span><strong>{notes.length}</strong><small>Observaciones de esta semana</small></div></div>
  <div className="weekly-columns"><Card><div className="weekly-section-heading"><div><span className="weekly-eyebrow">RENDIMIENTO</span><h3>Destacados de la semana</h3></div><span className="weekly-pill">Orientativo</span></div><p className="muted">Rendimiento oficial desde el 14/10/2026; asistencia del periodo semanal seleccionado. Orden basado en evaluaciones registradas, asistencia y destacados. No es una clasificación objetiva: influye el número de sesiones.</p>{hasActivity?<div className="weekly-list">{rank.slice(0,5).map((x,i)=><div className="weekly-person" key={x.player_id}><span className="weekly-rank">{i+1}</span><div><strong>{name(x.player_id)}</strong><small>{x.reasons.filter(r=>r.includes('Destacado')).slice(0,1).join(' · ')||'Actividad registrada'}</small></div><span className="weekly-score">{x.score.toFixed(1)} <small>pts</small></span></div>)}</div>:<p className="weekly-empty">{blocked ? 'Indicador pendiente de verificar los registros.' : 'No hay datos registrados para esta semana.'}</p>}</Card>
  <Card><div className="weekly-section-heading"><div><span className="weekly-eyebrow">ATENCIÓN</span><h3>Situaciones a revisar</h3></div><span className="weekly-pill">{blocked ? 'Pendiente' : concerns.length} señales</span></div><p className="muted">Ausencias injustificadas, retrasos y puntuaciones bajas. Revisa el contexto antes de tomar decisiones.</p>{concerns.length?<div className="weekly-list">{concerns.map(x=><div className="weekly-concern" key={x.player_id}><strong>{name(x.player_id)}</strong><ul>{x.reasons.filter(r=>r.includes('Ausencia injustificada')||r.includes('Llegada tarde')||r.includes(': 1')||r.includes(': 2')).map((reason,i)=><li key={i}>{reason}</li>)}</ul></div>)}</div>:<p className="weekly-empty">{blocked ? 'Situaciones pendientes de verificar.' : 'No se han detectado se\u00f1ales autom\u00e1ticas en este periodo.'}</p>}</Card></div>
  <Card><div className="weekly-section-heading"><div><span className="weekly-eyebrow">CONFIDENCIAL</span><h3>Notas privadas del cuerpo técnico</h3></div><span className="weekly-pill">Solo administradores</span></div><p className="muted">Anota hechos concretos, con contexto y sin incluir datos personales innecesarios.</p>{notes.length?<div className="weekly-notes">{notes.map(n=><article className="weekly-note" key={n.id}><strong>{name(n.player_id)}</strong><span>{categoryName(n.category)}</span><p>{n.detail}</p></article>)}</div>:<p className="weekly-empty">Todavía no hay notas privadas esta semana.</p>}<h4 className="weekly-form-heading">Añadir observación</h4><form onSubmit={save} className="weekly-form"><label>Jugador<select required value={playerId} onChange={e=>setPlayerId(e.target.value)}><option value="">Seleccionar jugador</option>{players.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label><label>Tipo de observación<select value={category} onChange={e=>setCategory(e.target.value)}><option value="attitude">Actitud y compromiso</option><option value="on_field">Rendimiento deportivo</option><option value="off_field">Fuera del campo</option><option value="positive">Observación positiva</option></select></label><label className="weekly-form-full">Detalle<textarea required value={detail} onChange={e=>setDetail(e.target.value)} placeholder="Describe qué ha ocurrido y por qué es relevante"/></label><button className="primary">Guardar nota privada</button></form>{message&&<p role="status" className="save-feedback">{message}</p>}</Card>
  <Card><div className="weekly-section-heading"><div><span className="weekly-eyebrow">PLANIFICACIÓN</span><h3>Confianza en partidos decisivos</h3></div><span className="weekly-pill">Revisión mensual</span></div><p className="muted">Valoración cualitativa del equipo técnico. Se registra por jugador y mes; no se calcula automáticamente.</p><label className="weekly-month">Mes de revisión<input type="month" value={mustWinMonth} onChange={e=>setMustWinMonth(e.target.value)}/></label><form className="weekly-form" onSubmit={saveMustWin}><label>Jugador<select required value={mustWinPlayer} onChange={e=>setMustWinPlayer(e.target.value)}><option value="">Seleccionar jugador</option>{players.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label><label>¿Confiarías en él en un partido decisivo?<select value={trusted} onChange={e=>setTrusted(e.target.value)}><option value="yes">Sí</option><option value="no">No</option></select></label><label className="weekly-form-full">Motivo (opcional)<textarea placeholder="Contexto de la decisión" value={mustWinNotes} onChange={e=>setMustWinNotes(e.target.value)}/></label><button className="primary">Guardar revisión mensual</button></form>{mustWins.length?<div className="weekly-notes">{mustWins.map(x=><article className="weekly-note" key={x.id}><strong>{name(x.player_id)}</strong><span>{x.trusted?'Sí, confianza':'No, revisar'}</span>{x.notes&&<p>{x.notes}</p>}</article>)}</div>:<p className="weekly-empty">No hay revisiones registradas para este mes.</p>}</Card>
 </div>;
}
