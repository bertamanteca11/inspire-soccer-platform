import {useRef,useState} from 'react';
import type {Role} from '../types';
import {disciplineAction,loadDisciplineWorkspace,type DisciplineBalance,type DisciplineCase,type DisciplineRules,type DisciplineWorkspace} from '../lib/discipline';
import {hasEmptyLegacyService,isPendingSanction,sanctionRemaining,sanctionStatus,serviceCandidates} from '../utils/discipline';
import {translateCard,formatDate} from '../utils/formatters';
import {Card} from './ui';

export function DisciplineBalanceSummary({balance}:{balance:DisciplineBalance}) {
  return <div className="suspension-player-balance">
    <strong>{balance.needs_cycle_review?`Acumulación pendiente de revisar · ${balance.cycle_yellows} confirmadas`:`${balance.cycle_yellows} / ${balance.yellow_threshold} hacia la próxima sanción`}</strong>
    <small>{balance.historical_yellows} amarillas en total histórico · {balance.historical_reds} expulsiones</small>
    {(balance.historical_reds>0||!!balance.undecided_yellow_events)&&<details><summary>Detalle de tarjetas</summary>
      {!!balance.undecided_yellow_events&&<p>Hay amarillas cuyo cómputo para acumulación está pendiente de confirmar.</p>}
      {balance.historical_reds>0&&<small>{balance.second_yellow_dismissals} por doble amarilla · {balance.direct_reds} rojas directas · {balance.yellow_red_dismissals} amarilla + roja directa</small>}
    </details>}
  </div>;
}

type Mutation=(action:string,payload:Record<string,unknown>,revision?:number)=>Promise<DisciplineWorkspace|null>;
export function DisciplineManager({role,initial,playerId,onChanged}:{role:Role;initial:DisciplineWorkspace;playerId?:string;onChanged?:()=>void|Promise<void>}) {
  const [data,setData]=useState(initial),[selected,setSelected]=useState<string|null>(()=>{
    const pending=initial.cases.filter(isPendingSanction);
    return playerId&&pending.length===1?pending[0].id:null;
  }),[creating,setCreating]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const pending=useRef(false),canManage=role==='admin'||role==='coach';
  const mutate:Mutation=async(action,payload,revision)=>{
    if(!canManage||pending.current)return null;
    pending.current=true;setBusy(true);setError('');setNotice('');
    try {
      const result=await disciplineAction(action,payload,revision);
      let next=result;
      if(!playerId){try{next=await loadDisciplineWorkspace()||result;}catch{setError('Cambio guardado; no se pudo recargar la lista completa. Actualiza las sanciones.');}}
      setData(next);setNotice(action==='serve_match'?'Partido cumplido guardado.':action==='revoke_match'?'Cumplimiento corregido.':'Sanción guardada.');
      try{await onChanged?.();}catch{setError('Cambio guardado; recarga para actualizar los demás avisos.');}
      if(action==='save_case'){
        const saved=next.cases.find(s=>s.id===payload.id)||next.cases.find(s=>(s as any).request_key===payload.request_key);
        setCreating(false);setSelected(saved?.id||null);
      }
      return next;
    }catch(failure){setError(failure instanceof Error?failure.message:String(failure));return null;}
    finally{pending.current=false;setBusy(false);}
  };
  async function refresh(){
    if(pending.current)return;setBusy(true);setError('');
    try{const next=await loadDisciplineWorkspace(playerId);if(!next)throw new Error('La gestión de sanciones no está disponible.');setData(next);}
    catch(failure){setError(String(failure));}finally{setBusy(false);}
  }
  const active=data.cases.filter(isPendingSanction);
  const history=data.cases.filter(s=>!isPendingSanction(s));
  const selectedCase=data.cases.find(s=>s.id===selected);
  return <Card className="discipline-manager">
    {!playerId&&<h3>Sanciones pendientes</h3>}
    {notice&&<p role="status" className="save-feedback success">{notice}</p>}
    {error&&<p role="alert" className="save-feedback failure">{error}</p>}
    {!active.length&&!selectedCase&&!creating&&<p>No hay sanciones pendientes.</p>}
    {active.filter(s=>s.id!==selected).map(s=><div key={s.id} className="stack suspension-management-row">
      <strong>{s.display_name} · {s.source==='yellow_accumulation'?'Acumulación de amarillas':s.source==='manual'?'Otra sanción':translateCard(s.source)}</strong>
      <span>{sanctionRemaining(s)}</span>
      {s.origin_match_name&&<small>{s.origin_match_name}{s.origin_match_date?' · '+formatDate(s.origin_match_date):''}</small>}
      {canManage&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setCreating(false);setSelected(s.id);setError('');}}>Ver / editar sanción</button>}
    </div>)}
    {(creating||selectedCase)&&<CaseEditor key={creating?'new':`${selectedCase!.id}:${selectedCase!.revision}`} row={creating?undefined:selectedCase} data={data} playerId={playerId} busy={busy} mutate={mutate} onClose={()=>{setSelected(null);setCreating(false);}}/>}
    {!!history.length&&<details><summary>Sanciones anteriores ({history.length})</summary>
      {history.map(s=><div key={s.id} className="stack suspension-management-row"><strong>{s.display_name} · {sanctionStatus[s.status]}</strong><span>{s.reason}</span>
        {s.needs_review&&<small>Registro antiguo pendiente de revisar</small>}
        {canManage&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setCreating(false);setSelected(s.id);}}>{s.needs_review?'Revisar registro anterior':'Ver detalle'}</button>}
      </div>)}
    </details>}
    <details><summary>Más opciones</summary>
      <button type="button" className="secondary" disabled={busy} onClick={()=>void refresh()}>Actualizar sanciones</button>
      {canManage&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setSelected(null);setCreating(true);setError('');}}>Añadir otra sanción</button>}
      {!playerId&&<details><summary>Cuenta de amarillas</summary>{data.balances.map(b=><div key={b.player_id}><strong>{b.display_name}</strong><DisciplineBalanceSummary balance={b}/></div>)}</details>}
      {role==='admin'&&<details><summary>Reglas de la liga</summary><RulesEditor key={data.rules.revision} rules={data.rules} busy={busy} mutate={mutate}/></details>}
    </details>
  </Card>;
}

