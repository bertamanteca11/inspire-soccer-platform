const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
// The production client is never loaded or contacted by these tests.
require.cache[require.resolve('../src/supabase.ts')]={exports:{supabase:{}}};
const {sessions,attendance,marcos,intendedIds}=require('./phase4.fixture.ts');
const {sessionsInScope,recordsInScope,operationalExclusion,attendanceTrace,summaryCardTotals}=require('../src/utils/summaryScope.ts');
const {attendanceStats}=require('../src/utils/attendance.ts');
const {attendanceDraft}=require('../src/utils/attendanceDrafts.ts');
const {readSummaryPages}=require('../src/lib/summary.ts');
const period=(sessionIds=intendedIds,from='2026-10-18',to='2026-10-23')=>({mode:'period',from,to,sessionIds});

test('verified Marcos history is four unjustified absences, with no inferred Alzamora absence',()=>{
  const original=JSON.stringify(attendance);
  const history=recordsInScope(attendance,sessions,'history',marcos);
  assert.equal(attendanceStats(history).unjustifiedAbsences,4);
  assert.equal(attendanceStats(history).justifiedAbsences,1);
  assert.equal(attendanceStats(history).present,1);
  assert.equal(history.some(a=>a.session_id===intendedIds[0]),false);
  assert.equal(JSON.stringify(attendance),original);
});
test('exact three-session scope contains two stored rows, zero unjustified absences and one missing session',()=>{
  const selected=sessionsInScope(sessions,period());
  assert.equal(selected.length,3);
  const records=recordsInScope(attendance,selected,'period',marcos);
  assert.equal(attendanceStats(records).recorded,2);
  assert.equal(attendanceStats(records).unjustifiedAbsences,0);
  assert.equal(attendanceStats(records).justifiedAbsences,1);
  assert.equal(attendanceStats(records).present,1);
  const trace=attendanceTrace(selected,records,marcos);
  assert.equal(trace.filter(t=>!t.attendance.length).length,1);
  assert.equal(trace.find(t=>t.session.id===intendedIds[0]).attendance.length,0);
  assert.match(records.find(r=>r.session_id===intendedIds[1]).notes,/Guineueta/);
});
test('operational totals require explicit selection and block planned, archived and marked tests',()=>{
  assert.deepEqual(sessionsInScope(sessions,period([])),[]);
  const selected=sessionsInScope(sessions,period(sessions.map(s=>s.id)));
  assert.deepEqual(selected.map(s=>s.id),intendedIds);
  assert.ok(operationalExclusion(sessions.find(s=>s.id==='test')));
  assert.equal(sessionsInScope(sessions,{...period(),mode:'history'}).length,sessions.length);
});
test('legitimate completed tryouts remain eligible and names do not rewrite identity or classification',()=>{
  const trial={id:'real',name:'Prueba deportiva real',session_date:'2026-10-23',status:'completed',type:'tryout'};
  assert.equal(operationalExclusion(trial),null);
  assert.equal(sessionsInScope([trial],period(['real'])).length,1);
  assert.equal(sessionsInScope([{...trial,is_test:true}],period(['real'])).length,0);
});
test('date bounds are inclusive, invalid ranges empty, and exact session IDs distinguish same-day sessions',()=>{
  assert.deepEqual(sessionsInScope(sessions,period(intendedIds,'2026-10-23','2026-10-23')).map(s=>s.id),[intendedIds[2]]);
  assert.deepEqual(sessionsInScope(sessions,period(intendedIds,'2026-10-24','2026-10-18')),[]);
  assert.equal(recordsInScope(attendance,sessionsInScope(sessions,period([intendedIds[2]])),'period',marcos).length,1);
});
test('history preserves orphan records while operational scope excludes them; duplicates remain visible',()=>{
  const rows=[...attendance,{...attendance[0],id:'orphan',session_id:'missing'}, {...attendance[4],id:'conflict',status:'unjustified_absence'}];
  assert.equal(recordsInScope(rows,sessions,'history',marcos).length,8);
  const selected=sessionsInScope(sessions,period());const scoped=recordsInScope(rows,selected,'period',marcos);
  assert.equal(scoped.length,3);
  assert.equal(attendanceTrace(selected,scoped,marcos).find(t=>t.session.id===intendedIds[1]).duplicate,true);
  assert.equal(attendanceTrace(selected,[...scoped,scoped[0]],marcos).find(t=>t.session.id===intendedIds[1]).attendance.length,2);
});
test('card totals use the same session scope as attendance',()=>{
  const cards=[{player_id:marcos,session_id:intendedIds[2],type:'double_yellow'},{player_id:marcos,session_id:'history-04',type:'yellow'}];
  const totals=summaryCardTotals(recordsInScope(cards,sessionsInScope(sessions,period()),'period',marcos));
  assert.equal(totals[0].yellow_cards,2);assert.equal(totals[0].red_cards,1);assert.equal(totals[0].total_cards,1);
});
test('missing attendance drafts remain unrecorded, preserve notes and do not reuse another session',()=>{
  assert.deepEqual(attendanceDraft(attendance,intendedIds[0],marcos),{status:'',notes:''});
  assert.deepEqual(attendanceDraft(attendance,intendedIds[1],marcos),{status:'justified_absence',notes:'Transferencia desde Guineueta'});
  assert.equal(attendanceDraft(attendance,intendedIds[2],marcos).status,'present');
  assert.equal(attendanceDraft([...attendance,{...attendance[4],id:'duplicate'}],intendedIds[1],marcos).status,'');
});
test('summary pagination reads complete capped pages and rejects partial results on error',async()=>{
  const rows=Array.from({length:1103},(_,id)=>({id}));
  assert.equal((await readSummaryPages(async from=>({data:rows.slice(from,from+200),error:null}))).length,1103);
  await assert.rejects(readSummaryPages(async from=>from?{data:null,error:{message:'denied'}}:{data:rows.slice(0,200),error:null}),/denied/);
});
