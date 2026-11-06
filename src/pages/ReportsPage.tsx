import { ATTENDANCE_METRICS, attendanceStats } from '../utils/attendance';
import { AttendanceBreakdown } from '../components/AttendanceBreakdown';
import { loadPerformanceData, readPerformancePages } from '../lib/performance';
import { isCompletedSportingSession, operationalStandouts } from '../utils/evaluationEligibility';
import { copenhagenToday } from '../utils/copenhagenDates';
import { OFFICIAL_PERFORMANCE_LABEL } from '../utils/performance';
import { evaluationTotal } from '../utils/evaluationScores';
import { csvDocument } from '../utils/csv';
import { translatePosition, translateStatus } from '../utils/formatters';
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../supabase';
import {Card,PageTitle} from '../components/ui';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
type Row=Record<string,any>;
export function ReportsPage(){
 const [players,setPlayers]=useState<Row[]>([]),[id,setId]=useState(''),[from,setFrom]=useState('2026-09-01'),[to,setTo]=useState(copenhagenToday()),[rows,setRows]=useState<Row[]>([]),[att,setAtt]=useState<Row[]>([]),[cards,setCards]=useState<Row[]>([]),[injuries,setInjuries]=useState<Row[]>([]),[standouts,setStandouts]=useState<Row[]>([]),[sessions,setSessions]=useState<Row[]>([]),[ready,setReady]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
 const [playersReady,setPlayersReady]=useState(false);
 useEffect(()=>{let cancelled=false;readPerformancePages<Row>((a,b)=>supabase.from('players').select('*').order('id').range(a,b)).then(data=>{if(!cancelled){setPlayers(data.sort((a,b)=>String(a.display_name).localeCompare(String(b.display_name),'es')));setPlayersReady(true)}},error=>{if(!cancelled)setMessage('No se pudo verificar la plantilla: '+String(error))});return()=>{cancelled=true;request.current++}},[]);
 const request=useRef(0);
 function invalidate(){request.current++;setReady(false);setLoading(false);}
 async function run() {
  if(loading || !playersReady || !from || !to || from>to)return;
  const version=++request.current;
  setLoading(true);
  setReady(false);
  setMessage('');

  try {
   const performance = await loadPerformanceData();
   if(version!==request.current)return;
   const selectedSessions = performance.sessions.filter(s => isCompletedSportingSession(s) && s.session_date >= from && s.session_date <= to);
   setSessions(selectedSessions);
   const ids = new Set(selectedSessions.map(s => s.id));
   const [cardRows, injuryRows, standoutRows] = await Promise.all([
     readPerformancePages<Row>((a,b) => supabase.from('cards').select('*').order('id').range(a,b)),
     readPerformancePages<Row>((a,b) => supabase.from('injuries').select('*').order('id').range(a,b)),
     readPerformancePages<any>((a,b) => supabase.from('session_standouts').select('*').order('id').range(a,b)),
   ]);
   if(version!==request.current)return;
   const scoped = (items: Row[]) => items.filter(r => ids.has(r.session_id) && (!id || r.player_id === id));
   setRows(scoped(performance.evaluations));
   setAtt(scoped(performance.attendance));
   setCards(scoped(cardRows));
   setStandouts(scoped(operationalStandouts(standoutRows,performance.sessions)));
   setInjuries(injuryRows.filter(r => (!id || r.player_id === id) && (!r.start_date || r.start_date <= to) && (!r.end_date || r.end_date >= from)));
   setReady(true);
  } catch (error) {
   if(version===request.current)setMessage(error instanceof Error ? error.message : String(error));
  } finally {
   if(version===request.current)setLoading(false);
  }
 }
 const periodAttendance=attendanceStats(att);
 const evaluated=rows.filter(x=>x.evaluated && evaluationTotal(x) !== null);const mean=evaluated.length?evaluated.reduce((s,x)=>s+Number(evaluationTotal(x) ?? 0),0)/evaluated.length:null;
 const stats=(p:Row)=>{const e=rows.filter(x=>x.player_id===p.id&&x.evaluated&&evaluationTotal(x)!==null),a=att.filter(x=>x.player_id===p.id),c=cards.filter(x=>x.player_id===p.id),i=injuries.filter(x=>x.player_id===p.id),st=standouts.filter(x=>x.player_id===p.id);const attendance=attendanceStats(a);return {e:e.length,avg:e.length?(e.reduce((s,x)=>s+Number(evaluationTotal(x) ?? 0),0)/e.length).toFixed(2):'—',attendance,present:attendance.present,absences:attendance.absences,late:attendance.lateTotal,yellow:c.filter(x=>x.type==='yellow').length,red:c.filter(x=>['straight_red','double_yellow'].includes(x.type)).length,injuries:i.length,top:st.filter(x=>x.category==='top').length,bottom:st.filter(x=>x.category==='bottom').length}};
 function downloadPDF(){
  if(!ready)return;
  try {
   const selected=players.filter(p=>!id||p.id===id);
   const individual=id?selected[0]:null;
   if(id&&!individual){setMessage('No se ha encontrado el jugador seleccionado.');return}
   const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
   const pageWidth=doc.internal.pageSize.getWidth();
   const margin=14;
   doc.setFillColor(19,30,28);doc.rect(0,0,pageWidth,30,'F');
   doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(18);
   doc.text('INSPIRE SOCCER',margin,14);
   doc.setFont('helvetica','normal');doc.setFontSize(10);
   doc.text(individual?'INFORME DE JUGADOR':'INFORME DE EQUIPO',margin,23);
   doc.setTextColor(30,40,38);doc.setFontSize(10);
   doc.text(`Periodo: ${from} - ${to}`,margin,38);
   doc.setFontSize(8);doc.text(OFFICIAL_PERFORMANCE_LABEL + ' (solo rendimiento)',margin,43);doc.setFontSize(10);
   doc.text(`Generado: ${new Date().toLocaleString('es-ES',{timeZone:'Europe/Copenhagen'})}`,pageWidth-margin,38,{align:'right'});
   let startY=47;
   if(individual){
    doc.setFont('helvetica','bold');doc.setFontSize(14);
    doc.text(String(individual.display_name||individual.name||'Jugador'),margin,startY);
    doc.setFont('helvetica','normal');doc.setFontSize(10);
    const info=`Nombre: ${individual.name||'-'}   Posición: ${translatePosition(individual.position)}   Nacimiento: ${individual.birth_date||'-'}   Estado: ${translateStatus(individual.status)}`;
    const infoLines=doc.splitTextToSize(info,pageWidth-margin*2);
    doc.text(infoLines,margin,startY+7);startY+=9+infoLines.length*5;
    const notes=String(individual.career_notes||individual.notes||'Sin notas de trayectoria registradas');
    doc.setFont('helvetica','bold');doc.text('Trayectoria y notas',margin,startY);startY+=5;
    doc.setFont('helvetica','normal');doc.setFontSize(9);
    autoTable(doc,{body:[[notes]],startY,margin:{left:margin,right:margin,bottom:22},theme:'plain',styles:{font:'helvetica',fontSize:9,cellPadding:2,overflow:'linebreak'}});
    startY=((doc as any).lastAutoTable?.finalY||startY)+8;
    if(startY>doc.internal.pageSize.getHeight()-30){doc.addPage();startY=20}
   }
   const head=[['Jugador','Evaluaciones','Media','Presencias','Ausencias','Retrasos','Amarillas','Rojas','Lesiones','Top','Bottom']];
   const body=selected.map(p=>{const x=stats(p);return [String(p.display_name||p.name),String(x.e),String(x.avg),String(x.present),String(x.absences),String(x.late),String(x.yellow),String(x.red),String(x.injuries),String(x.top),String(x.bottom)]});
   autoTable(doc,{head,body,startY,margin:{left:margin,right:margin,bottom:22},theme:'grid',styles:{font:'helvetica',fontSize:8,cellPadding:2.5,overflow:'linebreak'},headStyles:{fillColor:[35,52,47]},columnStyles:{0:{cellWidth:55}}});
   const last=(doc as any).lastAutoTable?.finalY||startY;
   let y=last+11;
   if(y>doc.internal.pageSize.getHeight()-24){doc.addPage();y=20}
   doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('Resumen del periodo',margin,y);
   doc.setFont('helvetica','normal');doc.setFontSize(9);
   const summary=`Sesiones: ${sessions.length}  |  Evaluaciones: ${evaluated.length}  |  Asistencias registradas: ${periodAttendance.recorded}  |  Tarjetas: ${cards.length}  |  Lesiones: ${injuries.length}  |  Destacados: ${standouts.length}`;
   doc.text(doc.splitTextToSize(summary,pageWidth-margin*2),margin,y+6);
   autoTable(doc,{head:[['Jugador',...ATTENDANCE_METRICS.map(([,label])=>label)]],body:selected.map(p=>{const x=stats(p);return [String(p.display_name||p.name),...ATTENDANCE_METRICS.map(([metric])=>String(x.attendance[metric]))]}),startY:y+19,margin:{left:margin,right:margin,bottom:22},theme:'grid',styles:{font:'helvetica',fontSize:7,cellPadding:2,overflow:'linebreak'},headStyles:{fillColor:[35,52,47]},columnStyles:{0:{cellWidth:40}}});
   const totalPages=doc.getNumberOfPages();
   for(let n=1;n<=totalPages;n++){
    doc.setPage(n);const h=doc.internal.pageSize.getHeight();
    doc.setDrawColor(210,215,212);doc.line(margin,h-13,pageWidth-margin,h-13);
    doc.setFontSize(8);doc.setTextColor(95,105,100);
    doc.text('Datos disponibles hasta la fecha de generacion. No incluye notas privadas.',margin,h-8);
    doc.text(`${n} / ${totalPages}`,pageWidth-margin,h-8,{align:'right'});
   }
   const safe=(individual?String(individual.display_name||individual.name):'equipo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,60);
   doc.save(`Inspire_Soccer_${safe}_${from}_${to}.pdf`);
  }catch(err){setMessage(`No se ha podido generar el PDF: ${err instanceof Error?err.message:String(err)}`)}
 }
 const exportCSV=()=>{const lines=[['Jugador','Evaluaciones oficiales desde 2026-10-14','Media','Presencias','Ausencias','Retrasos','Amarillas','Rojas','Lesiones','Top','Bottom',...ATTENDANCE_METRICS.map(([,label])=>label)],...players.filter(p=>!id||p.id===id).map(p=>{const x=stats(p);return [p.display_name,x.e,x.avg,x.present,x.absences,x.late,x.yellow,x.red,x.injuries,x.top,x.bottom,...ATTENDANCE_METRICS.map(([metric])=>x.attendance[metric])]})];const csv=csvDocument(lines);const a=document.createElement('a');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.href=url;a.download='inspire-report.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 return <><PageTitle title="Informes" subtitle="Jugadores y equipo · periodos personalizados · PDF"/><Card><div className="stack"><label>Ámbito<select value={id} onChange={e=>{setId(e.target.value);invalidate()}}><option value="">Equipo completo</option>{players.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label><label>Desde<input type="date" value={from} onChange={e=>{setFrom(e.target.value);invalidate()}}/></label><label>Hasta<input type="date" value={to} onChange={e=>{setTo(e.target.value);invalidate()}}/></label><button className="primary" onClick={run} disabled={loading||!playersReady||!from||!to||from>to}>{loading?'Cargando…':'Generar informe'}</button></div></Card>{message&&<Card><p>{message}</p></Card>}{ready&&<Card><h3>Resumen del periodo</h3><p>Sesiones: {sessions.length} · Evaluaciones: {evaluated.length} · Media: {(mean === null ? 'N/A' : mean.toFixed(2))}</p><p>Asistencias registradas: {periodAttendance.recorded} · Ausencias: {periodAttendance.absences} · Retrasos: {periodAttendance.lateTotal}</p><AttendanceBreakdown rows={att}/><p>Tarjetas: {cards.length} · Lesiones: {injuries.length} · Destacados: {standouts.length}</p><button className="primary" onClick={downloadPDF}>Descargar PDF</button><button className="secondary" onClick={exportCSV}>Descargar CSV</button><p className="muted">{OFFICIAL_PERFORMANCE_LABEL}. Asistencia y demás registros: periodo seleccionado.</p><p className="muted">El PDF se descarga directamente. Los notas privadas no se exportan.</p></Card>}</>}
