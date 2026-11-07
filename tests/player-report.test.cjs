const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
const {buildPlayerReport}=require('../src/utils/playerReport.ts');
const {createPlayerReportPdf,createTeamReportPdf}=require('../src/lib/reportPdf.ts');

const player={id:'p',name:'Alejandro Martínez',display_name:'Álex',shirt_number:18,position:'midfielder',career_notes:'PRIVATE_CAREER_NOTES'};
function fixture(){
  const dates=['2026-10-18','2026-10-21','2026-10-23','2026-10-28','2026-10-30','2026-11-04','2026-11-01','2026-11-06'];
  const sessions=dates.map((date,i)=>({id:'s'+i,name:'Sesión '+i,session_date:date,status:'completed',type:i<6?'training':'league_match'}));
  const scores=[2,2,4,4,3,5,2,5];
  return {from:'2026-10-18',to:'2026-11-07',sessions,
    callups:sessions.map(s=>({id:'c'+s.id,session_id:s.id,player_id:'p',status:'called_up',evaluable:true})),
    attendance:sessions.map(s=>({id:'a'+s.id,session_id:s.id,player_id:'p',status:'present'})),
    evaluations:sessions.map((s,i)=>({id:'e'+s.id,session_id:s.id,player_id:'p',evaluated:true,tactical_discipline:scores[i],effort_commitment:scores[i],decision_making:scores[i],mentality_attitude:scores[i],coachability:1,comment:'Comentario de sesión '+i,na_fields:{}})),
    cards:[],injuries:[],standouts:[],suspensions:[]};
}
test('player report separates activity types, uses four qualities and compares chronological samples',()=>{
  const report=buildPlayerReport(player,fixture());
  assert.equal(report.evaluations.length,8);assert.equal(report.average,3.375);
  assert.equal(report.training.count,6);assert.equal(report.training.average,20/6);
  assert.equal(report.match.count,2);assert.equal(report.match.average,3.5);
  assert.equal(report.training.trend.first,8/3);assert.equal(report.training.trend.last,4);
  assert.equal(report.match.trend,null);assert.equal(report.comments[0].date,'2026-11-06');
});
test('unjustified absences include injuries, delays are separate, and missing attendance is never converted into an absence',()=>{
  const data=fixture();
  const statuses=['unjustified_absence','injured_unjustified_absence','justified_absence','late','justified_late','injured_present',null,'present'];
  data.attendance=data.attendance.filter((a,i)=>{a.status=statuses[i];return i!==6;});
  const report=buildPlayerReport(player,data);
  assert.equal(report.attendance.unjustifiedAbsences,2);assert.equal(report.attendance.justifiedAbsences,1);
  assert.equal(report.attendance.lateTotal,2);assert.equal(report.present,4);assert.equal(report.classified,7);
  assert.equal(report.presenceRate,57);assert.equal(report.missingAttendance,1);
  assert.equal(report.incidents.filter(i=>i.unjustified).length,2);
  assert.match(report.warnings.join(' '),/no se cuentan como ausencias/);
});
test('only completed sporting sessions in range count; official performance cutoff does not remove historical attendance',()=>{
  const data=fixture();data.from='2026-10-01';
  for(const [id,date,status,is_test]of [['old','2026-10-07','completed',false],['future','2026-11-08','completed',false],['planned','2026-10-25','planned',false],['test','2026-10-26','completed',true]]){
    data.sessions.push({id,name:id,session_date:date,type:'training',status,is_test});
    data.callups.push({id:'c'+id,session_id:id,player_id:'p',status:'called_up',evaluable:true});
    data.attendance.push({id:'a'+id,session_id:id,player_id:'p',status:'present'});
    data.evaluations.push({...data.evaluations[0],id:'e'+id,session_id:id});
  }
  const report=buildPlayerReport(player,data);
  assert.equal(report.sessions.length,9);assert.equal(report.attendance.recorded,9);assert.equal(report.evaluations.length,8);
});
test('per-quality N/A does not become zero and unconfirmed or ineligible evaluations do not influence scores or comments',()=>{
  const data=fixture();data.evaluations[0].na_fields={tactical_discipline:true};
  data.evaluations[1].evaluated=false;data.callups[2].evaluable=false;
  const report=buildPlayerReport(player,data);
  assert.equal(report.training.count,4);assert.equal(report.training.qualities[0].count,3);
  assert.equal(report.training.qualities[0].average,4);
  assert(!report.comments.some(c=>c.text==='Comentario de sesión 1'||c.text==='Comentario de sesión 2'));
});
test('injuries overlap the selected period and a later recovery is not described as an earlier recovery',()=>{
  const data=fixture();data.injuries=[
    {id:'carry',player_id:'p',start_date:'2026-10-10',end_date:'2026-10-20',injury_type:'Tobillo',status:'recovered'},
    {id:'ongoing',player_id:'p',start_date:'2026-10-28',end_date:'2026-12-01',injury_type:'Rodilla',status:'recovered'},
    {id:'old',player_id:'p',start_date:'2026-09-01',end_date:'2026-09-10'},
    {id:'future',player_id:'p',start_date:'2026-11-10'},
    {id:'undated',player_id:'p',status:'active'},
  ];
  const report=buildPlayerReport(player,data);
  assert.equal(report.injuries.length,2);assert.equal(report.undatedInjuries,1);
  assert.equal(report.injuries[0].end,null);assert.match(report.injuries[0].state,/Sin alta/);
  assert.equal(report.injuries[1].end,'2026-10-20');
});
test('double yellow counts two yellows and one dismissal, and sanction origin takes precedence over backfill date',()=>{
  const data=fixture();data.cards=[{id:'y',session_id:'s0',player_id:'p',type:'yellow'},{id:'d',session_id:'s1',player_id:'p',type:'double_yellow'},{id:'r',session_id:'s2',player_id:'p',type:'straight_red'}];
  data.suspensions=[{id:'in',player_id:'p',created_from_session_id:'s0',matches_total:2,matches_served:1,status:'active'},
    {id:'backfill',player_id:'p',created_from_session_id:'old-source',created_at:'2026-11-01T12:00:00Z',matches_total:5,status:'active'}];
  const report=buildPlayerReport(player,data);
  assert.equal(report.yellows,3);assert.equal(report.reds,2);assert.equal(report.suspensions.length,1);assert.equal(report.suspensions[0].remaining,1);
  assert.equal(report.currentSuspensions.length,2); // current state is separately labelled, even for an older origin
});
test('empty reports say data is unavailable instead of assigning a zero rating or attendance rate',()=>{
  const data=fixture();data.sessions=[];data.injuries=[];
  const report=buildPlayerReport(player,data);
  assert.equal(report.average,null);assert.equal(report.presenceRate,null);
  assert.match(report.summary.join(' '),/Sin evaluaciones válidas/);
  assert.equal(createPlayerReportPdf(report).getNumberOfPages(),2);
});
test('individual PDFs stay at two portrait pages with long text and many incidents; private career notes are never exported',()=>{
  const data=fixture();data.attendance[0].status='unjustified_absence';data.attendance[0].notes='Motivo largo '.repeat(1000);
  data.evaluations.forEach(e=>{e.comment='Observación del entrenador '.repeat(1000);});
  data.injuries=Array.from({length:200},(_,i)=>({id:'inj'+i,player_id:'p',start_date:'2026-10-20',injury_type:'Molestias '.repeat(100),status:'active'}));
  const report=buildPlayerReport({...player,display_name:'Álex '.repeat(50)},data);
  const pdf=createPlayerReportPdf(report,new Date('2026-11-07T12:00:00Z'));
  assert.equal(pdf.getNumberOfPages(),2);assert(pdf.internal.pageSize.getHeight()>pdf.internal.pageSize.getWidth());
  assert(!pdf.output().includes('PRIVATE_CAREER_NOTES'));
  assert(pdf.output().includes('Se muestran 2 de 200 lesiones'));
  assert(createTeamReportPdf([report],data.from,data.to).getNumberOfPages()>=1);
});
test('PDF source uses the shared score calculation rather than a separate weighting rule',()=>{
  assert.match(fs.readFileSync('src/lib/reportPdf.ts','utf8'),/evaluationTotal\(e\)/);
});
