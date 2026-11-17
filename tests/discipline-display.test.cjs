const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
const {cardYellows,isDismissal,serviceCandidates,sanctionRemaining}=require('../src/utils/discipline.ts');
const {summaryCardTotals}=require('../src/utils/summaryScope.ts');
const {buildPlayerReport}=require('../src/utils/playerReport.ts');

test('combined, second-yellow and withdrawn incidents have consistent physical history counts',()=>{
  const cards=[{type:'yellow'},{type:'double_yellow'},{type:'straight_red'},
    {type:'straight_red',discipline_kind:'yellow_red'},{type:'yellow',voided_at:'2026-11-01T00:00:00Z'}];
  assert.equal(cards.reduce((n,c)=>n+cardYellows(c),0),4);
  assert.equal(cards.filter(isDismissal).length,3);
  const totals=summaryCardTotals(cards.map(c=>({...c,player_id:'p'})))[0];
  assert.equal(totals.yellow_cards,4);assert.equal(totals.red_cards,3);
  assert.equal(sanctionRemaining({matches_total:null,matches_served:0}),'Pendiente de resolución');
  assert.equal(sanctionRemaining({matches_total:2,matches_served:1}),'1 partido pendiente');
});

test('service selection excludes earlier games, trainings and matches already used by any case for that player',()=>{
  const row={player_id:'p',applicable_from:'2026-11-02',origin_match_date:'2026-11-01'};
  const matches=[['before','2026-10-28','league_match'],['origin','2026-11-01','league_match'],['training','2026-11-05','training'],['used','2026-11-06','league_match'],['later','2026-11-15','league_match']]
    .map(([id,session_date,type])=>({id,name:id,session_date,type,status:'completed'}));
  assert.deepEqual(serviceCandidates(row,matches,[{player_id:'p',session_id:'used'}]).map(m=>m.id),['later']);
  assert.deepEqual(serviceCandidates({...row,applicable_from:null},matches,[]),[]);
});

test('reports preserve the yellow before a direct red and show unknown and unverified sanctions without false zero remaining',()=>{
  const data={from:'2026-11-01',to:'2026-11-17',sessions:[{id:'s',session_date:'2026-11-15',status:'completed',type:'league_match'}],callups:[],attendance:[],evaluations:[],injuries:[],standouts:[],
    cards:[{id:'c',player_id:'p',session_id:'s',type:'straight_red',discipline_kind:'yellow_red'},
      {id:'v',player_id:'p',session_id:'s',type:'double_yellow',voided_at:'2026-11-16'}],
    suspensions:[{id:'r',player_id:'p',source:'yellow_red',status:'awaiting_decision',matches_total:null,matches_served:0,created_from_session_id:'s'},
      {id:'old',player_id:'p',status:'served',matches_total:1,matches_served:1,needs_review:true,created_from_session_id:'s'}]};
  const report=buildPlayerReport({id:'p',display_name:'Synthetic'},data);
  assert.equal(report.yellows,1);assert.equal(report.reds,1);assert.equal(report.cards.length,1);
  assert.equal(report.cards[0].label,'Una amarilla + roja directa');
  assert.equal(report.currentSuspensions[0].remaining,null);assert.ok(report.suspensions.every(s=>s.remaining===null));
  assert.match(report.warnings.join(' '),/sanción/);
});
