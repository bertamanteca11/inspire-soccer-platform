const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const calls=[];let response={};require.cache[require.resolve('../src/supabase.ts')]={exports:{supabase:{rpc:async(name,args)=>{calls.push({name,args});return response;}}}};
const {workflowError}=require('../src/utils/workflowErrors.ts');
const {evaluationTotal}=require('../src/utils/evaluationScores.ts');
const {evaluationSnapshot}=require('../src/utils/evaluationSnapshot.ts');
const {latestMatchAndTrainings,sessionsInScope,recordsInScope,lastFourWeeks,seasonBounds,seasonStartYear,operationalPeriodSessions}=require('../src/utils/summaryScope.ts');
const {copenhagenToday,addCalendarDays}=require('../src/utils/copenhagenDates.ts');
const {attendanceStats}=require('../src/utils/attendance.ts');
const {sortPlayersByJersey}=require('../src/utils/playerOrder.ts');
const {saveDisciplinaryCard,completeSuspension}=require('../src/lib/discipline.ts');
const {readSummaryPages}=require('../src/lib/summary.ts');
const {usesEvaluationDefaults,evaluationEditorRow,reviewedEvaluationRows}=require('../src/utils/evaluationDefaults.ts');

test('missing RPC message explains pending database update in Spanish without exposing implementation details',()=>{
 const message=workflowError({code:'PGRST202',message:'Could not find the function public.batch4_workflow_access in the schema cache'});
 assert.match(message,/actualización de la base de datos está pendiente/);assert.match(message,/desactivados/);
 assert.doesNotMatch(message,/schema cache|p_session|public\.|batch4/);
});
test('retired fifth quality never affects current averages, but its original remains in concurrency snapshots',()=>{
 const row={id:'e',player_id:'p',session_id:'s',tactical_discipline:5,effort_commitment:4,decision_making:3,mentality_attitude:2,coachability:1};
 assert.equal(evaluationTotal(row),3.5);assert.equal(evaluationTotal({...row,coachability:5}),3.5);
 assert.equal(evaluationTotal({...row,na_fields:{tactical_discipline:true}}),3);
 assert.notEqual(evaluationSnapshot([row]),evaluationSnapshot([{...row,coachability:5}]));assert.equal(row.coachability,1);
});
test('operational defaults are four unpersisted 3s, preserving saved N/A and historical gaps',()=>{
 const s={id:'s',name:'Session',type:'training',status:'planned',draft_defaults_version:1,callup_confirmed:true,attendance_confirmed:true,evaluation_confirmed:false};
 const row=evaluationEditorRow(s,'p');assert.equal(evaluationTotal(row),3);assert.equal(row.id,null);assert.equal(row.evaluated,false);assert.equal(row.na_fields.coachability,true);
 const saved={...row,id:'stored',tactical_discipline:5,na_fields:{...row.na_fields,tactical_discipline:true}};
 assert.equal(evaluationEditorRow(s,'p',saved),saved);assert.equal(saved.na_fields.tactical_discipline,true);
 for(const patch of [{draft_defaults_version:null},{evaluation_confirmed:true},{callup_confirmed:false},{attendance_confirmed:false},{status:'archived'},{records_only_confirmed:true}]){
  assert.equal(usesEvaluationDefaults({...s,...patch}),false);assert.equal(evaluationEditorRow({...s,...patch},'p'),undefined);
 }
 assert.equal(reviewedEvaluationRows(s,[],['p']).length,1);assert.equal(reviewedEvaluationRows(s,[saved],['p'])[0],saved);
});
test('attendance and evaluation share numeric jersey ordering without renaming players',()=>{
 const players=[{shirt_number:null,display_name:'A'},{shirt_number:10,display_name:'B'},{shirt_number:2,display_name:'Z'},{shirt_number:1,display_name:'C'}];
 assert.deepEqual(sortPlayersByJersey(players).map(p=>p.display_name),['C','Z','B','A']);assert.equal(players[0].display_name,'A');
});
test('18/21/23 review excludes prior history and later trainings; absent records never imply absence',()=>{
 const dates=['2026-10-04','2026-10-14','2026-10-18','2026-10-21','2026-10-23','2026-10-28'];
 const sessions=dates.map((date,i)=>({id:String(i),name:'Session '+i,session_date:date,type:i===2?'league_match':'training',status:'completed'}));
 const chosen=latestMatchAndTrainings(sessions,'2026-10-23');assert.deepEqual(chosen.map(s=>s.session_date),dates.slice(2,5));
 const scope=sessionsInScope(sessions,{mode:'period',from:'2026-10-18',to:'2026-10-23',sessionIds:chosen.map(s=>s.id)});
 const attendance=sessions.map((s,i)=>({id:'a'+i,session_id:s.id,player_id:'p',status:i===4?'present':'unjustified_absence'}));
 const actual=recordsInScope(attendance,scope,'period','p');assert.equal(attendanceStats(actual).unjustifiedAbsences,2);assert.equal(attendanceStats(actual).present,1);
 assert.equal(attendanceStats(recordsInScope(attendance.filter(r=>r.session_id!=='2'),scope,'period','p')).unjustifiedAbsences,1);
 assert.equal(attendance.length,6);
});
test('null summary page fails closed instead of publishing partial totals',async()=>{
 await assert.rejects(readSummaryPages(async from=>({data:from?null:[{id:'a'}],error:null})),/incompleta/);
});

