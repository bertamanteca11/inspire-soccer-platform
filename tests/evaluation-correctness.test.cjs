const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const cp=require('node:child_process');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
require.cache[require.resolve('../src/supabase.ts')]={exports:{supabase:{}}};
const {eligibilityReason,countableEvaluations,isOperationalPerformanceSession,playerPerformanceAverages,newEvaluationDraft,ratingLimit,operationalStandouts}=require('../src/utils/evaluationEligibility.ts');
const {evaluationTotal,fieldScore,SCORE_FIELDS}=require('../src/utils/evaluationScores.ts');
const {getRatingCounts}=require('../src/utils/stats.ts');
const {weekBounds,copenhagenToday,previousCopenhagenWeek}=require('../src/utils/copenhagenDates.ts');
const {readPerformancePages}=require('../src/lib/performance.ts');
const session={id:'s',name:'Training',type:'training',session_date:'2026-10-23',status:'completed'};
const call={id:'c',session_id:'s',player_id:'p',status:'called_up',evaluable:true};
const att={id:'a',session_id:'s',player_id:'p',status:'present'};
const row={id:'e',session_id:'s',player_id:'p',evaluated:true,players:{display_name:'Player'},...Object.fromEntries(SCORE_FIELDS.map(k=>[k,5]))};
const counted=(r=[row],s=[session],c=[call],a=[att])=>countableEvaluations(r,s,c,a);

