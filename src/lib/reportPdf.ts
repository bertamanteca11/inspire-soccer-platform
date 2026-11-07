import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { reportCount, reportDate, reportNumber, type PlayerReport } from '../utils/playerReport';
import { translatePosition } from '../utils/formatters';
import { evaluationTotal } from '../utils/evaluationScores';

const ink = '#172C3D', muted = '#536574', teal = '#176F6A', red = '#A4313B';
const margin = 16, width = 178;
function clean(value: unknown) {
  return String(value ?? '').replace(/[\r\n\t]+/g,' ').replace(/[–—]/g,'-').replace(/[“”]/g,'"')
    .replace(/[‘’]/g,"'").replace(/…/g,'...').replace(/[^\x20-\x7E\xA0-\xFF]/g,' ').replace(/\s+/g,' ').trim();
}
function text(doc: jsPDF, value: unknown, x: number, y: number, w: number, size = 9, maxLines = 2, color = ink, bold = false) {
  doc.setFont('helvetica',bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color);
  const all = doc.splitTextToSize(clean(value),w) as string[];
  const lines = all.slice(0,maxLines);
  if (all.length > maxLines && lines.length) {
    let last = lines[lines.length-1];
    while (last.length && doc.getTextWidth(last+'...') > w) last = last.slice(0,-1);
    lines[lines.length-1] = last.trimEnd()+'...';
  }
  const leading = size*0.43;
  lines.forEach((line,i) => doc.text(line,x,y+i*leading));
  return y+Math.max(1,lines.length)*leading;
}
function header(doc: jsPDF, subtitle: string) {
  doc.setFillColor(ink); doc.rect(0,0,210,33,'F');
  text(doc,'INSPIRE SOCCER',margin,14,145,16,1,'#FFFFFF',true);
  text(doc,subtitle,margin,24,width,9,1,'#D6E9E5');
  doc.setFillColor('#C8E94E'); doc.rect(184,10,10,3,'F');
}
function section(doc: jsPDF, n: string, title: string, y: number, detail = '') {
  text(doc,n,margin,y,9,10,1,teal,true);
  text(doc,title,27,y,145,10.5,1,ink,true);
  if (detail) text(doc,detail,141,y,53,7.5,1,muted);
  doc.setDrawColor('#DEE5E8'); doc.line(margin,y+3,194,y+3);
}
function metric(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, alert = false) {
  doc.setFillColor(alert ? '#FFF0F1' : '#F0F5F5'); doc.roundedRect(x,y,w,25,2,2,'F');
  text(doc,label,x+4,y+7,w-8,7.8,1,muted);
  text(doc,value,x+4,y+19,w-8,21,1,alert ? red : ink,true);
}
function bullets(doc: jsPDF, items: string[], y: number, maxLines = 2, size = 9, gap = 2.5) {
  for (const value of items) {
    doc.setFillColor(teal); doc.circle(margin+1,y-1,0.7,'F');
    y = text(doc,value,margin+5,y,width-5,size,maxLines)+gap;
  }
  return y;
}
function footer(doc: jsPDF, generated: Date, subtitle: string) {
  const total = doc.getNumberOfPages();
  for (let page=1;page<=total;page++) {
    doc.setPage(page); doc.setDrawColor('#DCE3E7'); doc.line(margin,281,194,281);
    text(doc,subtitle,margin,286,150,7,1,muted);
    text(doc,`Generado ${generated.toLocaleDateString('es-ES',{timeZone:'Europe/Copenhagen'})}`,margin,291,150,7,1,muted);
    text(doc,`${page} / ${total}`,181,288,15,8,1,muted);
  }
}
function trendText(group: PlayerReport['training']) {
  if (!group.trend) return group.count ? 'Muestra insuficiente para comparar evolución (mínimo 4 evaluaciones).' : 'Sin evaluaciones válidas de esta actividad.';
  const {first,last,sample} = group.trend;
  return `Primeras ${sample}: ${reportNumber(first)}; últimas ${sample}: ${reportNumber(last)} / 5. Comparación por orden de sesión.`;
}
function performancePanel(doc: jsPDF, report: PlayerReport, training: boolean, x: number) {
  const group = training ? report.training : report.match;
  text(doc,training ? 'ENTRENAMIENTOS' : 'PARTIDOS Y OTRAS ACTIVIDADES',x,195,86,8,1,teal,true);
  text(doc,`${group.count} evaluaciones - media ${reportNumber(group.average)} / 5`,x,202,86,8,1,muted);
  const labels = training ? ['Esfuerzo / intensidad','Actitud / lenguaje corporal','Concentración / aprendizaje','Nivel competitivo']
    : ['Disciplina táctica','Esfuerzo / compromiso','Toma de decisiones','Mentalidad / actitud'];
  group.qualities.forEach((quality,i) => {
    const y = 213+i*12;
    text(doc,labels[i],x,y,66,8.4,1);
    text(doc,reportNumber(quality.average),x+69,y,17,8.4,1,ink,true);
    doc.setFillColor('#E8EFF0'); doc.roundedRect(x,y+2,66,1.7,0.6,0.6,'F');
    if (quality.average !== null) { doc.setFillColor(teal); doc.roundedRect(x,y+2,66*quality.average/5,1.7,0.6,0.6,'F'); }
  });
  text(doc,trendText(group),x,263,85,7.8,3,muted);
}

