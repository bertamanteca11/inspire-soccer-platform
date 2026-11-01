const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
const { seasonAnalytics, previewMatches, rankPlayers, rankingValue } = require('../src/veo/analytics.ts');
const { METRIC_COLUMNS } = require('../src/veo/types.ts');
const { prepareImport, mergeImport, reviewedMapping, playerCandidates, stableJson } = require('../src/veo/importProtocol.ts');
const { VeoRepository, VeoUnavailableError } = require('../src/veo/repository.ts');
const { parseVeoBuffer } = require('../src/veo/parser.ts');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clone = v => JSON.parse(JSON.stringify(v));
function player(metrics={}, overrides={}) {
  return { playerKey:uuid(1),playerId:uuid(1),sourceKey:'ana test',jersey:1,name:'Ana',fullName:'Ana Test',position:null,group:null,
    eligible:false,profile:null,calledUp:true,starter:true,fcfMinutes:90,veoMinutes:null,notes:null,
    metrics:{...Object.fromEntries(Object.keys(METRIC_COLUMNS).map(k=>[k,0])),...metrics},...overrides };
}
function match(round, metrics={}, overrides={}) {
  return {id:uuid(100+round),namespace:'inspire',season:'2026-2027',round,date:'2026-10-18',opponent:'Rival',venue:'Local',
    goalsFor:3,goalsAgainst:1,manualMvp:null,manualMvpReason:null,notes:null,field:null,fcfReference:null,coach:null,
    sessionId:uuid(200+round),revision:1,batchId:uuid(300),active:true,teams:[],players:[player(metrics)],...overrides};
}
test('J5 inclusive cutoff is independent of sporting history and import order',()=>{
  const matches=[match(7,{goals:2}),match(4,{goals:20}),match(6,{goals:7},{goalsFor:0,goalsAgainst:1}),match(5,{goals:0})];
  const a=seasonAnalytics(matches,'2026-2027','inspire');
  assert.equal(a.players[0].totals.goals,29);assert.equal(a.players[0].minutes,360);
  assert.equal(a.facts.find(f=>f.match.round===4).bonus.totalCents,0);
  assert.equal(a.facts.find(f=>f.match.round===6).bonus.totalCents,0);
  assert.equal(a.facts.find(f=>f.match.round===7).bonus.previousGoals,7);
  assert.equal(a.bonusCents,4000);assert.equal(a.historyComplete,true);
  assert.equal(seasonAnalytics(matches.reverse(),'2026-2027').bonusCents,4000);
});
test('clean sheet threshold, separate categories and stable UUID despite jersey changes',()=>{
  const a=seasonAnalytics([match(5,{}, {goalsAgainst:0,players:[player({},{eligible:true,veoMinutes:65})]}),
    match(6,{}, {goalsAgainst:0,players:[player({},{eligible:true,veoMinutes:65.1,jersey:99})]})],'2026-2027');
  assert.equal(a.players.length,1);assert.equal(a.facts[0].bonus.cleanSheetOccurrence,0);
  assert.equal(a.facts[1].bonus.cleanSheetOccurrence,1);assert.equal(a.bonusCents,1000);
});
test('zero VEO takes priority, null VEO falls back, noncalled cannot participate',()=>{
  const a=seasonAnalytics([match(5,{}, {players:[player({},{veoMinutes:0}),player({},{playerKey:uuid(2),playerId:uuid(2),veoMinutes:null}),player({},{playerKey:uuid(3),playerId:uuid(3),calledUp:false,veoMinutes:90})]})],'2026-2027');
  assert.deepEqual(a.facts.map(f=>f.minutes),[0,90,0]);assert.deepEqual(a.facts.map(f=>f.index),[null,0,null]);
});
test('rankings exclude unknown observations; sums, denominators and weighted metrics are correct',()=>{
  const a=seasonAnalytics([match(5,{distanceKm:null,passes:10,successfulPasses:10,maxSpeedKmh:30,averageSpeedKmh:10}),
    match(6,{distanceKm:0,passes:90,successfulPasses:45,maxSpeedKmh:20,averageSpeedKmh:4},{players:[player({distanceKm:0,passes:90,successfulPasses:45,maxSpeedKmh:20,averageSpeedKmh:4},{fcfMinutes:30})]})],'2026-2027');
  const p=a.players[0];assert.equal(p.passingRate,.55);assert.equal(p.weightedSpeed,8.5);assert.equal(p.maximumSpeed,30);
  assert.equal(p.averages.distanceKm,0);assert.equal(p.totals.distanceKm,0);
  assert.equal(rankingValue(p,'maxSpeedKmh'),30);
  const unknown=seasonAnalytics([match(5,{distanceKm:null})],'2026-2027').players;
  assert.equal(rankPlayers(unknown,'distanceKm').length,0);assert.equal(rankPlayers([p],'distanceKm').length,1);
});
test('unknown season and incomplete financial inputs remain explicitly not calculable',()=>{
  assert.equal(seasonAnalytics([match(5,{}, {season:'2027-2028'})],'2027-2028').bonusCents,null);
  assert.equal(seasonAnalytics([match(5,{assists:null}),match(6,{goals:1})],'2026-2027').bonusCents,null);
  assert.deepEqual(seasonAnalytics([match(7)],'2026-2027').missingRounds,[5,6]);
  assert.equal(seasonAnalytics([match(5)],'2026-2027',undefined,false).bonusCents,null);
});
test('ambiguous previously reviewed links never automatically select an identity',()=>{
  const links=[{namespace:'inspire',source_key:'ana',player_id:uuid(1)},{namespace:'inspire',source_key:'ana',player_id:uuid(2)},
    {namespace:'inspire',source_key:'bea',player_id:uuid(3)}];
  assert.deepEqual(reviewedMapping(links,'inspire'),{bea:uuid(3)});
  assert.equal(playerCandidates('Ana Test',[{id:uuid(1),name:'Ana Test',display_name:'A'},{id:uuid(2),name:'Ana Test',display_name:'B'}]).length,2);
});
test('source canonical comparison is independent of JSONB property order; merge replaces only selected rounds',()=>{
  assert.equal(stableJson({a:1,b:{c:2,d:3}}),stableJson({b:{d:3,c:2},a:1}));
  const merged=mergeImport([match(4),match(5)],[match(5,{goals:2})]);
  assert.equal(merged.length,2);assert.equal(merged.find(m=>m.round===5).players[0].metrics.goals,2);
});
test('reviewed player/session mapping, duplicate identity and correction detection against actual workbook', {skip:!fs.existsSync('data/BIG DATA EQUIPO.xlsx')},()=>{
  const preview=parseVeoBuffer(fs.readFileSync('data/BIG DATA EQUIPO.xlsx'));
  const raw=previewMatches(preview,'2026-2027','inspire');
  const players=raw[0].players.map((p,i)=>({id:uuid(i+1),name:p.fullName,display_name:p.name}));
  const sessions=[{id:uuid(100),session_date:'2026-10-18',name:'Alzamora',type:'league_match'}];
  const mapping={players:Object.fromEntries(raw[0].players.map((p,i)=>[p.sourceKey,players[i].id])),sessions:{5:uuid(100)}};
  const input={preview,namespace:'inspire',season:'2026-2027',filename:'source.xlsx',fileHash:'a'.repeat(64),mapping,players,sessions,existing:[]};
  const initial=prepareImport(input);assert.deepEqual(initial.errors,[]);assert.equal(initial.changes[0].kind,'new');
  const same=prepareImport({...input,existing:initial.matches.map(m=>({...m,revision:1}))});
  assert.equal(same.changes[0].kind,'unchanged');assert.equal(same.changes[0].changedPlayers,0);
  const prior=clone(initial.matches);prior[0].players[0].metrics.goals=8;
  assert.equal(prepareImport({...input,existing:prior}).changes[0].changedPlayers,1);
  assert.ok(prepareImport({...input,mapping:{players:{},sessions:{}}}).errors.length>0);
  const duplicate=clone(mapping);duplicate.players[raw[0].players[1].sourceKey]=players[0].id;
  assert.ok(prepareImport({...input,mapping:duplicate}).errors.some(e=>e.includes('mismo jugador')));
  assert.ok(prepareImport({...input,sessions:[{...sessions[0],session_date:'2026-10-19'}]}).errors.length>0);
});
test('repository is explicit about unactivated schema, refuses unapproved writes and reports concurrency errors',async()=>{
  const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:null,error:{code:'PGRST202',message:'missing'}};}};
  const repo=new VeoRepository(client);
  await assert.rejects(repo.available(),VeoUnavailableError);
  await assert.rejects(repo.publish({}, {},false),/explícitamente/);assert.equal(calls.length,1);
  client.rpc=async()=>({data:null,error:{code:'40001',message:'stale'}});
  await assert.rejects(repo.publish({}, {},true),/cambiaron/);
  client.rpc=async()=>({data:{noOp:true,batchId:null},error:null});
  assert.equal((await repo.publish({}, {},true)).noOp,true);
});
test('repository coach reads only published model, pagination is complete, failures never become mock success',async()=>{
  const tables=[];
  const client={rpc:async()=>({data:{version:1,ruleVersion:'2026-j5-v1'},error:null}),from(table){tables.push(table);return{select(){return this},order(){return this},async limit(){return {data:[],error:null}},async range(offset){return {data:offset===0&&table==='veo_matches'?[{id:uuid(1),namespace:'inspire',season:'2026-2027',round:5,session_id:uuid(2),revision:1,active:true,batch_id:uuid(3),data:match(5)}]:[],error:null}}}}};
  const result=await new VeoRepository(client).load('coach');assert.equal(result.matches.length,1);
  assert.deepEqual([...new Set(tables)].sort(),['veo_calculated_stats','veo_matches','veo_player_match_stats']);
  client.from=()=>({select(){return this},order(){return this},limit:async()=>({data:[],error:null}),range:async()=>({data:null,error:{message:'denied'}})});
  await assert.rejects(new VeoRepository(client).load('coach'),/denied/);
});

test('installed empty schema is ready; missing view and denied access are distinct failures',async()=>{
  let error=null;
  const client={rpc:async()=>({data:{version:1,ruleVersion:'2026-j5-v1'},error:null}),
    from(){return {select(){return this},order(){return this},limit:async()=>({data:[],error}),range:async()=>({data:[],error:null})}}};
  const repo=new VeoRepository(client);
  assert.deepEqual((await repo.load('admin')).matches,[]);
  error={code:'PGRST205',message:'missing view'};
  await assert.rejects(repo.available(),VeoUnavailableError);
  error={code:'42501',message:'permission denied'};
  await assert.rejects(repo.available(),e=>!(e instanceof VeoUnavailableError)&&/permission denied/.test(e.message));
});

test('player observation pagination orders by the complete primary key',async()=>{
  const orders=[];
  const client={rpc:async()=>({data:{version:1,ruleVersion:'2026-j5-v1'},error:null}),
    from(table){return {select(){return this},order(column){if(table==='veo_player_match_stats')orders.push(column);return this},
      limit:async()=>({data:[],error:null}),range:async()=>({data:[],error:null})}}};
  await new VeoRepository(client).load('coach');
  assert.deepEqual(orders,['match_id','player_id']);
});