test('rolling four weeks contain exactly 28 inclusive calendar days across DST, leap days and year boundaries',()=>{
 for(const [today,from] of [['2026-11-06','2026-10-10'],['2026-03-30','2026-03-03'],['2024-03-01','2024-02-03'],['2027-01-08','2026-12-12']]){
  assert.deepEqual(lastFourWeeks(today),{from,to:today});assert.equal(addCalendarDays(from,27),today);
 }
 assert.equal(lastFourWeeks(copenhagenToday(new Date('2026-10-25T23:30:00Z'))).to,'2026-10-26');
 assert.throws(()=>lastFourWeeks('2026-02-30'));
});

test('season boundaries use the confirmed July to June calendar and distinguish adjacent seasons',()=>{
 assert.equal(seasonStartYear('2026-06-30'),2025);assert.equal(seasonStartYear('2026-07-01'),2026);
 assert.equal(seasonStartYear('2027-03-15'),2026);assert.deepEqual(seasonBounds(2026),{from:'2026-07-01',to:'2027-06-30'});
 assert.throws(()=>seasonBounds(2026.5));assert.throws(()=>seasonBounds(NaN));
 const dates=['2026-06-30','2026-07-01','2027-06-30','2027-07-01'];
 const sessions=dates.map((session_date,i)=>({id:String(i),name:'Boundary',session_date,type:'training',status:'completed'}));
 assert.deepEqual(operationalPeriodSessions(sessions,...Object.values(seasonBounds(2026))).map(s=>s.session_date),dates.slice(1,3));
});

test('automatic recent scope excludes old and future sessions and filters all metrics through the same session IDs',()=>{
 const sessions=['2026-10-09','2026-10-10','2026-11-06','2026-11-07'].map((session_date,i)=>({id:String(i),name:'Synthetic',session_date,type:'training',status:'completed'}));
 const extra=[{...sessions[1],id:'planned',status:'planned'},{...sessions[1],id:'archived',status:'archived'},
  {...sessions[1],id:'test',is_test:true},{...sessions[1],id:'unknown',type:'meeting'},
  {...sessions[1],id:'tryout',type:'tryout'},{...sessions[1],id:'records-only',records_only_confirmed:true}];
 const source=[...sessions,...extra],before=JSON.stringify(source),{from,to}=lastFourWeeks('2026-11-06');
 const chosen=operationalPeriodSessions(source,from,to);
 assert.deepEqual(chosen.map(s=>s.id),['1','2','tryout','records-only']);
 for(const metric of ['attendance','evaluations','cards']){
  const rows=source.map(s=>({id:metric+s.id,session_id:s.id,player_id:'p'}));
  assert.deepEqual(recordsInScope(rows,chosen,'period').map(r=>r.session_id),chosen.map(s=>s.id));
 }
 assert.equal(JSON.stringify(source),before);assert.equal(operationalPeriodSessions(source,'2026-11-07','2026-10-10').length,0);
});

test('March recent performance excludes October while the full season retains both months without rewriting source rows',()=>{
 const sessions=['2026-10-18','2027-03-14'].map((session_date,i)=>({id:String(i),name:'Synthetic',session_date,type:'training',status:'completed'}));
 const rows=sessions.map((s,i)=>({id:'e'+i,session_id:s.id,player_id:'p',tactical_discipline:i?5:1,effort_commitment:i?5:1,decision_making:i?5:1,mentality_attitude:i?5:1,coachability:1}));
 const {playerPerformanceAverages}=require('../src/utils/evaluationEligibility.ts');
 const recent=lastFourWeeks('2027-03-15'),season=seasonBounds(2026);
 const scoped=range=>recordsInScope(rows,operationalPeriodSessions(sessions,range.from,range.to),'period');
 assert.equal(playerPerformanceAverages(scoped(recent))[0].average,5);
 assert.equal(playerPerformanceAverages(scoped(season))[0].average,3);assert.equal(rows.length,2);assert.equal(rows[0].tactical_discipline,1);
});
test('disciplinary saves use one atomic RPC and require verified result; no direct table mutation',async()=>{
 calls.length=0;response={data:{session_id:'s',player_id:'p',saved:true},error:null};
 await saveDisciplinaryCard('s','p',{type:'straight_red',reason:'Test',matches:'2'},null);
 assert.equal(calls.length,1);assert.equal(calls[0].name,'batch4_save_card');assert.equal(calls[0].args.p_matches,2);
 response={data:null,error:null};await assert.rejects(saveDisciplinaryCard('s','p',{type:'yellow',reason:'',matches:'1'},null),/verificado/);
 response={data:{id:'x',status:'served',matches_served:1,matches_total:2},error:null};await assert.rejects(completeSuspension('x'),/verificado/);
 response={data:{id:'x',status:'served',matches_served:2,matches_total:2},error:null};await completeSuspension('x');
  response={data:{id:'x',status:'served',matches_served:0,matches_total:2,cycle_initialized:true},error:null};await completeSuspension('x',true);
  assert.equal(calls.at(-1).name,'batch4_initialize_discipline_cycle');
});