export function createPlayerReportPdf(report: PlayerReport, generated = new Date()) {
  const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  doc.setProperties({title:`Informe de ${report.player.display_name || report.player.name}`,author:'Inspire Soccer',subject:'Seguimiento del jugador en el periodo seleccionado'});
  header(doc,'INFORME INDIVIDUAL / BALANCE DEL PERIODO');
  const name = report.player.display_name || report.player.name || 'Jugador';
  text(doc,name,margin,45,width,19,2,ink,true);
  const identity = [report.player.name !== name ? report.player.name : '',report.player.shirt_number != null ? `Dorsal ${report.player.shirt_number}` : '',translatePosition(report.player.position)].filter(Boolean).join(' - ');
  text(doc,identity,margin,61,width,9,1,muted);
  text(doc,`Del ${reportDate(report.from)} al ${reportDate(report.to)}`,margin,68,width,10,1,ink,true);
  const w = 41.5;
  metric(doc,16,77,w,'ASISTENCIA',report.presenceRate === null ? 'N/D' : report.presenceRate+'%');
  metric(doc,61.5,77,w,'MEDIA OFICIAL / 5',reportNumber(report.average));
  metric(doc,107,77,w,'AUSENCIAS INJUST.',String(report.attendance.unjustifiedAbsences),report.attendance.unjustifiedAbsences>0);
  metric(doc,152.5,77,w,'LESIONES DEL PERIODO',String(report.injuries.length),report.injuries.length>0);
  section(doc,'01','Lectura rápida',114);
  bullets(doc,report.summary,123,2,9.1,2.7);
  if (report.warnings.length) text(doc,'Datos a revisar: '+report.warnings.join(' '),margin,175,width,7.5,1,red);
  section(doc,'02','Rendimiento y evolución',184,`Selecciones Top / Bottom: ${report.top} / ${report.bottom}`);
  performancePanel(doc,report,true,16); performancePanel(doc,report,false,109);

  doc.addPage(); header(doc,'INFORME INDIVIDUAL / HECHOS Y SEGUIMIENTO');
  text(doc,name,margin,44,width,14,1,ink,true);
  section(doc,'03','Asistencia y compromiso',54);
  const a = report.attendance;
  text(doc,`${report.present} presencias de ${report.classified} registros clasificados; incluye ${a.injuredPresent} asistencias al fisio.`,margin,64,width,9,1);
  text(doc,`Ausencias: ${a.unjustifiedAbsences} injustificadas y ${a.justifiedAbsences} justificadas. Retrasos: ${a.late} sin justificar y ${a.justifiedLate} justificados.`,margin,71,width,8.8,2);
  const incidents = report.incidents.slice(0,3);
  if (incidents.length) {
    text(doc,`Incidencias: ${incidents.length} de ${report.incidents.length} (primero las injustificadas). Motivos abreviados.`,margin,83,width,7.5,1,muted);
    incidents.forEach((i,index) => text(doc,`${reportDate(i.date)} - ${i.label}${i.note ? ': '+i.note : '. Sin motivo registrado.'}`,margin,92+index*9,width,8.2,2,i.unjustified ? red : ink));
  } else text(doc,report.attendance.recorded ? 'No constan ausencias injustificadas ni retrasos en los registros del periodo.' : 'Sin asistencia registrada para este jugador.',margin,86,width,8.5,2,muted);

  section(doc,'04','Lesiones y disponibilidad',123,`${report.injuries.length} en el periodo`);
  if (!report.injuries.length) text(doc,'No constan lesiones con fechas que coincidan con este periodo.',margin,133,width,9,2,muted);
  report.injuries.slice(0,2).forEach((injury,index) => {
    const y=133+index*14;
    text(doc,injury.title,margin,y,width,9,1,ink,true);
    text(doc,`Inicio ${reportDate(injury.start)}${injury.end ? ' - alta '+reportDate(injury.end) : ''}. ${injury.state}.`,margin,y+5,width,8,2,muted);
  });
  if (report.injuries.length>2) text(doc,`Se muestran 2 de ${report.injuries.length} lesiones. Consulta el detalle completo en Lesiones.`,margin,161,width,7.5,1,muted);
  if (report.undatedInjuries) text(doc,`${report.undatedInjuries} lesiones sin fecha de inicio no se atribuyen a este periodo.`,margin,167,width,7.5,1,muted);

  section(doc,'05','Tarjetas y sanciones',177);
  text(doc,`${reportCount(report.yellows,'amarilla')} (la doble cuenta 2) y ${reportCount(report.reds,'expulsión','expulsiones')}.`,margin,187,width,9,1);
  text(doc,`${reportCount(report.suspensions.length,'sanción','sanciones')} con origen o fecha de registro en el periodo.`,margin,194,width,8.2,1,muted);
  text(doc,`A fecha de generación: ${reportCount(report.currentSuspensions.length,'sanción activa','sanciones activas')}; ${reportCount(report.currentSuspensions.reduce((sum,s)=>sum+s.remaining,0),'partido pendiente','partidos pendientes')} (incluye origen anterior).`,margin,201,width,8.2,2,muted);

  section(doc,'06',report.comments.length ? 'Comentarios del entrenador' : 'Últimas sesiones del jugador',215);
  if (report.comments.length) report.comments.slice(0,2).forEach((c,index) => text(doc,`${reportDate(c.date)}: ${c.text}`,margin,225+index*11,width,8.6,2));
  else report.recent.slice(0,3).forEach((s,index) => text(doc,`${reportDate(s.date)} - ${s.type}: ${s.attendance}. Nota ${reportNumber(s.score)} / 5.`,margin,225+index*7,width,8.4,1));
  if (!report.comments.length && !report.recent.length) text(doc,'No hay sesiones con registros del jugador en este periodo.',margin,225,width,8.6,2,muted);
  if (report.comments.length) text(doc,`Extractos de ${Math.min(2,report.comments.length)} de ${report.comments.length} comentarios; textos completos en Evaluación.`,margin,247,width,7.2,1,muted);
  section(doc,'07','Puntos para la próxima conversación',257);
  bullets(doc,report.focus.slice(0,2),266,1,8.2,1.3);
  footer(doc,generated,'Sesiones completadas. Notas oficiales desde 14/10/2026; N/A no puntúa. Sin notas privadas.');
  return doc;
}

