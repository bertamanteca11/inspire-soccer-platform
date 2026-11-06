const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createReleaseDatabase}=require('./helpers/releaseDatabase.cjs');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=f=>fs.readFileSync(f,'utf8');

test('release SQL with exported schema, synthetic auth helpers and no production data',async t=>{
  const db=await createReleaseDatabase();const admin=id(1),coach=id(2),viewer=id(3),sid=id(10),players=[20,21,22,23].map(id);
  // Each simulated API request gets a savepoint, so an expected failure rolls
  // back its complete operation while the surrounding fixture remains usable.
  const query=db.query.bind(db);let isolatedRequest=false;
  db.query=async(...args)=>{
    if(!isolatedRequest)return query(...args);
    await query('SAVEPOINT api_request_fixture');
    try{const result=await query(...args);await query('RELEASE SAVEPOINT api_request_fixture');return result;}
    catch(error){await query('ROLLBACK TO SAVEPOINT api_request_fixture');await query('RELEASE SAVEPOINT api_request_fixture');throw error;}
  };
  const auth=async who=>db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${who||''}',false); SET ROLE ${who?'authenticated':'anon'};`);
  const privileged=async()=>db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${admin}',false);`);
  const rows=async table=>(await db.query(`SELECT * FROM public.${table} WHERE session_id=$1 ORDER BY id`,[sid])).rows;
  const action=async(wf,act,body=[],records=false)=>db.query('SELECT batch4_workflow_action($1,$2,$3,$4::jsonb,$5) AS result',[sid,wf,act,JSON.stringify(body),records]);
  const transaction=async body=>{await privileged();await db.exec('BEGIN');isolatedRequest=true;try{await body();}finally{isolatedRequest=false;await db.exec('ROLLBACK');await privileged();}};
  const save=async(type='yellow',player=players[0],expected=null,matches=1)=>db.query('SELECT batch4_save_card($1,$2,$3,$4,$5,$6::jsonb) AS result',[sid,player,type,'Motivo de prueba',matches,JSON.stringify(expected)]);
  try{
    await db.exec(sql('tests/fixtures/live-schema-2026-11-06.sql'));
    for(const [person,role] of [[admin,'admin'],[coach,'coach'],[viewer,'viewer']]){
      await db.query('INSERT INTO auth.users VALUES($1)',[person]);
      await db.query('INSERT INTO profiles(id,email,role) VALUES($1,$2,$3)',[person,role+'@example.test',role]);
    }
    for(const [i,player] of players.entries())await db.query('INSERT INTO players(id,name,display_name,shirt_number) VALUES($1,$2,$2,$3)',[player,'Jugador '+i,i+1]);
    await db.query(`INSERT INTO sessions(id,name,session_date,type,status,callup_confirmed,attendance_confirmed) VALUES($1,'Partido de prueba','2026-10-18','league_match','completed',true,true)`,[sid]);
    for(const player of players){
      await db.query(`INSERT INTO callups(session_id,player_id,status,evaluable) VALUES($1,$2,'called_up',true)`,[sid,player]);
      await db.query(`INSERT INTO attendance(session_id,player_id,status) VALUES($1,$2,'present')`,[sid,player]);
      await db.query(`INSERT INTO evaluations(session_id,player_id,tactical_discipline,effort_commitment,decision_making,mentality_attitude,coachability,comment) VALUES($1,$2,4,3,2,3,5,'Original conservado')`,[sid,player]);
    }
    // Four low marks would exceed the default three after replacing the trigger.
    await db.query('UPDATE sessions SET low_rating_limit=4 WHERE id=$1',[sid]);
    for(const f of ['001_draft_defaults_version.sql','001a_live_adapters.sql','002_workflow_security.sql','003_discipline_and_standouts.sql','004_view_security.sql'])await db.exec(sql('supabase/batch4/'+f));

    await t.test('four-field finalization, retired score preservation and Admin reopen',()=>transaction(async()=>{
      await auth(coach);const snapshot=await rows('evaluations');
      await action('evaluation','confirm',snapshot);
      const saved=await rows('evaluations');assert(saved.every(r=>Number(r.total_score)===3&&r.evaluated&&r.coachability===5&&r.comment==='Original conservado'));
      await assert.rejects(db.query('UPDATE evaluations SET comment=$1 WHERE id=$2',['Forbidden',saved[0].id]),/closed/);
      await assert.rejects(action('evaluation','reopen'),/permission denied/i);
      await auth(admin);await action('evaluation','reopen');assert((await rows('evaluations')).every(r=>r.evaluated===false));
    }));
    const defaults=()=>players.map(player=>({id:null,session_id:sid,player_id:player,evaluated:false,not_applicable:false,comment:null,
      tactical_discipline:3,effort_commitment:3,decision_making:3,mentality_attitude:3,coachability:3,
      na_fields:{tactical_discipline:false,effort_commitment:false,decision_making:false,mentality_attitude:false,coachability:true}}));
    await t.test('confirmed operational defaults insert four 3s atomically and publish only eligible rows',()=>transaction(async()=>{
      await privileged();await db.query('DELETE FROM evaluations WHERE session_id=$1',[sid]);await db.query('UPDATE sessions SET draft_defaults_version=1 WHERE id=$1',[sid]);
      await auth(coach);assert.equal((await rows('evaluations')).length,0);await action('evaluation','confirm',defaults());
      const saved=await rows('evaluations');assert.equal(saved.length,4);assert(saved.every(row=>row.evaluated&&Number(row.total_score)===3&&row.coachability===3&&row.na_fields.coachability===true));
    }));
    await t.test('initial 3s cannot backfill historical holes, accept changed defaults or publish a partial roster',()=>transaction(async()=>{
      await privileged();await db.query('DELETE FROM evaluations WHERE session_id=$1',[sid]);await auth(admin);
      await assert.rejects(action('evaluation','confirm',defaults()),/new eligible operational/);assert.equal((await rows('evaluations')).length,0);
      await privileged();await db.query('UPDATE sessions SET draft_defaults_version=1 WHERE id=$1',[sid]);await auth(admin);
      const changed=defaults();changed[1].tactical_discipline=5;
      await assert.rejects(action('evaluation','confirm',changed),/four reviewed 3s/);assert.equal((await rows('evaluations')).length,0);
      await assert.rejects(action('evaluation','confirm',defaults().slice(0,3)),/Missing eligible evaluation/);assert.equal((await rows('evaluations')).length,0);
    }));
    await t.test('six high ratings and three low ratings are independent caps per quality',()=>transaction(async()=>{
      await privileged();await db.query('UPDATE evaluations SET tactical_discipline=3,effort_commitment=3,decision_making=3,mentality_attitude=3 WHERE session_id=$1',[sid]);
      await db.query('UPDATE sessions SET callup_confirmed=false,attendance_confirmed=false WHERE id=$1',[sid]);
      const roster=[...players,...[24,25,26,27,28,29,30].map(id)];
      for(const player of roster.slice(4)){
        await db.query('INSERT INTO players(id,name,display_name) VALUES($1,$2,$2)',[player,'Extra '+player.slice(-2)]);
        await db.query(`INSERT INTO callups(session_id,player_id,status,evaluable) VALUES($1,$2,'called_up',true)`,[sid,player]);
      }
      await db.query('UPDATE sessions SET callup_confirmed=true WHERE id=$1',[sid]);
      for(const player of roster.slice(4))await db.query(`INSERT INTO attendance(session_id,player_id,status) VALUES($1,$2,'present')`,[sid,player]);
      await db.query('UPDATE sessions SET attendance_confirmed=true,high_rating_limit=6,low_rating_limit=3 WHERE id=$1',[sid]);
      for(const player of roster.slice(4))await db.query('INSERT INTO evaluations(session_id,player_id,na_fields) VALUES($1,$2,$3::jsonb)',[sid,player,'{"coachability":true}']);
      await auth(coach);
      for(let i=0;i<6;i++)await db.query('UPDATE evaluations SET tactical_discipline=$1 WHERE session_id=$2 AND player_id=$3',[i%2?4:5,sid,roster[i]]);
      await assert.rejects(db.query('UPDATE evaluations SET tactical_discipline=5 WHERE session_id=$1 AND player_id=$2',[sid,roster[6]]),/Maximum high/);
      for(let i=6;i<9;i++)await db.query('UPDATE evaluations SET tactical_discipline=$1 WHERE session_id=$2 AND player_id=$3',[i%2?1:2,sid,roster[i]]);
      await assert.rejects(db.query('UPDATE evaluations SET tactical_discipline=1 WHERE session_id=$1 AND player_id=$2',[sid,roster[9]]),/Maximum low/);
      // A different quality has its own allowance; central scores consume neither.
      await db.query('UPDATE evaluations SET effort_commitment=5 WHERE session_id=$1 AND player_id=$2',[sid,roster[10]]);
      const saved=await rows('evaluations');assert.equal(saved.filter(row=>row.tactical_discipline>=4).length,6);assert.equal(saved.filter(row=>row.tactical_discipline<=2).length,3);
      await db.query('UPDATE evaluations SET tactical_discipline=3 WHERE session_id=$1 AND player_id=$2',[sid,roster[0]]);
      await privileged();await db.query('UPDATE sessions SET high_rating_limit=5 WHERE id=$1',[sid]);await auth(coach);
      await assert.rejects(db.query('UPDATE evaluations SET tactical_discipline=4 WHERE session_id=$1 AND player_id=$2',[sid,roster[0]]),/Maximum high/);
    }));
    await t.test('stale and partial evaluation snapshots cannot finalize',()=>transaction(async()=>{
      await auth(admin);const snapshot=await rows('evaluations');
      await assert.rejects(action('evaluation','confirm',snapshot.slice(1)),/Stale/);
      await db.query('UPDATE evaluations SET comment=$1 WHERE id=$2',['Changed',snapshot[0].id]);
      await assert.rejects(action('evaluation','confirm',snapshot),/Stale/);
      assert((await rows('evaluations')).every(r=>!r.evaluated));
    }));
    await t.test('records-only preserves original scores/comments while publishing no sporting evaluation',()=>transaction(async()=>{
      await auth(admin);await db.query(`UPDATE evaluations SET na_fields='{"tactical_discipline":true,"effort_commitment":true,"decision_making":true,"mentality_attitude":true}' WHERE session_id=$1`,[sid]);
      await auth(coach);await assert.rejects(action('evaluation','confirm',await rows('evaluations'),true),/Admin only/);
      await auth(admin);await action('evaluation','confirm',await rows('evaluations'),true);
      assert((await rows('evaluations')).every(row=>!row.evaluated&&row.total_score===null&&row.coachability===5&&row.comment==='Original conservado'));
      assert.equal((await db.query('SELECT records_only_confirmed FROM sessions WHERE id=$1',[sid])).rows[0].records_only_confirmed,true);
    }));
    await t.test('N/A excludes database defaults and both rating caps are enforced',()=>transaction(async()=>{
      await auth(admin);
      await db.query(`UPDATE evaluations SET na_fields='{"decision_making":true}' WHERE session_id=$1`,[sid]);
      await action('evaluation','confirm',await rows('evaluations'));
      assert((await rows('evaluations')).every(r=>Number(r.total_score)===3.33));
      await action('evaluation','reopen');await privileged();await db.query('UPDATE sessions SET high_rating_limit=0 WHERE id=$1',[sid]);await auth(coach);
      await assert.rejects(db.query('UPDATE evaluations SET tactical_discipline=5 WHERE id=$1',[(await rows('evaluations'))[0].id]),/Maximum high/);
    }));
    await t.test('anonymous/viewer calls, exposed legacy RPC and direct flags/discipline writes are denied',()=>transaction(async()=>{
      for(const person of [null,viewer]){
        await auth(person);await assert.rejects(save(),/permission|denied/i);
        await assert.rejects(db.query('SELECT create_yellow_accumulation_suspensions()'),/permission denied/i);
        await assert.rejects(db.query('SELECT batch4_finalize_evaluation($1,$2,$3::jsonb,false)',[sid,person,'[]']),/permission denied/i);
      }
      await auth(admin);
      await assert.rejects(db.query(`INSERT INTO cards(session_id,player_id,type) VALUES($1,$2,'yellow')`,[sid,players[0]]),/atomic disciplinary RPC/);
      await assert.rejects(db.query('UPDATE sessions SET evaluation_confirmed=true WHERE id=$1',[sid]),/reviewed workflow RPC/);
      await assert.rejects(db.query('UPDATE evaluations SET evaluated=true WHERE session_id=$1',[sid]),/atomic evaluation/);
      await auth(coach);assert.equal((await db.query('UPDATE sessions SET notes=$1 WHERE id=$2 RETURNING id',['No',sid])).rows.length,0);
      assert.equal((await db.query(`UPDATE profiles SET role='admin' WHERE id=$1 RETURNING id`,[coach])).rows.length,0);
    }));
    await t.test('global lock denies Coach, preserves Admin exception, and archive denies both',()=>transaction(async()=>{
      await privileged();await db.query('UPDATE sessions SET locked_at=now() WHERE id=$1',[sid]);await auth(coach);
      await assert.rejects(save(),/globally locked/);await auth(admin);await save();
      await privileged();await db.query(`UPDATE sessions SET status='archived' WHERE id=$1`,[sid]);await auth(admin);await assert.rejects(save('yellow',players[1]),/not operational/);
    }));
    await t.test('all three views enforce caller RLS and deny anonymous reads or authenticated writes',()=>transaction(async()=>{
      for(const view of ['active_suspensions','player_card_totals','official_evaluations']){
        await auth(null);await assert.rejects(db.query('SELECT * FROM '+view),/permission denied/);
        await auth(coach);await db.query('SELECT * FROM '+view);
        assert.equal((await db.query('SELECT has_table_privilege(current_user,$1,$2) AS allowed',[view,'UPDATE'])).rows[0].allowed,false);
      }
      await privileged();const options=await db.query(`SELECT reloptions FROM pg_class WHERE relname IN ('active_suspensions','player_card_totals','official_evaluations')`);
      assert(options.rows.every(row=>row.reloptions.includes('security_invoker=true')));
    }));
    await t.test('card and red sanction roll back together on a sanction failure',()=>transaction(async()=>{
      await privileged();await db.exec(`CREATE FUNCTION fail_sanction_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture sanction failure'; END $$; CREATE TRIGGER zz_fixture_failure BEFORE INSERT ON suspensions FOR EACH ROW EXECUTE FUNCTION fail_sanction_fixture();`);
      await auth(admin);await assert.rejects(save('straight_red'),/Fixture sanction failure/);
      assert.equal((await rows('cards')).length,0);
    }));
    await t.test('stale card retry cannot duplicate a card or its sanction',()=>transaction(async()=>{
      await auth(coach);await save('straight_red');await assert.rejects(save('straight_red'),/Stale card snapshot/);
      assert.equal((await rows('cards')).length,1);
      assert.equal((await db.query('SELECT * FROM suspensions')).rows.length,1);
    }));
    await t.test('served accumulation starts a new counter and preserves historical cards; retry is idempotent',()=>transaction(async()=>{
      await privileged();
      // Legacy history fixture, inserted as owner; production migration inserts none.
      await db.query(`INSERT INTO cards(session_id,player_id,type) SELECT $1,$2,'yellow' FROM generate_series(1,5)`,[sid,players[0]]);
      await db.query('SELECT batch4_reconcile_yellows($1)',[players[0]]);
      const sanction=(await db.query(`SELECT * FROM suspensions WHERE player_id=$1`,[players[0]])).rows[0];
      await auth(coach);await assert.rejects(db.query('SELECT batch4_complete_suspension($1)',[sanction.id]),/Admin only/);
      await auth(admin);await db.query('SELECT batch4_complete_suspension($1)',[sanction.id]);
      let balance=(await db.query('SELECT batch4_discipline_balances() AS result')).rows[0].result.find(r=>r.player_id===players[0]);
      assert.equal(balance.cycle_yellows,0);assert.equal(balance.historical_yellows,5);
      await privileged();await db.query(`INSERT INTO cards(session_id,player_id,type) VALUES($1,$2,'yellow')`,[sid,players[0]]);await auth(admin);
      await db.query('SELECT batch4_complete_suspension($1)',[sanction.id]);
      balance=(await db.query('SELECT batch4_discipline_balances() AS result')).rows[0].result.find(r=>r.player_id===players[0]);
      assert.equal(balance.cycle_yellows,1);assert.equal(balance.historical_yellows,6);
      await privileged();await db.query(`INSERT INTO cards(session_id,player_id,type) SELECT $1,$2,'yellow' FROM generate_series(1,4)`,[sid,players[0]]);await db.query('SELECT batch4_reconcile_yellows($1)',[players[0]]);
      assert.equal((await db.query(`SELECT * FROM suspensions WHERE status='active'`)).rows.length,1);
      assert.equal((await db.query(`SELECT * FROM suspensions WHERE status='served'`)).rows.length,1);
    }));
    await t.test('legacy served accumulation requires explicit Admin baseline and cannot silently create another sanction',()=>transaction(async()=>{
      await privileged();const historical=(await db.query(`INSERT INTO suspensions(player_id,source,status,matches_total,matches_served) VALUES($1,'yellow_accumulation','served',1,1) RETURNING id`,[players[0]])).rows[0];
      await db.query(`INSERT INTO cards(session_id,player_id,type) SELECT $1,$2,'yellow' FROM generate_series(1,5)`,[sid,players[0]]);
      await assert.rejects(db.query('SELECT batch4_reconcile_yellows($1)',[players[0]]),/initialize the legacy/);
      await auth(coach);await assert.rejects(db.query('SELECT batch4_initialize_discipline_cycle($1)',[historical.id]),/Admin only/);
      await auth(admin);await db.query('SELECT batch4_initialize_discipline_cycle($1)',[historical.id]);
      const balance=(await db.query('SELECT batch4_discipline_balances() AS result')).rows[0].result.find(r=>r.player_id===players[0]);
      assert.equal(balance.cycle_yellows,0);assert.equal(balance.historical_yellows,5);assert.equal(balance.needs_cycle_review,false);
      assert.equal((await db.query(`SELECT * FROM suspensions WHERE status='active'`)).rows.length,0);
    }));
    await t.test('standout replacement is atomic, stale-safe, and Admin only despite old permissive policies',()=>transaction(async()=>{
      const picks=players.map((player,i)=>({session_id:sid,player_id:player,category:i<2?'top':'bottom',rank:i%2+1,notes:null}));
      const replace=(values,expected=[])=>db.query('SELECT batch4_save_standouts($1,$2::jsonb,$3::jsonb)',[sid,JSON.stringify(values),JSON.stringify(expected)]);
      await auth(coach);await assert.rejects(replace(picks),/Admin only/);
      await assert.rejects(db.query(`INSERT INTO session_standouts(session_id,player_id,category,rank) VALUES($1,$2,'top',1)`,[sid,players[0]]),/atomic disciplinary/);
      await auth(admin);await replace(picks);const saved=await rows('session_standouts');assert.equal(saved.length,4);
      await assert.rejects(replace(picks),/Stale/);
      await privileged();await db.exec(`CREATE FUNCTION fail_standout_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture standout failure'; END $$; CREATE TRIGGER zz_fixture_standout_failure BEFORE INSERT ON session_standouts FOR EACH ROW EXECUTE FUNCTION fail_standout_fixture();`);
      await auth(admin);await assert.rejects(replace(picks,saved),/Fixture standout failure/);
      assert.deepEqual(await rows('session_standouts'),saved);
    }));
    if(db.native){
      async function overlap(first,second){
        const a=await db.connect(),b=await db.connect();let pending;
        try{
          for(const c of [a,b])await c.query(`SELECT set_config('request.jwt.claim.sub',$1,false);`,[admin]);
          for(const c of [a,b])await c.query('SET ROLE authenticated');
          const pid=(await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
          await a.query('BEGIN');await first(a);
          pending=second(b).then(value=>({value}),error=>({error}));
          let blocked=false;
          for(let attempt=0;attempt<100;attempt++){
            const activity=await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid]);
            if(activity.rows[0]?.wait_event_type==='Lock'){blocked=true;break;}
            await new Promise(resolve=>setTimeout(resolve,20));
          }
          assert(blocked,'second database connection must wait on the first transaction');
          await a.query('COMMIT');return await pending;
        }finally{await a.query('ROLLBACK');if(pending)await pending;await a.end();await b.end();}
      }
      await t.test('native concurrent retries serialize and create only one card',async()=>{
        await privileged();
        const request=c=>c.query(`SELECT batch4_save_card($1,$2,'yellow',NULL,1,NULL)`,[sid,players[0]]);
        const result=await overlap(request,request);assert.match(result.error?.message||'',/Stale card snapshot/);
        assert.equal((await rows('cards')).length,1);await db.query('DELETE FROM cards WHERE session_id=$1',[sid]);
      });
      await t.test('native completion versus a new card preserves the new card in the next cycle',async()=>{
        await privileged();await db.query(`INSERT INTO cards(session_id,player_id,type) SELECT $1,$2,'yellow' FROM generate_series(1,5)`,[sid,players[0]]);
        await db.query('SELECT batch4_reconcile_yellows($1)',[players[0]]);
        const sanction=(await db.query(`SELECT id FROM suspensions WHERE status='active'`)).rows[0].id;
        const next=id(11);await db.query(`INSERT INTO sessions(id,name,session_date,type,status) VALUES($1,'Second fixture match','2026-10-25','league_match','completed')`,[next]);
        await db.query(`INSERT INTO callups(session_id,player_id,status,evaluable) VALUES($1,$2,'called_up',true)`,[next,players[0]]);
        await db.query('UPDATE sessions SET callup_confirmed=true WHERE id=$1',[next]);
        await db.query(`INSERT INTO attendance(session_id,player_id,status) VALUES($1,$2,'present')`,[next,players[0]]);
        await db.query('UPDATE sessions SET attendance_confirmed=true WHERE id=$1',[next]);
        const result=await overlap(c=>c.query('SELECT batch4_complete_suspension($1)',[sanction]),c=>c.query(`SELECT batch4_save_card($1,$2,'yellow',NULL,1,NULL)`,[next,players[0]]));
        assert(!result.error,result.error?.message);
        const balances=(await db.query('SELECT batch4_discipline_balances() AS result')).rows[0].result;
        const balance=balances.find(row=>row.player_id===players[0]);assert.equal(balance.cycle_yellows,1);assert.equal(balance.historical_yellows,6);
        assert.equal((await db.query(`SELECT count(*) AS n FROM suspensions WHERE status='active'`)).rows[0].n,0);
      });
      await t.test('native simultaneous high ratings cannot exceed the session cap',async()=>{
        await privileged();await db.query('UPDATE evaluations SET tactical_discipline=3 WHERE session_id=$1',[sid]);
        await db.query('UPDATE sessions SET high_rating_limit=1 WHERE id=$1',[sid]);
        const evaluations=await rows('evaluations');
        const result=await overlap(c=>c.query('UPDATE evaluations SET tactical_discipline=5 WHERE id=$1',[evaluations[0].id]),c=>c.query('UPDATE evaluations SET tactical_discipline=5 WHERE id=$1',[evaluations[1].id]));
        assert.match(result.error?.message||'',/Maximum high/);
        assert.equal((await db.query('SELECT count(*) AS n FROM evaluations WHERE session_id=$1 AND tactical_discipline>=4',[sid])).rows[0].n,1);
      });
      await t.test('native confirmation versus editing cannot change a closed evaluation',async()=>{
        await privileged();const snapshot=await rows('evaluations');
        const result=await overlap(c=>c.query(`SELECT batch4_workflow_action($1,'evaluation','confirm',$2::jsonb,false)`,[sid,JSON.stringify(snapshot)]),c=>c.query('UPDATE evaluations SET comment=$1 WHERE id=$2',['Concurrent edit',snapshot[0].id]));
        assert.match(result.error?.message||'',/closed/);
        assert.equal((await rows('evaluations'))[0].comment,'Original conservado');
        assert.equal((await db.query('SELECT evaluation_confirmed FROM sessions WHERE id=$1',[sid])).rows[0].evaluation_confirmed,true);
      });
    }
  }finally{await db.close();}
});

test('review bundle installs atomically and a failed preflight rolls every source back',async()=>{
  const db=await createReleaseDatabase();
  try{
    await db.exec(sql('tests/fixtures/live-schema-2026-11-06.sql'));
    await db.exec(`CREATE FUNCTION batch4_actor_role() RETURNS text LANGUAGE sql AS $$ SELECT 'existing'::text $$;`);
    await assert.rejects(db.exec(sql('supabase/batch4/REVIEW_INSTALL.sql')),/existing Batch 4 installation/);await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT to_regprocedure('public.batch4_assert_global_access(uuid,uuid)') AS adapter")).rows[0].adapter,null);
    assert.equal((await db.query("SELECT count(*) AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='draft_defaults_version'")).rows[0].n,0);
    await db.exec('DROP FUNCTION batch4_actor_role()');
    await db.exec(sql('supabase/batch4/REVIEW_INSTALL.sql'));
    assert((await db.query("SELECT to_regprocedure('public.batch4_workflow_access(uuid,text)') AS access")).rows[0].access);
  }finally{await db.close();}
});