test('numeric eligibility follows explicit callup evaluable flag and sporting attendance',()=>{
  for(const status of ['present','late','justified_late'])assert.equal(eligibilityReason('s','p',[call],[{...att,status}]),null);
  for(const status of ['justified_absence','unjustified_absence','injured','injured_present','injured_justified_absence',null])assert.ok(eligibilityReason('s','p',[call],[{...att,status}]));
  for(const patch of [{status:'not_called'},{status:'guest_not_evaluable'},{evaluable:false},{evaluable:null},{status:'unknown'}])assert.ok(eligibilityReason('s','p',[{...call,...patch}],[att]));
  assert.equal(eligibilityReason('s','p',[{...call,status:'trial'}],[att]),null);
  assert.ok(eligibilityReason('s','p',[],[att]));assert.ok(eligibilityReason('s','p',[call],[]));
});
test('duplicate callup/attendance IDs collapse only returned copies; conflicting stored rows fail eligibility',()=>{
  assert.equal(eligibilityReason('s','p',[call,{...call}],[att,{...att}]),null);
  assert.match(eligibilityReason('s','p',[call,{...call,id:'other'}],[att]),/duplicada/);
  assert.match(eligibilityReason('s','p',[call],[att,{...att,id:'other',status:'unjustified_absence'}]),/duplicada/);
});
test('current scoring excludes planned, archived, explicit tests, pre-cutoff, records-only and unknown sessions',()=>{
  for(const patch of [{status:'planned'},{status:'archived'},{is_test:true},{session_date:'2026-10-13'},{records_only_confirmed:true},{type:'test'},{type:'unknown'}]){
    assert.equal(isOperationalPerformanceSession({...session,...patch}),false);assert.equal(counted([row],[{...session,...patch}]).evaluations.length,0);
  }
  assert.equal(isOperationalPerformanceSession({...session,type:'tryout'}),true);
  assert.equal(isOperationalPerformanceSession({...session,session_date:'2026-10-14'}),true);
});
test('only eligible confirmed scores contribute; missing evaluations and invalid rows never become zeros',()=>{
  assert.equal(counted().evaluations.length,1);
  for(const r of [{...row,evaluated:false},{...row,not_applicable:true},{...row,...Object.fromEntries(SCORE_FIELDS.map(k=>[k,null]))}])assert.equal(counted([r]).evaluations.length,0);
  assert.equal(counted([]).evaluations.length,0);assert.equal(counted([row],[session],[],[att]).evaluations.length,0);
});
test('duplicate evaluation groups are excluded without deleting records or choosing a score',()=>{
  const input=[row,{...row,id:'conflict',tactical_discipline:1}];const before=JSON.stringify(input);
  assert.equal(counted(input).evaluations.length,0);assert.equal(counted(input).excluded.length,2);
  assert.equal(counted([row,{...row}]).evaluations.length,1);assert.equal(JSON.stringify(input),before);
});
test('five-field training baseline is explicit, preserves history, and new draft defaults cannot affect averages',()=>{
  assert.equal(evaluationTotal({...row,coachability:3}),4.6);
  const draft={...row,...newEvaluationDraft()};assert.equal(evaluationTotal(draft),null);
  const explicit={...draft,tactical_discipline:4,na_fields:{...draft.na_fields,tactical_discipline:false}};
  assert.equal(evaluationTotal(explicit),4);assert.equal(evaluationTotal({...explicit,coachability:1}),4);
  assert.equal(draft.evaluated,false);
});
test('invalid scores, empty strings, booleans and out-of-range numbers are missing, not valid ratings',()=>{
  for(const value of [null,undefined,'',' ',true,false,0,6,-1,2.5,Infinity,'NaN'])assert.equal(fieldScore({tactical_discipline:value},'tactical_discipline'),null,String(value));
  assert.equal(fieldScore({tactical_discipline:'5'},'tactical_discipline'),5);
  assert.equal(evaluationTotal({...row,na_fields:Object.fromEntries(SCORE_FIELDS.map(k=>[k,true]))}),null);
});
test('all numeric pages share equal-per-evaluation means and per-quality N/A denominators',()=>{
  const other={...row,id:'e2',session_id:'s2',tactical_discipline:1,na_fields:{effort_commitment:true,decision_making:true,mentality_attitude:true,coachability:true}};
  const result=counted([row,other],[session,{...session,id:'s2'}],[call,{...call,id:'c2',session_id:'s2'}],[att,{...att,id:'a2',session_id:'s2'}]);
  const summary=playerPerformanceAverages(result.evaluations)[0];
  assert.equal(summary.average,3);assert.equal(summary.count,2);assert.deepEqual(summary.fields.effort_commitment,[5]);
  assert.equal(result.evaluations.reduce((n,e)=>n+evaluationTotal(e),0)/result.evaluations.length,summary.average);
});
test('rating limits retain zero; N/A and invalid values cannot consume or bypass valid-score caps',()=>{
  assert.equal(ratingLimit(0,6),0);assert.equal(ratingLimit(null,6),6);
  for(const value of [-1,1.5,'6',NaN])assert.throws(()=>ratingLimit(value,6));
  assert.equal(getRatingCounts([{...row,na_fields:{tactical_discipline:true}}]).high.tactical_discipline,0);
  assert.equal(getRatingCounts([{...row,tactical_discipline:6}]).high.tactical_discipline,0);
});
test('subjective standouts remain distinct from numeric scoring and duplicate slots do not inflate weekly points',()=>{
  const top={id:'t',session_id:'s',player_id:'p',category:'top',rank:1};
  assert.equal(operationalStandouts([top],[session]).length,1);
  assert.equal(operationalStandouts([top,{...top,id:'duplicate',player_id:'other'}],[session]).length,0);
  assert.equal(operationalStandouts([top],[{...session,status:'planned'}]).length,0);
});
test('Copenhagen weeks include Sunday across autumn and spring daylight saving transitions',()=>{
  assert.deepEqual(weekBounds('2026-10-19'),{from:'2026-10-19',to:'2026-10-26'});
  assert.deepEqual(weekBounds('2026-10-25'),{from:'2026-10-19',to:'2026-10-26'});
  assert.deepEqual(weekBounds('2026-03-23'),{from:'2026-03-23',to:'2026-03-30'});
  assert.deepEqual(weekBounds('2026-12-31'),{from:'2026-12-28',to:'2027-01-04'});
  assert.throws(()=>weekBounds('2026-02-30'));
});
test('calendar boundaries are identical regardless of the executing machine timezone',()=>{
  const helper=require.resolve('../src/utils/copenhagenDates.ts');
  const setup=`const fs=require('fs'),ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);console.log(JSON.stringify(require(${JSON.stringify(helper)}).weekBounds('2026-10-19')));`;
  for(const zone of ['UTC','Europe/Copenhagen','America/Los_Angeles','Asia/Tokyo'])assert.deepEqual(JSON.parse(cp.execFileSync(process.execPath,['-e',setup],{encoding:'utf8',env:{...process.env,TZ:zone}})),{from:'2026-10-19',to:'2026-10-26'});
});
test('Copenhagen today and previous week use the club calendar around UTC midnight',()=>{
  assert.equal(copenhagenToday(new Date('2026-10-25T23:30:00Z')),'2026-10-26');
  assert.equal(previousCopenhagenWeek(new Date('2026-10-25T23:30:00Z')),'2026-10-19');
  assert.equal(copenhagenToday(new Date('2026-03-29T22:30:00Z')),'2026-03-30');
});
test('eligibility source reads paginate fully and reject partial results on permission errors',async()=>{
  const rows=Array.from({length:1003},(_,id)=>({id}));
  assert.equal((await readPerformancePages(async a=>({data:rows.slice(a,a+200),error:null}))).length,1003);
  await assert.rejects(readPerformancePages(async a=>a?{data:null,error:{message:'denied'}}:{data:rows.slice(0,200),error:null}),/denied/);
});
