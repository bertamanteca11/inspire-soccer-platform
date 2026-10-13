import { evaluationTotal } from '../utils/evaluationScores';
import {useEffect,useState} from 'react';
import {supabase} from '../supabase';
import {Card,PageTitle} from '../components/ui';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
type Row=Record<string,any>;
const esc=(x:any)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
export function ReportsPage(){
 const [players,setPlayers]=useState<Row[]>([]),[id,setId]=useState(''),[from,setFrom]=useState('2026-09-01'),[to,setTo]=useState(new Date().toISOString().slice(0,10)),[rows,setRows]=useState<Row[]>([]),[att,setAtt]=useState<Row[]>([]),[cards,setCards]=useState<Row[]>([]),[injuries,setInjuries]=useState<Row[]>([]),[standouts,setStandouts]=useState<Row[]>([]),[sessions,setSessions]=useState<Row[]>([]),[ready,setReady]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{supabase.from('players').select('*').order('display_name').then(({data,error})=>{setPlayers(data||[]);if(error)setMessage(error.message)})},[]);
 async function run(){setLoading(true);setReady(false);setMessage('');const s=await supabase.from('sessions').select('*').gte('session_date',from).lte('session_date',to).order('session_date');if(s.error){setMessage(s.error.message);setLoading(false);return}const ss=s.data||[];setSessions(ss);const ids=ss.map(x=>x.id);const empty={data:[] as Row[],error:null};const [e,a,c,i,st]=await Promise.all([ids.length?supabase.from('evaluations').select('*').in('session_id',ids):empty,ids.length?supabase.from('attendance').select('*').in('session_id',ids):empty,ids.length?supabase.from('cards').select('*').in('session_id',ids):empty,supabase.from('injuries').select('*'),ids.length?supabase.from('session_standouts').select('*').in('session_id',ids):empty]);const err=[e,a,c,i,st].find(x=>x.error)?.error;if(err){setMessage(err.message);setLoading(false);return}const filter=(arr:Row[])=>arr.filter(x=>!id||x.player_id===id);setRows(filter(e.data||[]));setAtt(filter(a.data||[]));setCards(filter(c.data||[]));setInjuries(filter((i.data||[]).filter(x=>(!x.start_date||x.start_date<=to)&&(!x.end_date||x.end_date>=from))));setStandouts(filter(st.data||[]));setReady(true);setLoading(false)}
 const evaluated=rows.filter(x=>x.evaluated && evaluationTotal(x) !== null);const mean=evaluated.length?evaluated.reduce((s,x)=>s+Number(evaluationTotal(x) ?? 0),0)/evaluated.length:0;
 const stats=(p:Row)=>{const e=rows.filter(x=>x.player_id===p.id&&x.evaluated&&evaluationTotal(x)!==null),a=att.filter(x=>x.player_id===p.id),c=cards.filter(x=>x.player_id===p.id),i=injuries.filter(x=>x.player_id===p.id),st=standouts.filter(x=>x.player_id===p.id);return {e:e.length,avg:e.length?(e.reduce((s,x)=>s+Number(evaluationTotal(x) ?? 0),0)/e.length).toFixed(2):'—',present:a.filter(x=>x.status==='present').length,absences:a.filter(x=>String(x.status).includes('absence')).length,late:a.filter(x=>String(x.status).includes('late')).length,yellow:c.filter(x=>x.type==='yellow').length,red:c.filter(x=>['straight_red','double_yellow'].includes(x.type)).length,injuries:i.length,top:st.filter(x=>x.category==='top').length,bottom:st.filter(x=>x.category==='bottom').length}};
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
   doc.text(`Generado: ${new Date().toLocaleString('es-ES')}`,pageWidth-margin,38,{align:'right'});
   let startY=47;
   if(individual){
    doc.setFont('helvetica','bold');doc.setFontSize(14);
    doc.text(String(individual.display_name||individual.name||'Jugador'),margin,startY);
    doc.setFont('helvetica','normal');doc.setFontSize(10);
    const info=`Nombre: ${individual.name||'-'}   Posicion: ${individual.position||'-'}   Nacimiento: ${individual.birth_date||'-'}   Estado: ${individual.status||'-'}`;
    const infoLines=doc.splitTextToSize(info,pageWidth-margin*2);
    doc.text(infoLines,margin,startY+7);startY+=9+infoLines.length*5;
    const notes=String(individual.career_notes||individual.notes||'Sin notas de trayectoria registradas');
    doc.setFont('helvetica','bold');doc.text('Trayectoria y notas',margin,startY);startY+=5;
    doc.setFont('helvetica','normal');doc.setFontSize(9);
    const noteLines=doc.splitTextToSize(notes,pageWidth-margin*2);
    doc.text(noteLines,margin,startY);startY+=noteLines.length*4+8;
   }
   const head=[['Jugador','Evaluaciones','Media','Presencias','Ausencias','Retrasos','Amarillas','Rojas','Lesiones','Top','Bottom']];
   const body=selected.map(p=>{const x=stats(p);return [String(p.display_name||p.name),String(x.e),String(x.avg),String(x.present),String(x.absences),String(x.late),String(x.yellow),String(x.red),String(x.injuries),String(x.top),String(x.bottom)]});
   autoTable(doc,{head,body,startY,margin:{left:margin,right:margin,bottom:22},theme:'grid',styles:{font:'helvetica',fontSize:8,cellPadding:2.5,overflow:'linebreak'},headStyles:{fillColor:[35,52,47]},columnStyles:{0:{cellWidth:55}}});
   const last=(doc as any).lastAutoTable?.finalY||startY;
   let y=last+11;
   if(y>doc.internal.pageSize.getHeight()-24){doc.addPage();y=20}
   doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('Resumen del periodo',margin,y);
   doc.setFont('helvetica','normal');doc.setFontSize(9);
   const summary=`Sesiones: ${sessions.length}  |  Evaluaciones: ${evaluated.length}  |  Asistencias registradas: ${att.length}  |  Tarjetas: ${cards.length}  |  Lesiones: ${injuries.length}  |  Standouts: ${standouts.length}`;
   doc.text(doc.splitTextToSize(summary,pageWidth-margin*2),margin,y+6);
   const totalPages=doc.getNumberOfPages();
   for(let n=1;n<=totalPages;n++){
    doc.setPage(n);const h=doc.internal.pageSize.getHeight();
    doc.setDrawColor(210,215,212);doc.line(margin,h-13,pageWidth-margin,h-13);
    doc.setFontSize(8);doc.setTextColor(95,105,100);
    doc.text('Datos disponibles hasta la fecha de generacion. No incluye flags privados.',margin,h-8);
    doc.text(`${n} / ${totalPages}`,pageWidth-margin,h-8,{align:'right'});
   }
   const safe=(individual?String(individual.display_name||individual.name):'equipo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,60);
   doc.save(`Inspire_Soccer_${safe}_${from}_${to}.pdf`);
  }catch(err){setMessage(`No se ha podido generar el PDF: ${err instanceof Error?err.message:String(err)}`)}
 }
 const exportCSV=()=>{const lines=[['Jugador','Evaluaciones','Media','Presencias','Ausencias','Retrasos','Amarillas','Rojas','Lesiones','Top','Bottom'],...players.filter(p=>!id||p.id===id).map(p=>{const x=stats(p);return [p.display_name,x.e,x.avg,x.present,x.absences,x.late,x.yellow,x.red,x.injuries,x.top,x.bottom]})];const csv=lines.map(row=>row.map(v=>'"'+String(v).replace(/"/g, '""')+'"').join(',')).join('\n');const a=document.createElement('a');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.href=url;a.download='inspire-report.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 return <><PageTitle title="Informes" subtitle="Jugadores y equipo · periodos personalizados · PDF"/><Card><div className="stack"><label>Ámbito<select value={id} onChange={e=>{setId(e.target.value);setReady(false)}}><option value="">Equipo completo</option>{players.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label><label>Desde<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setReady(false)}}/></label><label>Hasta<input type="date" value={to} onChange={e=>{setTo(e.target.value);setReady(false)}}/></label><button className="primary" onClick={run} disabled={loading||from>to}>{loading?'Cargando…':'Generar informe'}</button></div></Card>{message&&<Card><p>{message}</p></Card>}{ready&&<Card><h3>Resumen del periodo</h3><p>Sesiones: {sessions.length} · Evaluaciones: {evaluated.length} · Media: {mean.toFixed(2)}</p><p>Asistencias registradas: {att.length} · Ausencias: {att.filter(a=>String(a.status).includes('absence')).length} · Retrasos: {att.filter(a=>String(a.status).includes('late')).length}</p><p>Tarjetas: {cards.length} · Lesiones: {injuries.length} · Standouts: {standouts.length}</p><button className="primary" onClick={downloadPDF}>Descargar PDF</button><button className="secondary" onClick={exportCSV}>Descargar CSV</button><p className="muted">El PDF se descarga directamente. Los flags privados no se exportan.</p></Card>}</>}