function CaseEditor({row,data,playerId,busy,mutate,onClose}:{row?:DisciplineCase;data:DisciplineWorkspace;playerId?:string;busy:boolean;mutate:Mutation;onClose:()=>void}) {
  const [player,setPlayer]=useState(playerId||row?.player_id||''),[matches,setMatches]=useState(row?.matches_total==null?'':String(row.matches_total));
  const [from,setFrom]=useState(row?.applicable_from||''),[decision,setDecision]=useState(row?.decision_date||'');
  const [notes,setNotes]=useState(row?.decision_notes||''),[review,setReview]=useState(false),[cancelled,setCancelled]=useState(row?.status==='cancelled');
  const [origin,setOrigin]=useState(row?.created_from_session_id||'');
  const [matchId,setMatchId]=useState(''),[serviceNotes,setServiceNotes]=useState(''),[verified,setVerified]=useState(false);
  const [validation,setValidation]=useState('');
  const fromInput=useRef<HTMLInputElement>(null);
  const requestKey=useRef(crypto.randomUUID());
  const dirty=!!row&&(matches!==(row.matches_total==null?'':String(row.matches_total))||from!==(row.applicable_from||'')||origin!==(row.created_from_session_id||'')||decision!==(row.decision_date||'')||notes!==(row.decision_notes||'')||review||cancelled!==(row.status==='cancelled'));
  const services=row?data.service_matches.filter(m=>m.suspension_id===row.id):[];
  const candidates=row?serviceCandidates(row,data.matches,data.service_matches):[];
  const initialiseEmpty=!!row&&hasEmptyLegacyService(row,data.service_matches);
  const manualReview=!!row?.needs_review&&!initialiseEmpty;
  const decisionChanged=!!row&&(matches!==(row.matches_total==null?'':String(row.matches_total))||cancelled!==(row.status==='cancelled'));
  const reviewRequired=manualReview&&(decisionChanged||review);
  const reviewMissing=reviewRequired&&(!review||!notes.trim());
  async function save(event:React.FormEvent){
    event.preventDefault();
    if(reviewMissing){setValidation(!review?'Confirma los partidos cumplidos antes de cambiar esta sanción anterior.':'Añade el motivo de la revisión para guardar.');return;}
    setValidation('');
    if(row?.needs_review&&review&&row.matches_served!==row.verified_matches_served&&!window.confirm(`Esta revisión sustituirá los ${row.matches_served} partidos del contador antiguo por ${row.verified_matches_served} partidos verificados. El dato original quedará en el registro de auditoría. ¿Confirmar revisión?`))return;
    await mutate('save_case',{...(row?{id:row.id}:{player_id:player,source:'manual',request_key:requestKey.current}),matches_total:matches===''?null:Number(matches),applicable_from:from||null,
      decision_date:decision||null,origin_session_id:origin||null,
      decision_notes:notes.trim()||(initialiseEmpty?'Decisión actualizada: no había partidos cumplidos ni partidos identificados en este expediente.':null),
      review_history:review||initialiseEmpty,cancelled},row?.revision);
  }
  return <section className="discipline-case-editor" aria-label="Editar sanción">
    {!playerId&&<div className="row"><h4>{row?'Duración de la sanción':'Nueva sanción'}</h4><button type="button" className="chip" disabled={busy} onClick={onClose}>Cerrar edición</button></div>}
    {row&&<p className="muted">{row.source==='yellow_accumulation'?'Acumulación de amarillas':row.source==='manual'?'Otra sanción':translateCard(row.source)}{row.origin_match_name?` · ${row.origin_match_name}${row.origin_match_date?' · '+formatDate(row.origin_match_date):''}`:''}</p>}
    {validation&&<p role="alert">{validation}</p>}
    {row&&<div className="stack discipline-case-service">
      <p className="discipline-service-progress">{row.status==='cancelled'?'Sanción cancelada':initialiseEmpty?'Partidos cumplidos: 0':row.needs_review?'Cumplimiento anterior pendiente de revisar':row.matches_total===null?`${row.verified_matches_served} partidos cumplidos · Duración pendiente`:`Cumplidos: ${row.verified_matches_served} / ${row.matches_total} · Quedan ${Math.max(0,row.matches_total-row.verified_matches_served)}`}</p>
      {row.status==='served'&&!row.needs_review&&<strong>Sanción cumplida</strong>}
      {(row.status!=='served'||row.needs_review)&&row.status!=='cancelled'&&<details className="discipline-register-service"><summary>Registrar partido cumplido</summary><div className="stack">
        {(!row.applicable_from||dirty||initialiseEmpty)&&<div><p>Guarda primero la duración y la fecha del primer partido de sanción. Si aún no sabes la duración, deja los partidos en blanco.</p><button type="button" className="secondary" onClick={()=>fromInput.current?.focus()}>Indicar fecha del primer partido</button></div>}
        <label>Partido cumplido<select value={matchId} disabled={busy||dirty||initialiseEmpty||!row.applicable_from} onChange={e=>setMatchId(e.target.value)}><option value="">Seleccionar partido de liga</option>{candidates.map(m=><option key={m.id} value={m.id}>{m.name} · {formatDate(m.session_date)}{m.attendance_status?` · ${m.attendance_status}`:''}</option>)}</select></label>
        {!candidates.length&&row.applicable_from&&<p>No hay partidos disponibles. Revisa en Sesiones que el partido sea de liga, esté completado y sea posterior a la tarjeta y a partir de la fecha indicada.</p>}
        <label className="discipline-check"><input type="checkbox" checked={verified} disabled={busy||dirty||initialiseEmpty||!row.applicable_from} onChange={e=>setVerified(e.target.checked)}/>Confirmo que no jugó por esta sanción.</label>
        <label>Comentario del cumplimiento<textarea value={serviceNotes} disabled={busy} maxLength={4000} onChange={e=>setServiceNotes(e.target.value)}/></label>
        <button type="button" className="primary" disabled={busy||dirty||initialiseEmpty||!matchId||!verified||!serviceNotes.trim()} onClick={()=>void mutate('serve_match',{id:row.id,session_id:matchId,verified_not_played:verified,notes:serviceNotes},row.revision)}>Guardar partido cumplido</button>
      </div></details>}
      {!!services.length&&<details><summary>Partidos cumplidos ({services.filter(m=>!m.revoked_at).length})</summary>
        {services.map(m=><div key={m.id} className="stack discipline-service-row"><strong>{m.session_name} · {formatDate(m.session_date)}</strong><span>{m.notes}{m.revoked_at?' · Corregido / no computa':''}</span>
          {!m.revoked_at&&<button type="button" className="secondary" disabled={busy||dirty||!serviceNotes.trim()} onClick={()=>void mutate('revoke_match',{id:row.id,service_id:m.id,notes:serviceNotes},row.revision)}>Corregir este cumplimiento</button>}
        </div>)}
        <label>Motivo para corregir un cumplimiento<textarea value={serviceNotes} disabled={busy} maxLength={4000} onChange={e=>setServiceNotes(e.target.value)}/></label>
      </details>}
    </div>}
    <form className="stack" onSubmit={save}>
      {!row&&!playerId&&<label>Jugador<select required value={player} disabled={busy} onChange={e=>setPlayer(e.target.value)}><option value="">Seleccionar jugador</option>{data.balances.map(b=><option key={b.player_id} value={b.player_id}>{b.display_name}</option>)}</select></label>}
      <label>Partidos de sanción<input type="number" min="1" max="99" value={matches} disabled={busy} placeholder="Pendiente de confirmar" onChange={e=>setMatches(e.target.value)}/></label>
      {!matches&&<small>Déjalo vacío si aún no sabes cuántos partidos son.</small>}
      <label>Fecha del primer partido de sanción<input ref={fromInput} type="date" value={from} disabled={busy} onChange={e=>setFrom(e.target.value)}/></label>
      <small>El primer partido que cuenta para cumplirla, aunque la duración se comunique después. No es la fecha de la tarjeta.</small>
      {manualReview&&row&&<div className="stack discipline-legacy-review">
        <p>Registro antiguo: {row.matches_served} partidos marcados como cumplidos, {row.verified_matches_served} con partido identificado.</p>
        {decisionChanged&&!review&&<p>Para cambiar la duración, confirma abajo qué partidos se han cumplido.</p>}
        <label className="discipline-check"><input type="checkbox" checked={review} disabled={busy} onChange={e=>setReview(e.target.checked)}/>He revisado los partidos cumplidos. Usar los {row.verified_matches_served} partidos identificados.</label>
        {review&&<label>Motivo de la revisión<textarea required value={notes} maxLength={4000} disabled={busy} onChange={e=>setNotes(e.target.value)}/></label>}
      </div>}
      <details><summary>Notas y otras opciones</summary><div className="stack">
        {!review&&<label>Notas<textarea value={notes} maxLength={4000} disabled={busy} onChange={e=>setNotes(e.target.value)}/></label>}
        <label>Fecha de la resolución<input type="date" value={decision} disabled={busy} onChange={e=>setDecision(e.target.value)}/></label>
        {(!row||!row.created_from_session_id)&&<label>Partido de origen (si se conoce)<select value={origin} disabled={busy} onChange={e=>setOrigin(e.target.value)}><option value="">Origen no identificado</option>{data.matches.map(m=><option key={m.id} value={m.id}>{m.name} · {formatDate(m.session_date)}</option>)}</select></label>}
        {row&&<label className="discipline-check"><input type="checkbox" checked={cancelled} disabled={busy} onChange={e=>setCancelled(e.target.checked)}/>Cancelar esta sanción</label>}
      </div></details>
      {reviewRequired&&review&&!notes.trim()&&<small>Añade el motivo de la revisión para poder guardar.</small>}
      <button type="submit" className="primary" disabled={busy||reviewMissing}>{busy?'Guardando…':review?'Guardar revisión':'Guardar sanción'}</button>
    </form>
  </section>;
}

