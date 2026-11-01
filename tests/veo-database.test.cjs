const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
const { METRIC_COLUMNS } = require('../src/veo/types.ts');
const { previewMatches, seasonAnalytics } = require('../src/veo/analytics.ts');
const { parseVeoBuffer } = require('../src/veo/parser.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clone = value => JSON.parse(JSON.stringify(value));

test('VEO migrations and publication contract in isolated in-memory PostgreSQL (no production connection)', async t => {
  const db = new PGlite();
  const admin = id(1), coach = id(2), viewer = id(3);
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TYPE app_role AS ENUM ('admin','coach','viewer');
      CREATE TYPE session_type AS ENUM ('league_match','friendly_match','scrimmage','tryout','training');
      CREATE TABLE profiles(id uuid PRIMARY KEY,role app_role); CREATE TABLE players(id uuid PRIMARY KEY,name text);
      CREATE TABLE sessions(id uuid PRIMARY KEY,session_date date,type session_type);
      CREATE TABLE attendance(id integer PRIMARY KEY,status text); INSERT INTO attendance VALUES(1,'unjustified_absence');
      CREATE TABLE evaluations(id integer PRIMARY KEY,score integer); INSERT INTO evaluations VALUES(1,5);
      CREATE TABLE cards(id integer PRIMARY KEY,type text); INSERT INTO cards VALUES(1,'yellow');
      INSERT INTO profiles VALUES('${admin}','admin'),('${coach}','coach'),('${viewer}','viewer');`);
    // Reproduce Supabase's permissive defaults; migrations must override these
    // for both tables and the read-only view.
    await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated,anon');
    for (const file of ['001_veo_analytics.sql','002_veo_read_model.sql']) await db.exec(fs.readFileSync(`supabase/veo/${file}`,'utf8'));
    const auth = async (user, role='authenticated') => {
      await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${user}',false); SET ROLE ${role};`);
    };
    const publish = (payload, versions, approved=true) => db.query('SELECT public.veo_publish_import($1::jsonb,$2::jsonb,$3) AS result', [JSON.stringify(payload),JSON.stringify(versions),approved]);
    const withdraw = batch => db.query('SELECT public.veo_revert_import($1::uuid,true) AS result',[batch]);
    await t.test('staff capabilities and administrator-only publication enforced by SQL', async () => {
      const privileges=(await db.query(`SELECT
        has_table_privilege('authenticated','veo_calculated_stats','SELECT') AS read,
        has_table_privilege('authenticated','veo_calculated_stats','INSERT') AS insert,
        has_table_privilege('authenticated','veo_calculated_stats','UPDATE') AS update,
        has_table_privilege('authenticated','veo_calculated_stats','DELETE') AS delete,
        has_table_privilege('anon','veo_calculated_stats','SELECT') AS anonymous_read`)).rows[0];
      assert.deepEqual(privileges,{read:true,insert:false,update:false,delete:false,anonymous_read:false});
      await auth(admin); assert.equal((await db.query('SELECT veo_status() AS x')).rows[0].x.version,1);
      await auth(coach); assert.equal((await db.query('SELECT veo_status() AS x')).rows[0].x.version,1);
      await assert.rejects(publish({},{}), /administradores/);
      await auth(viewer); await assert.rejects(db.query('SELECT veo_status()'), /staff/);
      await auth(admin,'anon'); await assert.rejects(db.query('SELECT veo_status()'), /permission denied/);
      await assert.rejects(db.query('SELECT veo_is_admin()'), /permission denied/);
      await assert.rejects(publish({},{}), /permission denied/);
      await auth(admin);
      await assert.rejects(db.query("SELECT veo_validate_fact('{}'::jsonb)"), /permission denied/);
    });
    let matches;
    if (fs.existsSync('data/BIG DATA EQUIPO.xlsx')) {
      matches = previewMatches(parseVeoBuffer(fs.readFileSync('data/BIG DATA EQUIPO.xlsx')),'2026-2027','inspire');
    } else {
      const metrics=Object.fromEntries(Object.keys(METRIC_COLUMNS).map(k=>[k,0]));metrics.goals=1;
      matches=[{id:'local',namespace:'inspire',season:'2026-2027',round:5,date:'2026-10-18',opponent:'Synthetic',venue:'Local',goalsFor:1,goalsAgainst:0,manualMvp:null,manualMvpReason:null,notes:null,field:null,fcfReference:null,coach:null,sessionId:null,revision:0,batchId:null,active:true,teams:[],players:[{playerKey:'local',playerId:null,sourceKey:'synthetic player',jersey:1,name:'Synthetic',fullName:'Synthetic Player',position:'Portero',group:'POR',eligible:true,profile:null,calledUp:true,starter:true,fcfMinutes:90,veoMinutes:99,metrics,notes:null}]}];
    }
    await db.exec('RESET ROLE');
    for (let index=0;index<matches[0].players.length;index++) {
      const fact=matches[0].players[index];fact.playerId=id(20+index);fact.playerKey=fact.playerId;
      await db.query('INSERT INTO players VALUES($1,$2)',[fact.playerId,fact.fullName]);
    }
    for (const round of [4,5,6,7]) await db.query('INSERT INTO sessions VALUES($1,$2,$3)',[id(100+round),`2026-10-${13+round}`,'league_match']);
    matches[0].sessionId=id(105);
    const payload={version:1,namespace:'inspire',season:'2026-2027',filename:'private-workbook.xlsx',fileHash:'a'.repeat(64),matches,provenance:{issues:[],sourceCells:[]}};
    await auth(admin);
    await t.test('explicit approval, reviewed session and all rows validated before writes', async () => {
      await assert.rejects(publish(payload,{'5':0},false), /aprobación/);
      const malformed=clone(payload);malformed.matches[0].players[0].metrics.goals='not a number';
      await assert.rejects(publish(malformed,{'5':0}), /no numérica/);
      const wrongSession=clone(payload);wrongSession.matches[0].sessionId=id(104);
      await assert.rejects(publish(wrongSession,{'5':0}), /misma fecha/);
      const duplicate=clone(payload);duplicate.matches[0].players.push(duplicate.matches[0].players[0]);
      await assert.rejects(publish(duplicate,{'5':0}), /duplicado/);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM veo_import_batches')).rows[0].n,0);
    });
    let initialBatch;
    await t.test('atomic initial publication; SQL calculations reconcile real pilot when available', async () => {
      initialBatch=(await publish(payload,{'5':0})).rows[0].result.batchId;
      assert.ok(initialBatch);
      const rows=(await db.query('SELECT * FROM veo_calculated_stats')).rows;
      assert.equal(rows.length,matches[0].players.length);
      if(rows.length===23){
        assert.equal(rows.reduce((sum,row)=>sum+Number(row.effective_minutes),0),1089);
        assert.equal(rows.reduce((sum,row)=>sum+Number(row.total_bonus_cents),0),3000);
        assert.equal(Number(rows.find(row=>row.data.name==='Eloy').performance_index),61.1);
      }
    });
    await t.test('retry and identical reimport are no-ops, including a stale initial version', async () => {
      assert.equal((await publish(payload,{'5':0})).rows[0].result.noOp,true);
      assert.equal((await publish(payload,{'5':1})).rows[0].result.noOp,true);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM veo_import_batches')).rows[0].n,1);
      const reordered=clone(payload); reordered.matches[0].players.reverse();
      assert.equal((await publish(reordered,{'5':0})).rows[0].result.noOp,true);
    });
    const target=payload.matches[0].players.find(f=>f.calledUp && f.metrics.goals>0) || payload.matches[0].players[0];
    const correction=clone(payload);correction.matches[0].players.find(f=>f.playerId===target.playerId).metrics.goals++;
    let correctionBatch;
    await t.test('correction replaces facts; stale changes and unsafe rollback are rejected', async () => {
      correctionBatch=(await publish(correction,{'5':1})).rows[0].result.batchId;
      const changed=clone(correction);changed.matches[0].players.find(f=>f.playerId===target.playerId).metrics.goals++;
      await assert.rejects(publish(changed,{'5':1}), /cambió/);
      await assert.rejects(withdraw(initialBatch), /posteriores/);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM veo_player_match_stats')).rows[0].n,matches[0].players.length);
    });
    await t.test('rollback restores raw revisions atomically, then permits withdrawal of restored prior batch', async () => {
      await withdraw(correctionBatch);
      const row=(await db.query('SELECT data FROM veo_player_match_stats WHERE player_id=$1',[target.playerId])).rows[0];
      assert.equal(row.data.metrics.goals,target.metrics.goals);
      assert.equal((await db.query('SELECT revision FROM veo_matches')).rows[0].revision,3);
      await withdraw(initialBatch);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM veo_matches WHERE active')).rows[0].n,0);
      const result=(await publish(payload,{'5':4})).rows[0].result;
      assert.equal(result.noOp,false);
    });
    const extra = (round, goals, against, jersey=target.jersey) => {
      const next=clone(payload);next.matches=[clone(payload.matches[0])];
      Object.assign(next.matches[0],{round,date:`2026-10-${13+round}`,sessionId:id(100+round),goalsFor:goals,goalsAgainst:against});
      next.matches[0].players=[clone(target)];Object.assign(next.matches[0].players[0],{jersey,calledUp:true,starter:true,veoMinutes:99});
      next.matches[0].players[0].metrics.goals=goals;next.matches[0].players[0].metrics.assists=0;
      return next;
    };
    await t.test('J1–J4 imported later never advance bonus counters but retain sporting statistics', async () => {
      await publish(extra(4,7,8),{'4':0});
      const rows=(await db.query('SELECT round,metrics,previous_goals,total_bonus_cents FROM veo_calculated_stats WHERE player_id=$1 ORDER BY round',[target.playerId])).rows;
      assert.equal(Number(rows[0].total_bonus_cents),0);
      assert.equal(Number(rows[0].metrics.goals),7);
      assert.equal(Number(rows[1].previous_goals),0);
      assert.equal(Number(rows[1].total_bonus_cents),1000*target.metrics.goals);
    });
    await t.test('losses after J5 advance counters; eighth event doubles despite changed jersey', async () => {
      const untilEighth=7-target.metrics.goals;
      await publish(extra(6,untilEighth,untilEighth+1),{'6':0});
      await publish(extra(7,1,1,99),{'7':0});
      const rows=(await db.query('SELECT round,previous_goals,goal_bonus_cents FROM veo_calculated_stats WHERE player_id=$1 AND round>=6 ORDER BY round',[target.playerId])).rows;
      assert.equal(Number(rows[0].goal_bonus_cents),0);
      assert.equal(Number(rows[1].previous_goals),7);
      assert.equal(Number(rows[1].goal_bonus_cents),2000);
    });
    await t.test('malformed inputs and inconsistent mappings fail without changing published state', async () => {
      const before=(await db.query('SELECT count(*)::int AS n FROM veo_import_batches')).rows[0].n;
      for (const mutate of [
        p=>{p.version='1';}, p=>{p.filename=123;},
        p=>{p.matches[0].round=5.5;}, p=>{p.matches[0].round=null;},
        p=>{p.matches[0].date='2026-10-18 00:00';},
        p=>{p.matches[0].players[0].jersey=-1;},
        p=>{p.matches[0].players[0].eligible='false';},
        p=>{p.matches[0].players[0].metrics.goals=-1;},
        p=>{p.matches[0].players[0].metrics.passes=0;p.matches[0].players[0].metrics.successfulPasses=1;},
        p=>{p.matches[0].players[0].total_bonus_cents=999999;},
        p=>{p.matches[0].unexpected=true;},
      ]) {
        const bad=clone(payload);mutate(bad);await assert.rejects(publish(bad,{'5':5}));
      }
      await assert.rejects(publish(payload,{'5':'5'}), /revision esperada/);
      const inconsistent=extra(6,1,0);inconsistent.matches.push(clone(payload.matches[0]));
      inconsistent.matches[0].players[0].sourceKey=payload.matches[0].players[0].sourceKey;
      inconsistent.matches[0].players[0].playerId=payload.matches[0].players[1]?.playerId || id(999);
      inconsistent.matches[0].players[0].playerKey=inconsistent.matches[0].players[0].playerId;
      if(payload.matches[0].players.length>1) await assert.rejects(publish(inconsistent,{'5':5,'6':1}), /correspondencias/);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM veo_import_batches')).rows[0].n,before);
    });
    const reconcile = async () => {
      const raw=(await db.query('SELECT * FROM veo_matches WHERE active')).rows;
      const stats=(await db.query('SELECT * FROM veo_player_match_stats')).rows;
      const decoded=raw.map(m=>({...m.data,id:m.id,active:m.active,revision:m.revision,
        players:stats.filter(s=>s.match_id===m.id).map(s=>s.data)}));
      const computed=seasonAnalytics(decoded,'2026-2027','inspire').facts;
      for(const row of (await db.query('SELECT * FROM veo_calculated_stats')).rows){
        const fact=computed.find(f=>f.match.id===row.match_id && f.playerId===row.player_id);
        assert.equal(row.total_bonus_cents===null?null:Number(row.total_bonus_cents),fact.bonus?.totalCents??null);
        assert.equal(row.performance_index===null?null:Number(row.performance_index),fact.index);
        assert.equal(row.passing_rate===null?null:Number(row.passing_rate),fact.passingRate);
        if(fact.bonus) assert.equal(Number(row.previous_clean),fact.bonus.previousCleanSheets);
      }
    };
    await t.test('SQL and TypeScript agree after late corrections, unknown eligibility and rollback', async () => {
      await reconcile();
      const changed=extra(6,0,0); const version=(await db.query('SELECT revision FROM veo_matches WHERE round=6')).rows[0].revision;
      changed.matches[0].players[0].eligible=null;
      const batch=(await publish(changed,{'6':version})).rows[0].result.batchId;
      await reconcile();
      assert.equal((await db.query('SELECT total_bonus_cents FROM veo_calculated_stats WHERE round=7')).rows[0].total_bonus_cents,null);
      await withdraw(batch);await reconcile();
      changed.matches[0].players[0].eligible=true;
      const next=(await publish(changed,{'6':version+2})).rows[0].result.batchId;
      await reconcile();
      assert.equal(Number((await db.query('SELECT goal_bonus_cents FROM veo_calculated_stats WHERE round=7')).rows[0].goal_bonus_cents),1000);
      await withdraw(next);await reconcile();
    });
    await t.test('a session uniqueness failure rolls back all earlier writes in the same batch', async () => {
      const snapshot=async()=> (await db.query(`SELECT jsonb_build_object(
        'matches',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM veo_matches m),
        'stats',(SELECT jsonb_agg(to_jsonb(s) ORDER BY match_id,player_id) FROM veo_player_match_stats s),
        'batches',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM veo_import_batches b),
        'links',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM veo_player_links l)) AS state`)).rows[0].state;
      const before=await snapshot();
      const bad=extra(6,2,0);const collision=extra(7,1,0).matches[0];
      Object.assign(collision,{round:8});bad.matches.push(collision);
      const version=(await db.query('SELECT revision FROM veo_matches WHERE round=6')).rows[0].revision;
      await assert.rejects(publish(bad,{'6':version,'8':0}), /unique constraint/);
      assert.deepEqual(await snapshot(),before);
    });
    await t.test('RLS protects history, raw private provenance and writes; operational records unchanged', async () => {
      await auth(coach);
      assert.ok((await db.query('SELECT count(*)::int AS n FROM veo_matches')).rows[0].n>0);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM veo_import_batches')).rows[0].n,0);
      await assert.rejects(db.query('DELETE FROM veo_matches'), /permission denied/);
      await assert.rejects(db.query("UPDATE veo_player_links SET source_key='hijacked'"), /permission denied/);
      await assert.rejects(withdraw(initialBatch), /administradores/);
      await auth(viewer);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM veo_calculated_stats')).rows[0].n,0);
      await db.exec('RESET ROLE');
      assert.deepEqual((await db.query('SELECT * FROM attendance')).rows,[{id:1,status:'unjustified_absence'}]);
      assert.deepEqual((await db.query('SELECT * FROM evaluations')).rows,[{id:1,score:5}]);
      assert.deepEqual((await db.query('SELECT * FROM cards')).rows,[{id:1,type:'yellow'}]);
    });
  } finally { await db.close(); }
});
