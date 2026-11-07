import { useEffect, useMemo, useRef, useState } from 'react';
import { ATTENDANCE_METRICS, attendanceStats } from '../utils/attendance';
import { AttendanceBreakdown } from '../components/AttendanceBreakdown';
import { loadPerformanceData, readPerformancePages } from '../lib/performance';
import { isCompletedSportingSession, operationalStandouts } from '../utils/evaluationEligibility';
import { copenhagenToday } from '../utils/copenhagenDates';
import { lastFourWeeks } from '../utils/summaryScope';
import { OFFICIAL_PERFORMANCE_LABEL } from '../utils/performance';
import { evaluationTotal } from '../utils/evaluationScores';
import { csvDocument } from '../utils/csv';
import { buildPlayerReport, reportDate, type ReportData, type ReportRow } from '../utils/playerReport';
import { createPlayerReportPdf, createTeamReportPdf } from '../lib/reportPdf';
import { supabase } from '../supabase';
import { Card, PageTitle } from '../components/ui';

export function ReportsPage() {
  const today = copenhagenToday();
  const [players,setPlayers] = useState<ReportRow[]>([]), [id,setId] = useState('');
  const [from,setFrom] = useState(lastFourWeeks(today).from), [to,setTo] = useState(today);
  const [data,setData] = useState<ReportData | null>(null);
  const [playersReady,setPlayersReady] = useState(false), [loading,setLoading] = useState(false), [message,setMessage] = useState('');
  const request = useRef(0);
  useEffect(() => {
    let cancelled = false;
    readPerformancePages<ReportRow>((a,b) => supabase.from('players').select('*').order('id').range(a,b)).then(rows => {
      if (!cancelled) { setPlayers(rows.sort((a,b) => String(a.display_name).localeCompare(String(b.display_name),'es'))); setPlayersReady(true); }
    },error => { if (!cancelled) setMessage('No se pudo verificar la plantilla: '+String(error)); });
    return () => { cancelled = true; request.current++; };
  },[]);
  function invalidate() { request.current++; setData(null); setLoading(false); setMessage(''); }
  async function run() {
    if (loading || !playersReady || !from || !to || from > to) return;
    const version = ++request.current;
    setLoading(true); setData(null); setMessage('');
    try {
      const performance = await loadPerformanceData();
      if (version !== request.current) return;
      const sessions = performance.sessions.filter(s => isCompletedSportingSession(s) && s.session_date >= from && s.session_date <= to);
      const ids = new Set(sessions.map(s => s.id));
      const [cards,injuries,standouts,suspensions] = await Promise.all([
        readPerformancePages<ReportRow>((a,b) => supabase.from('cards').select('*').order('id').range(a,b)),
        readPerformancePages<ReportRow>((a,b) => supabase.from('injuries').select('*').order('id').range(a,b)),
        readPerformancePages<any>((a,b) => supabase.from('session_standouts').select('*').order('id').range(a,b)),
        readPerformancePages<ReportRow>((a,b) => supabase.from('suspensions').select('*').order('id').range(a,b)),
      ]);
      if (version !== request.current) return;
      const scoped = (rows: ReportRow[]) => rows.filter(r => ids.has(r.session_id) && (!id || r.player_id === id));
      setData({ from,to,sessions,callups:scoped(performance.callups),evaluations:scoped(performance.evaluations),
        attendance:scoped(performance.attendance),cards:scoped(cards),injuries,
        standouts:scoped(operationalStandouts(standouts,performance.sessions)),suspensions });
    } catch (error) { if (version === request.current) setMessage(error instanceof Error ? error.message : String(error)); }
    finally { if (version === request.current) setLoading(false); }
  }
  const reports = useMemo(() => data ? players.filter(p => !id || p.id === id).map(p => buildPlayerReport(p,data)) : [],[data,players,id]);
  const individual = id ? reports[0] : null;
  const periodAttendance = attendanceStats(data?.attendance || []);
  const evaluations = data?.evaluations.filter(e => e.evaluated && evaluationTotal(e) !== null) || [];
  const mean = evaluations.length ? evaluations.reduce((sum,e) => sum+Number(evaluationTotal(e)),0)/evaluations.length : null;
  function downloadPDF() {
    if (!data || !reports.length) return;
    try {
      const pdf = individual ? createPlayerReportPdf(individual) : createTeamReportPdf(reports,data.from,data.to);
      const safe = (individual ? String(individual.player.display_name || individual.player.name) : 'equipo')
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,60);
      pdf.save(`Inspire_Soccer_${safe}_${data.from}_${data.to}.pdf`);
    } catch (error) { setMessage('No se ha podido generar el PDF: '+(error instanceof Error ? error.message : String(error))); }
  }
  function exportCSV() {
    if (!data) return;
    const lines = [['Jugador','Evaluaciones oficiales desde 2026-10-14','Media','Presencias','Ausencias','Retrasos','Amarillas','Rojas','Lesiones','Top','Bottom',...ATTENDANCE_METRICS.map(([,label]) => label)],
      ...reports.map(r => [r.player.display_name,r.evaluations.length,r.average === null ? '—' : r.average.toFixed(2),r.attendance.present,r.attendance.absences,r.attendance.lateTotal,r.yellows,r.reds,r.injuries.length,r.top,r.bottom,...ATTENDANCE_METRICS.map(([metric]) => r.attendance[metric])])];
    const url = URL.createObjectURL(new Blob([csvDocument(lines)],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href=url; link.download='inspire-report.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  return <div className="stack">
    <PageTitle title="Informes" subtitle="Seguimiento del jugador · balance del periodo · PDF de dos páginas"/>
    <Card><div className="stack">
      <label>Ámbito<select value={id} onChange={e => { setId(e.target.value); invalidate(); }}><option value="">Equipo completo</option>{players.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
      <label>Desde<input type="date" value={from} onChange={e => { setFrom(e.target.value); invalidate(); }}/></label>
      <label>Hasta<input type="date" value={to} onChange={e => { setTo(e.target.value); invalidate(); }}/></label>
      <p className="muted">El informe individual reúne rendimiento, asistencia, ausencias injustificadas, lesiones, disciplina y comentarios del entrenador. Empieza con las últimas cuatro semanas; puedes cambiar las fechas.</p>
      <button className="primary" onClick={run} disabled={loading || !playersReady || !from || !to || from > to}>{loading ? 'Cargando…' : 'Generar informe'}</button>
    </div></Card>
    {message && <Card><p role="alert">{message}</p></Card>}
    {data && <>
      {individual && <Card><p className="kicker">Vista previa · informe individual</p><h2>{individual.player.display_name || individual.player.name}</h2>
        <p>{reportDate(data.from)} — {reportDate(data.to)} · PDF de 2 páginas</p>
        <h3>Balance del periodo</h3><ul>{individual.summary.map(line => <li key={line}>{line}</li>)}</ul>
        <h3>Puntos de seguimiento</h3><ul>{individual.focus.map(line => <li key={line}>{line}</li>)}</ul>
        {individual.warnings.length > 0 && <><h3>Datos que conviene revisar</h3><ul>{individual.warnings.map(line => <li key={line}>{line}</li>)}</ul></>}
        <p className="muted">El PDF resume las incidencias y los comentarios. Si hay muchos, indica cuántos muestra; los originales completos siguen en sus fichas.</p>
      </Card>}
      <Card><h3>Resumen del periodo</h3>
        <p>Sesiones: {data.sessions.length} · Evaluaciones: {evaluations.length} · Media: {mean === null ? 'N/A' : mean.toFixed(2)}</p>
        <p>Asistencias registradas: {periodAttendance.recorded} · Ausencias: {periodAttendance.absences} · Retrasos: {periodAttendance.lateTotal}</p>
        <AttendanceBreakdown rows={data.attendance}/>
        <p>Tarjetas: {data.cards.length} · Lesiones del periodo: {reports.reduce((sum,r)=>sum+r.injuries.length,0)} · Destacados: {data.standouts.length}</p>
        <button className="primary" disabled={!reports.length} onClick={downloadPDF}>Descargar PDF</button>
        <button className="secondary" disabled={!reports.length} onClick={exportCSV}>Descargar CSV</button>
        <p className="muted">{OFFICIAL_PERFORMANCE_LABEL}. Asistencia y demás registros: sesiones completadas del periodo seleccionado. Las lesiones se incluyen por coincidencia de fechas.</p>
        <p className="muted">Los comentarios de evaluación y los motivos de asistencia pueden aparecer en el informe. Las notas privadas de administración no se exportan.</p>
      </Card>
    </>}
  </div>;
}