function RulesEditor({rules,busy,mutate}:{rules:DisciplineRules;busy:boolean;mutate:Mutation}) {
  const [name,setName]=useState(rules.competition_name),[start,setStart]=useState(rules.season_start),[threshold,setThreshold]=useState(String(rules.yellow_threshold));
  const [double,setDouble]=useState(rules.double_yellow_units===null?'':String(rules.double_yellow_units)),[yellowRed,setYellowRed]=useState(rules.yellow_red_units===null?'':String(rules.yellow_red_units));
  return <form className="stack discipline-rules" onSubmit={event=>{event.preventDefault();void mutate('rules',{competition_name:name,season_start:start,yellow_threshold:Number(threshold),double_yellow_units:double===''?null:Number(double),yellow_red_units:yellowRed===''?null:Number(yellowRed)},rules.revision);}}>
    <p>Cuenta de una liga y temporada. Las tarjetas de otras actividades permanecen en el histórico. Confirma las reglas de tu categoría FCF antes de cambiar estas opciones.</p>
    <label>Competición<input required maxLength={120} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
    <label>Inicio de temporada<input type="date" required value={start} disabled={busy} onChange={e=>setStart(e.target.value)}/></label>
    <label>Umbral de amarillas<input type="number" min="1" max="99" required value={threshold} disabled={busy} onChange={e=>setThreshold(e.target.value)}/></label>
    <label>Doble amarilla: amarillas que computan<select value={double} disabled={busy} onChange={e=>setDouble(e.target.value)}><option value="">Pendiente de confirmar</option><option value="0">Ninguna</option><option value="1">Una</option><option value="2">Las dos</option></select></label>
    <label>Amarilla anterior a una roja directa<select value={yellowRed} disabled={busy} onChange={e=>setYellowRed(e.target.value)}><option value="">Pendiente de confirmar</option><option value="0">No computa</option><option value="1">Sí computa</option></select></label>
    <button className="secondary" disabled={busy}>Guardar reglas confirmadas</button>
  </form>;
}
