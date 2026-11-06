const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=f=>fs.readFileSync('supabase/batch4/'+f,'utf8');
test('Batch 4 SQL in isolated synthetic PostgreSQL; adapters are fixtures, not live definitions',async t=>{
  const db=new PGlite();
  const admin=id(1),coach=id(2),viewer=id(3),sid=id(10),pid=id(20);
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE profiles(id uuid PRIMARY KEY,role text);
      INSERT INTO profiles VALUES('${admin}','admin'),('${coach}','coach'),('${viewer}','viewer');
      CREATE TABLE sessions(id uuid PRIMARY KEY, status text DEFAULT 'planned', globally_locked boolean DEFAULT false,
        callup_confirmed boolean NOT NULL DEFAULT false,callup_confirmed_at timestamptz,
        attendance_confirmed boolean NOT NULL DEFAULT false,attendance_confirmed_at timestamptz,
        evaluation_confirmed boolean NOT NULL DEFAULT false,evaluation_confirmed_at timestamptz,records_only_confirmed boolean DEFAULT false);
      CREATE TABLE callups(session_id uuid REFERENCES sessions,player_id uuid,status text,evaluable boolean,notes text,UNIQUE(session_id,player_id));
      CREATE TABLE attendance(session_id uuid REFERENCES sessions,player_id uuid,status text,notes text,UNIQUE(session_id,player_id));
      CREATE TABLE evaluations(session_id uuid REFERENCES sessions,player_id uuid,evaluated boolean);
      CREATE TABLE cards(session_id uuid REFERENCES sessions,player_id uuid,type text);
      CREATE TABLE players(id uuid PRIMARY KEY,status text);
      INSERT INTO players VALUES('${pid}','active');
      INSERT INTO sessions(id) VALUES('${sid}');
      GRANT USAGE ON SCHEMA public,auth TO authenticated;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT INSERT,UPDATE,DELETE ON callups,attendance,evaluations,cards TO authenticated;
      ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE callups ENABLE ROW LEVEL SECURITY;
      ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
      ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
      CREATE POLICY read_sessions ON sessions FOR SELECT TO authenticated USING(true);
      CREATE POLICY admin_sessions ON sessions FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'));
      GRANT INSERT,UPDATE ON sessions TO authenticated;
      CREATE POLICY admin_session_insert ON sessions FOR INSERT TO authenticated WITH CHECK(EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'));
      CREATE POLICY callup_admin ON callups TO authenticated USING(EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin'));
      CREATE POLICY attendance_staff ON attendance TO authenticated USING(EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','coach')));
      CREATE POLICY evaluation_staff ON evaluations TO authenticated USING(EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','coach')));
      CREATE POLICY cards_staff ON cards TO authenticated USING(EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','coach')));`);
    await db.exec(sql('001_draft_defaults_version.sql'));
    assert.equal((await db.query('SELECT draft_defaults_version FROM sessions')).rows[0].draft_defaults_version,null);
    await t.test('marker leaves historical rows NULL and has no insertion default',async()=>{
      await db.exec(`BEGIN; INSERT INTO sessions(id) VALUES('${id(70)}'); INSERT INTO sessions(id,draft_defaults_version) VALUES('${id(71)}',1);`);
      const markers=(await db.query('SELECT draft_defaults_version FROM sessions ORDER BY id')).rows.map(r=>r.draft_defaults_version);
      assert.deepEqual(markers,[null,null,1]);
      await db.exec('ROLLBACK');
      await assert.rejects(db.query('INSERT INTO sessions(id,draft_defaults_version) VALUES($1,2)',[id(72)]),/check constraint/);
    });
    await assert.rejects(db.exec(sql('002_workflow_security.sql')),/BLOCKED/);
    await db.exec('ROLLBACK');
    // Explicitly synthetic adapter. This column is NOT assumed to exist in Supabase.
    await db.exec(`CREATE FUNCTION batch4_assert_global_access(s uuid,a uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS(SELECT 1 FROM sessions WHERE id=s AND globally_locked) AND EXISTS(SELECT 1 FROM profiles WHERE id=a AND role='coach') THEN RAISE EXCEPTION 'Global lock' USING ERRCODE='42501'; END IF;
      END $$;
      CREATE FUNCTION batch4_finalize_evaluation(s uuid,a uuid,rows jsonb,records_only boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'Evaluation adapter intentionally blocked in synthetic fixture'; END $$;`);
    await db.exec(sql('002_workflow_security.sql'));
    const auth=async who=>db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${who}',false); SET ROLE authenticated;`);
    const snapshot=async()=> (await db.query('SELECT session_id,player_id,status,evaluable FROM callups WHERE session_id=$1 ORDER BY player_id',[sid])).rows;
    const action=async(wf,act,rows=[],expected)=>db.query('SELECT batch4_workflow_action($1,$2,$3,$4::jsonb,false,$5::jsonb) AS result',[sid,wf,act,JSON.stringify(rows),JSON.stringify(expected ?? (wf==='callup'?await snapshot():null))]);
    const call=[{session_id:sid,player_id:pid,status:'called_up',evaluable:true}];
    const visits=[{session_id:sid,player_id:pid,status:'present',notes:null}];
    await t.test('Coach cannot manage callups, reopen, or generally update sessions',async()=>{
      await auth(coach);
      await assert.rejects(action('callup','confirm',call),/permission denied/);
      await assert.rejects(db.query('INSERT INTO callups(session_id,player_id,status,evaluable) VALUES($1,$2,$3,true)',[sid,pid,'called_up']),/permission|policy/);
      assert.equal((await db.query('UPDATE sessions SET evaluation_confirmed=true WHERE id=$1 RETURNING id',[sid])).rows.length,0);
      await assert.rejects(action('attendance','reopen'),/permission denied/);
    });
    await t.test('callup confirmation is atomic, saved exclusion survives admin reopen',async()=>{
      await auth(admin); await action('callup','confirm',call);
      await assert.rejects(db.query('UPDATE callups SET status=$1 WHERE session_id=$2',['not_called',sid]),/closed/);
      await action('callup','reopen');
      await action('callup','confirm',[{...call[0],status:'not_called',evaluable:false}]);
      await action('callup','reopen');
      assert.equal((await db.query('SELECT status FROM callups')).rows[0].status,'not_called');
      await action('callup','confirm',call);
    });
    await t.test('Admin cannot bypass reviewed workflows through direct session flags or origin changes',async()=>{
      await auth(admin);
      for (const patch of ['callup_confirmed=false','attendance_confirmed=true','evaluation_confirmed=true',"evaluation_confirmed_at=now()",'records_only_confirmed=true','draft_defaults_version=1']) {
        await assert.rejects(db.exec('UPDATE sessions SET '+patch),/reviewed workflow RPC/);
      }
      await assert.rejects(db.query('INSERT INTO sessions(id,callup_confirmed) VALUES($1,true)',[id(85)]),/Create an open session/);
      await assert.rejects(db.query('INSERT INTO sessions(id,draft_defaults_version,status) VALUES($1,1,NULL)',[id(87)]),/Create an open session/);
      await db.query('INSERT INTO sessions(id,draft_defaults_version) VALUES($1,1)',[id(86)]);
      await db.query('UPDATE sessions SET status=$1 WHERE id=$2',['completed',id(86)]);
    });
    await t.test('partial or stale callup rosters and inconsistent guest flags roll back without confirmation',async()=>{
      await auth(admin); await action('callup','reopen');
      await db.exec(`RESET ROLE; INSERT INTO players VALUES('${id(22)}','active');`); await auth(admin);
      await assert.rejects(action('callup','confirm',call),/Incomplete or changed/);
      assert.equal((await db.query('SELECT callup_confirmed FROM sessions WHERE id=$1',[sid])).rows[0].callup_confirmed,false);
      const full=[...call,{session_id:sid,player_id:id(22),status:'guest_not_evaluable',evaluable:true}];
      await assert.rejects(action('callup','confirm',full),/Invalid reviewed/);
      full[1].evaluable=false;
      await assert.rejects(action('callup','confirm',full,[]),/Stale callup snapshot/);
      const before=await snapshot();
      await db.exec("UPDATE callups SET status='not_called',evaluable=false");
      await assert.rejects(action('callup','confirm',full,before),/Stale callup snapshot/);
      await db.exec(`RESET ROLE; DELETE FROM players WHERE id='${id(22)}';`);await auth(admin);
      await action('callup','confirm',call);
    });
    await t.test('attendance requires explicit complete save and exact snapshot, then blocks direct edits',async()=>{
      await auth(coach); await assert.rejects(action('attendance','confirm',visits),/Save and verify/);
      await db.query('INSERT INTO attendance(session_id,player_id,status) VALUES($1,$2,$3)',[sid,pid,'present']);
      await assert.rejects(action('attendance','confirm',[{...visits[0],status:'late'}]),/Save and verify/);
      assert.equal((await db.query('SELECT status FROM attendance')).rows[0].status,'present');
      await action('attendance','confirm',visits);
      for(const q of ['UPDATE attendance SET status=\'late\'','DELETE FROM attendance',`INSERT INTO attendance(session_id,player_id,status) VALUES('${sid}','${id(21)}','present')`]) await assert.rejects(db.exec(q),/closed/);
      await auth(admin); await action('attendance','reopen');
      const flags=(await db.query('SELECT callup_confirmed,attendance_confirmed,evaluation_confirmed FROM sessions WHERE id=$1',[sid])).rows[0];
      assert.deepEqual(flags,{callup_confirmed:true,attendance_confirmed:false,evaluation_confirmed:false});
      await auth(coach); await db.exec("UPDATE attendance SET status='late'");
      await db.exec("UPDATE attendance SET status='unknown'");
      await assert.rejects(action('attendance','confirm',[{...visits[0],status:'unknown'}]),/Save and verify/);
      await db.exec("UPDATE attendance SET status='late'");
    });
    await t.test('global lock and evaluation/card workflow guards protect direct writes',async()=>{
      await db.exec(`RESET ROLE; UPDATE sessions SET globally_locked=true;`); await auth(coach);
      await assert.rejects(db.exec("UPDATE attendance SET status='present'"),/Global lock/);
      await assert.rejects(action('attendance','confirm',visits),/Global lock/);
      await db.exec('RESET ROLE; UPDATE sessions SET globally_locked=false,evaluation_confirmed=true,attendance_confirmed=true');await auth(coach);
      for(const table of ['evaluations','cards']) await assert.rejects(db.query(`INSERT INTO ${table}(session_id,player_id) VALUES($1,$2)`,[sid,pid]),/closed/);
      await auth(admin);await action('evaluation','reopen');
      await auth(coach);await db.query('INSERT INTO evaluations(session_id,player_id) VALUES($1,$2)',[sid,pid]);
      await assert.rejects(db.query('UPDATE evaluations SET session_id=$1',[id(99)]),/Cannot move/);
      await assert.rejects(db.query('UPDATE evaluations SET player_id=$1',[id(99)]),/Cannot move/);
      await assert.rejects(db.exec('UPDATE evaluations SET evaluated=true'),/atomic evaluation/);
      await assert.rejects(db.query('INSERT INTO evaluations(session_id,player_id,evaluated) VALUES($1,$2,true)',[sid,id(99)]),/atomic evaluation/);
    });
    await t.test('viewer and anonymous callers cannot execute privileged operations or adapters',async()=>{
      await auth(viewer);await assert.rejects(action('attendance','confirm',visits),/permission denied/);
      await assert.rejects(db.query('SELECT batch4_assert_global_access($1,$2)',[sid,viewer]),/permission denied/);
      await db.exec('RESET ROLE; SET ROLE anon');await assert.rejects(action('attendance','confirm',visits),/permission denied/);
    });
  } finally { await db.close(); }
});
