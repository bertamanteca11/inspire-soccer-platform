const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createReleaseDatabase}=require('./helpers/releaseDatabase.cjs');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const read=f=>fs.readFileSync(f,'utf8');

test('private staff and membership restrictions against the exported schema and synthetic identities',async t=>{
  const db=await createReleaseDatabase();const susan=id(1),sergi=id(2),juli=id(3),outsider=id(4),sid=id(10),otherSid=id(11);
  const rawQuery=db.query.bind(db);let isolate=false;
  db.query=async(...args)=>{
    if(!isolate)return rawQuery(...args);
    await rawQuery('SAVEPOINT api_request');
    try{const result=await rawQuery(...args);await rawQuery('RELEASE SAVEPOINT api_request');return result;}
    catch(error){await rawQuery('ROLLBACK TO SAVEPOINT api_request');await rawQuery('RELEASE SAVEPOINT api_request');throw error;}
  };
  const privileged=()=>db.exec('RESET ROLE');
  const auth=who=>db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.sub','${who||''}',false);SET ROLE ${who?'authenticated':'anon'};`);
  const workspace=async(session=sid)=>(await db.query('SELECT private_staff_workspace($1) AS data',[session])).rows[0].data;
  const action=async(name,payload={},revision,session=sid)=>{
    const version=revision===undefined?(await workspace(session)).revision:revision;
    return (await db.query('SELECT private_staff_action($1,$2,$3::jsonb,$4) AS data',[session,name,JSON.stringify(payload),version])).rows[0].data;
  };
  const isolated=async body=>{await privileged();await db.exec('BEGIN');isolate=true;try{await body();}finally{isolate=false;await db.exec('ROLLBACK');}};
  const configured=(coach=null)=>read('supabase/staff/INSTALL_PRIVATE_STAFF.sql').replace(
    'INSERT INTO staff_access_setup VALUES (NULL);',
    `INSERT INTO staff_access_setup VALUES (${coach ? "'"+coach+"'::uuid" : 'NULL'});`
  );
  try{
    await db.exec(read('tests/fixtures/live-schema-2026-11-06.sql'));
    await db.exec('ALTER TABLE auth.users ADD email text,ADD email_confirmed_at timestamptz;');
    for(const [person,label,role]of [[susan,'susan','admin'],[sergi,'sergi','admin'],[juli,'juli','coach'],[outsider,'outsider','viewer']]){
      await db.query('INSERT INTO auth.users VALUES($1,$2,now())',[person,label+'@example.test']);
      await db.query('INSERT INTO profiles(id,email,full_name,role) VALUES($1,$2,$3,$4)',[person,label+'@example.test',label,role]);
    }
    for(const session of [sid,otherSid])await db.query("INSERT INTO sessions(id,name,session_date,type) VALUES($1,'Fixture match','2026-11-06','league_match')",[session]);
    await db.query("INSERT INTO players(id,name,display_name) VALUES($1,'Player fixture','Player fixture')",[id(20)]);
    await db.exec(read('supabase/batch4/REVIEW_INSTALL.sql'));
    await db.exec(read('supabase/veo/001_veo_analytics.sql'));
    await db.exec(read('supabase/veo/002_veo_read_model.sql'));
    // Synthetic legacy body: installation must neither execute nor replace it.
    // The production body is unknown; closing direct API access needs neither.
    await db.exec(`CREATE FUNCTION public.advance_suspensions_for_match(p_match uuid) RETURNS integer
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
        UPDATE public.sessions SET notes='Legacy function executed' WHERE id=p_match;
        RETURN 1;
      END $$;
      GRANT EXECUTE ON FUNCTION public.advance_suspensions_for_match(uuid) TO anon,authenticated,service_role;`);
    const legacyBody=(await db.query("SELECT pg_get_functiondef('public.advance_suspensions_for_match(uuid)'::regprocedure) AS definition")).rows[0].definition;
    await t.test('ambiguous shared Coach setup aborts atomically instead of granting every coach access',async()=>{
      await db.query("UPDATE profiles SET role='coach' WHERE id=$1",[outsider]);
      await assert.rejects(db.exec(configured()),/una \u00fanica cuenta Coach/);
      await db.exec('ROLLBACK');
      assert.equal((await db.query("SELECT to_regclass('public.app_access_members') AS table_name")).rows[0].table_name,null);
    });
    await t.test('other unknown definer RPCs still abort and roll back the entire installer',async()=>{
      await db.exec('CREATE FUNCTION public.validation_only_unreviewed_rpc() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT true $$;');
      await assert.rejects(db.exec(configured(juli)),/Revisar RPC adicionales.*validation_only_unreviewed_rpc/);
      await db.exec('ROLLBACK');
      assert.equal((await db.query("SELECT to_regclass('public.app_access_members') AS name")).rows[0].name,null);
      assert.equal((await db.query("SELECT has_function_privilege('anon','public.advance_suspensions_for_match(uuid)','EXECUTE') AS allowed")).rows[0].allowed,true);
      await db.exec('DROP FUNCTION public.validation_only_unreviewed_rpc();');
    });
    await db.exec(configured(juli));
    await t.test('legacy suspension RPC keeps its body and internal permissions but loses direct client access',async()=>{
      await privileged();
      assert.equal((await db.query("SELECT pg_get_functiondef('public.advance_suspensions_for_match(uuid)'::regprocedure) AS definition")).rows[0].definition,legacyBody);
      assert.equal((await db.query('SELECT notes FROM sessions WHERE id=$1',[sid])).rows[0].notes,null);
      assert.equal((await db.query("SELECT has_function_privilege('service_role','public.advance_suspensions_for_match(uuid)','EXECUTE') AS allowed")).rows[0].allowed,true);
      for(const person of [null,susan,juli,outsider]){
        await auth(person);await assert.rejects(db.query('SELECT advance_suspensions_for_match($1)',[sid]),/permission denied/);
      }
      await privileged();
    });
    await t.test('explicit shared Coach selection approves that account and excludes the other Coach',async()=>{
      await auth(juli);assert.equal((await db.query('SELECT app_access() AS data')).rows[0].data.allowed,true);
      await auth(outsider);assert.equal((await db.query('SELECT app_access() AS data')).rows[0].data.allowed,false);
      await privileged();
      const approved=(await db.query("SELECT m.user_id FROM app_access_members m JOIN profiles p ON p.id=m.user_id WHERE p.role::text='coach'")).rows;
      assert.deepEqual(approved,[{user_id:juli}]);
    });
    await t.test('post-install diagnostic verifies every new privacy and installation check',async()=>{
      const result=(await db.query(read('diagnostics/private_staff_post_install_check.sql'))).rows[0].private_staff_check;
      assert.equal(result.all_ok,true,JSON.stringify(result));
    });
    await db.query("UPDATE profiles SET role='admin' WHERE id=$1",[outsider]);
    await auth(susan);let initial=await action('add_member',{name:'Technical staff fixture',job:'Entrenador'});const member=initial.members[0].id;
    const called={rows:[{staff_id:member,status:'called_up'}]};
    await t.test('approved Admin and single Coach accounts enter; unapproved accounts stay blocked',()=>isolated(async()=>{
      for(const [person,allowed,privateStaff]of [[susan,true,true],[sergi,true,true],[juli,true,false],[outsider,false,false]]){
        await auth(person);const result=(await db.query('SELECT app_access() AS data')).rows[0].data;
        assert.equal(result.allowed,allowed);assert.equal(result.private_staff,privateStaff);
        if(!allowed)assert.equal(result.role,null);
      }
      await auth(null);assert.equal((await db.query('SELECT app_has_access() AS ok')).rows[0].ok,false);
      await assert.rejects(workspace(),/permission|denied/i);
    }));
    await t.test('Juli cannot read private rows, invoke staff RPCs, or give himself private access',()=>isolated(async()=>{
      await auth(juli);
      assert.equal((await db.query('SELECT * FROM private_staff_members')).rows.length,0);
      for(const table of ['private_staff_callups','private_staff_attendance','private_staff_cards','private_staff_suspensions','private_staff_control','private_staff_workflows'])assert.equal((await db.query('SELECT * FROM '+table)).rows.length,0);
      await assert.rejects(workspace(),/privada|denegado/);
      await assert.rejects(action('add_member',{name:'Denied'},0),/privada|denegado/);
      await assert.rejects(db.query('INSERT INTO app_access_members VALUES($1)',[juli]),/permission denied/);
      await assert.rejects(db.query('UPDATE private_staff_members SET name=$1',['Denied']),/permission denied/);
      assert.equal((await db.query("UPDATE profiles SET role='admin' WHERE id=$1 RETURNING id",[juli])).rows.length,0);
      await assert.rejects(workspace(),/privada|denegado/);
    }));
    await t.test('removed old account loses table reads, writes, views, batch4 and VEO RPCs with the same JWT',()=>isolated(async()=>{
      await auth(outsider);
      for(const table of ['players','sessions','profiles','callups','attendance','cards','evaluations','active_suspensions','player_card_totals','official_evaluations'])assert.equal((await db.query('SELECT * FROM '+table)).rows.length,0,table);
      await assert.rejects(db.query("INSERT INTO players(name,display_name) VALUES('Denied','Denied')"),/policy/);
      assert.equal((await db.query('SELECT batch4_workflow_access($1,$2) AS ok',[sid,'callup'])).rows[0].ok,false);
      await assert.rejects(db.query("SELECT batch4_workflow_action($1,'callup','confirm','[]'::jsonb,false,NULL)",[sid]),/permission denied/);
      await assert.rejects(db.query('SELECT batch4_discipline_balances()'),/Staff only/);
      await assert.rejects(db.query('SELECT veo_status()'),/reservado/);
      assert.equal((await db.query('SELECT veo_is_admin() AS ok')).rows[0].ok,false);
      await assert.rejects(db.query('TRUNCATE players CASCADE'),/permission denied/);
    }));
    await t.test('Susan and Sergi save and confirm independently from player workflow flags',()=>isolated(async()=>{
      await auth(susan);let data=await action('confirm_callup',called);assert.equal(data.workflow.callup_confirmed,true);
      await auth(sergi);data=await action('confirm_attendance',{rows:[{staff_id:member,status:'present',notes:'Checked'}]});
      assert.equal(data.workflow.attendance_confirmed,true);assert.equal(data.attendance[0].notes,'Checked');
      const playerSession=(await db.query('SELECT callup_confirmed,attendance_confirmed,evaluation_confirmed FROM sessions WHERE id=$1',[sid])).rows[0];
      assert.deepEqual(playerSession,{callup_confirmed:false,attendance_confirmed:false,evaluation_confirmed:false});
      await assert.rejects(action('save_attendance',{rows:[{staff_id:member,status:'late',notes:'Late'}]}),/reabre/);
      await assert.rejects(action('reopen_callup'),/Reabre primero/);
      await action('reopen_attendance');await action('reopen_callup');
      assert.equal((await workspace()).attendance[0].status,'present');
    }));
    await t.test('the approved Coach still evaluates players after Admin records callup and attendance',()=>isolated(async()=>{
      await auth(susan);
      const callups=[{session_id:sid,player_id:id(20),status:'called_up',evaluable:true}];
      await db.query("SELECT batch4_workflow_action($1,'callup','confirm',$2::jsonb,false,'[]'::jsonb)",[sid,JSON.stringify(callups)]);
      await db.query("INSERT INTO attendance(session_id,player_id,status) VALUES($1,$2,'present')",[sid,id(20)]);
      const attendance=[{session_id:sid,player_id:id(20),status:'present',notes:null}];
      await db.query("SELECT batch4_workflow_action($1,'attendance','confirm',$2::jsonb,false,NULL)",[sid,JSON.stringify(attendance)]);
      await auth(juli);
      const row=(await db.query('INSERT INTO evaluations(session_id,player_id) VALUES($1,$2) RETURNING *',[sid,id(20)])).rows[0];
      await db.query("SELECT batch4_workflow_action($1,'evaluation','confirm',$2::jsonb,false,NULL)",[sid,JSON.stringify([row])]);
      const result=(await db.query('SELECT evaluated,total_score FROM evaluations WHERE session_id=$1',[sid])).rows[0];
      assert.equal(result.evaluated,true);assert.equal(Number(result.total_score),3);
      await assert.rejects(workspace(),/privada|denegado/);
    }));
    await t.test('missing statuses, duplicate members, unexplained absence and stale revisions never overwrite saved data',()=>isolated(async()=>{
      await auth(susan);
      await assert.rejects(action('confirm_callup',{rows:[]}),/Revisa/);
      await assert.rejects(action('confirm_callup',{rows:[...called.rows,...called.rows]}),/Revisa/);
      let data=await action('confirm_callup',called);const old=data.revision;
      await assert.rejects(action('confirm_attendance',{rows:[]}),/Selecciona/);
      await assert.rejects(action('confirm_attendance',{rows:[{staff_id:member,status:'unjustified_absence',notes:''}]}),/check constraint/);
      data=await action('save_attendance',{rows:[{staff_id:member,status:'late',notes:'Traffic'}]});
      await assert.rejects(action('save_attendance',{rows:[{staff_id:member,status:'present'}]},old),/han cambiado/);
      assert.equal((await workspace()).attendance[0].notes,'Traffic');
    }));
    await t.test('five yellows create one sanction; serving it resets accumulation and retains history',()=>isolated(async()=>{
      await auth(susan);await action('confirm_callup',called);
      for(let i=0;i<5;i++)await action('add_card',{staff_id:member,type:'yellow',reason:'Fixture '+i});
      let data=await workspace();assert.equal(data.cards.length,5);assert.equal(data.members[0].cycle_yellows,5);assert.equal(data.suspensions.length,1);
      await action('reopen_callup');await assert.rejects(action('confirm_callup',called),/sanción activa/);
      await action('confirm_callup',{...called,acknowledge_sanctions:true});
      const sanction=data.suspensions[0];data=await action('serve_suspension',{suspension_id:sanction.id});
      assert.equal(data.members[0].cycle_yellows,0);assert.equal(data.members[0].historical_yellows,5);assert(data.suspensions[0].served_at);
      await assert.rejects(action('serve_suspension',{suspension_id:sanction.id}),/ya cumplida/);
      for(let i=0;i<5;i++)data=await action('add_card',{staff_id:member,type:'yellow',reason:'Second cycle '+i});
      assert.equal(data.members[0].historical_yellows,10);assert.equal(data.suspensions.filter(s=>!s.served_at).length,1);assert.equal(data.suspensions.length,2);
    }));
    await t.test('red-card sanctions keep their match count and cannot reset the yellow cycle',()=>isolated(async()=>{
      await auth(sergi);await action('confirm_callup',called);
      await action('add_card',{staff_id:member,type:'yellow',reason:'Yellow fixture'});
      let data=await action('add_card',{staff_id:member,type:'straight_red',reason:'Red fixture',matches:3});
      assert.equal(data.suspensions[0].matches_total,3);assert.equal(data.members[0].historical_reds,1);
      data=await action('serve_suspension',{suspension_id:data.suspensions[0].id});assert.equal(data.members[0].cycle_yellows,1);
    }));
    await t.test('one global revision prevents stale saves across sessions and no staff evaluation exists',()=>isolated(async()=>{
      await auth(susan);const old=(await workspace(otherSid)).revision;
      await action('confirm_callup',called);
      await assert.rejects(action('confirm_callup',called,old,otherSid),/han cambiado/);
      await assert.rejects(action('save_evaluation',{staff_id:member,score:5}),/desconocida/);
      await privileged();assert.equal((await db.query("SELECT count(*) AS n FROM information_schema.columns WHERE table_name LIKE 'private_staff_%' AND column_name IN ('score','evaluation','total_score','evaluated')")).rows[0].n,0);
    }));
    await t.test('archived sessions are readable but immutable and deactivated roster keeps saved records',()=>isolated(async()=>{
      await auth(susan);await action('confirm_callup',called);
      await action('member_active',{staff_id:member,active:false});assert.equal((await workspace()).callups.length,1);
      await privileged();await db.query("UPDATE sessions SET status='archived' WHERE id=$1",[sid]);
      await auth(susan);assert.equal((await workspace()).members[0].active,false);
      await assert.rejects(action('add_card',{staff_id:member,type:'yellow',reason:'Denied'}),/no admite cambios/);
    }));
    await t.test('revoking membership takes effect for existing authenticated clients',()=>isolated(async()=>{
      await auth(sergi);await workspace();
      await privileged();await db.query('DELETE FROM app_access_members WHERE user_id=$1',[sergi]);
      await auth(sergi);await assert.rejects(workspace(),/denegado/);assert.equal((await db.query('SELECT * FROM sessions')).rows.length,0);
      assert.equal((await db.query('SELECT app_access() AS data')).rows[0].data.allowed,false);
    }));
    if(db.native)await t.test('simultaneous Admin edits serialize and reject the stale revision',async()=>{
      await auth(susan);const version=(await workspace()).revision;
      const first=await db.connect(),second=await db.connect();
      const sql="SELECT private_staff_action($1,'add_member',$2::jsonb,$3) AS data";
      try{
        for(const [connection,person]of [[first,susan],[second,sergi]]){
          await connection.query('BEGIN');await connection.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[person]);await connection.query('SET LOCAL ROLE authenticated');
        }
        await first.query(sql,[sid,JSON.stringify({name:'Concurrent winner'}),version]);
        const pending=second.query(sql,[sid,JSON.stringify({name:'Stale duplicate'}),version]).then(()=>null,error=>error);
        await first.query('COMMIT');const failure=await pending;
        assert.equal(failure?.code,'40001');await second.query('ROLLBACK');
        const data=await workspace();assert(data.members.some(m=>m.name==='Concurrent winner'));assert(!data.members.some(m=>m.name==='Stale duplicate'));
      }finally{await first.end();await second.end();}
    });
  }finally{await db.close();}
});