export function createTeamReportPdf(reports: PlayerReport[], from: string, to: string, generated = new Date()) {
  const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  header(doc,'INFORME DE EQUIPO / RESUMEN DEL PERIODO');
  text(doc,`Del ${reportDate(from)} al ${reportDate(to)}`,margin,44,width,13,1,ink,true);
  const sessions = new Set(reports.flatMap(r => r.sessions.map(s => s.id))).size;
  const evaluations = reports.flatMap(r => r.evaluations);
  const avg = evaluations.length ? evaluations.reduce((s,e) => s + Number(evaluationTotal(e)),0)/evaluations.length : null;
  metric(doc,16,53,56,'JUGADORES',String(reports.length)); metric(doc,77,53,56,'SESIONES',String(sessions)); metric(doc,138,53,56,'MEDIA OFICIAL / 5',reportNumber(avg));
  section(doc,'01','Balance del periodo',92);
  bullets(doc,[`${reports.reduce((s,r)=>s+r.attendance.unjustifiedAbsences,0)} ausencias injustificadas y ${reports.reduce((s,r)=>s+r.attendance.lateTotal,0)} retrasos registrados.`,
    `${reports.reduce((s,r)=>s+r.injuries.length,0)} lesiones coinciden con el periodo; ${reports.reduce((s,r)=>s+r.reds,0)} expulsiones registradas.`,
    'Selecciona un jugador para descargar su informe individual de dos páginas con evolución, incidencias y comentarios.'],101,2,9,2);
  autoTable(doc,{startY:137,head:[['Jugador','Media / 5','Presencias','Aus. injust.','Retrasos','Lesiones','TA / TR']],
    body:reports.map(r=>[clean(r.player.display_name||r.player.name),reportNumber(r.average),r.present,r.attendance.unjustifiedAbsences,r.attendance.lateTotal,r.injuries.length,`${r.yellows} / ${r.reds}`]),
    margin:{left:margin,right:margin,top:20,bottom:23},styles:{font:'helvetica',fontSize:8,cellPadding:2.5},headStyles:{fillColor:[23,44,61]},alternateRowStyles:{fillColor:[241,246,246]},columnStyles:{0:{cellWidth:49}},rowPageBreak:'avoid'});
  footer(doc,generated,'Asistencia registrada; no se infieren faltas. TA incluye dobles; TR son expulsiones. Sin notas privadas.');
  return doc;
}
