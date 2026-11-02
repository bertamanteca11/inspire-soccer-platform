const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');const {PGlite}=require('@electric-sql/pglite');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const client={};require.cache[require.resolve('../src/supabase.ts')]={exports:{supabase:client}};
const {changeSessionArchiveStatus}=require('../src/lib/sessionArchive.ts');
const {getNextAvailableSession,loadAllSessions}=require('../src/lib/data.ts');
const {isActiveSession,verifiedSessionRow,sessionWriteError}=require('../src/utils/sessionArchive.ts');
const {sessionsInScope}=require('../src/utils/summaryScope.ts');
const session={id:'00000000-0000-4000-8000-000000000001',name:'Test fixture',session_date:'2026-10-21',type:'training',status:'completed',high_rating_limit:4,low_rating_limit:2};

test('archive permissions, transition validation and returned-row verification fail closed',async()=>{
  let requests=0;client.from=()=>{requests++;throw new Error('Must not write');};
  await assert.rejects(changeSessionArchiveStatus(session,'archived','coach'),/administrador/);
  await assert.rejects(changeSessionArchiveStatus(session,'archived','viewer'),/administrador/);
  await assert.rejects(changeSessionArchiveStatus(session,'planned','admin'),/Transición/);
  assert.equal(requests,0);
  for(const rows of [null,[],[{...session,id:'other',status:'archived'}],[{...session}],[{...session,status:'archived'},{...session,status:'archived'}]])
    assert.throws(()=>verifiedSessionRow(rows,session.id,'archived'),/verificado/);
  assert.match(sessionWriteError({code:'42501'}),/permisos/);
  for(const code of ['22P02','23514'])assert.match(sessionWriteError({code}),/no admite este estado/);
});

test('actual SQL archive/restore preserves fields and related records, rejects stale/denied updates',async t=>{
  const db=new PGlite();const admin='00000000-0000-4000-8000-000000000010',coach='00000000-0000-4000-8000-000000000020';
  try {
    await db.exec(`CREATE ROLE authenticated;CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.uid')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TYPE public.session_status AS ENUM ('planned','completed','archived');
      CREATE TABLE public.sessions(id uuid PRIMARY KEY,status session_status,name text,session_date date,type text,high_rating_limit int,low_rating_limit int,notes text);
      CREATE TABLE public.attendance(id int PRIMARY KEY,session_id uuid REFERENCES sessions(id),status text);
      CREATE TABLE public.evaluations(id int PRIMARY KEY,session_id uuid REFERENCES sessions(id),score int);
      CREATE TABLE public.callups(id int PRIMARY KEY,session_id uuid REFERENCES sessions(id),status text);
      ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
      CREATE POLICY session_read ON sessions FOR SELECT TO authenticated USING(true);
      CREATE POLICY admin_status ON sessions FOR UPDATE TO authenticated USING(auth.uid()='${admin}'::uuid) WITH CHECK(auth.uid()='${admin}'::uuid);
      GRANT SELECT ON sessions TO authenticated;GRANT UPDATE(status) ON sessions TO authenticated;
      INSERT INTO sessions VALUES('${session.id}','completed','Test fixture','2026-10-21','training',4,2,'Preserved note');
      INSERT INTO attendance VALUES(1,'${session.id}','present');INSERT INTO evaluations VALUES(1,'${session.id}',5);INSERT INTO callups VALUES(1,'${session.id}','called_up');`);
    const requests=[];
    client.from=table=>{
      assert.equal(table,'sessions');const filters={};let patch;
      return {update(value){patch=value;return this;},eq(key,value){filters[key]=value;return this;},async select(){
        requests.push({patch,filters});assert.deepEqual(Object.keys(patch),['status']);
        try{return {data:(await db.query('UPDATE sessions SET status=$1 WHERE id=$2 AND status=$3 RETURNING *',[patch.status,filters.id,filters.status])).rows,error:null};}
        catch(error){return {data:null,error:{code:error.code,message:error.message}};}
      }};
    };
    const authenticate=async id=>db.exec(`RESET ROLE;SELECT set_config('test.uid','${id}',false);SET ROLE authenticated;`);
    await authenticate(admin);
    let archived;
    await t.test('archive writes only status, verified against the intended UUID',async()=>{
      archived=await changeSessionArchiveStatus(session,'archived','admin');
      assert.equal(archived.status,'archived');assert.equal(archived.high_rating_limit,4);assert.equal(archived.low_rating_limit,2);assert.equal(archived.notes,'Preserved note');
      assert.deepEqual(requests[0].filters,{id:session.id,status:'completed'});
      assert.equal(sessionsInScope([archived],{mode:'period',from:'',to:'',sessionIds:[session.id]}).length,0);
      assert.equal(sessionsInScope([archived],{mode:'history',from:'',to:'',sessionIds:[]}).length,1);
    });
    await t.test('stale expected state and nonexistent IDs do not produce success',async()=>{
      await assert.rejects(changeSessionArchiveStatus(session,'archived','admin'),/verificado/);
      await assert.rejects(changeSessionArchiveStatus({...session,id:'00000000-0000-4000-8000-000000000099'},'archived','admin'),/verificado/);
    });
    await t.test('unarchive explicitly chooses planned or completed and preserves nonstandard limits',async()=>{
      const planned=await changeSessionArchiveStatus(archived,'planned','admin');assert.equal(planned.high_rating_limit,4);assert.equal(planned.low_rating_limit,2);
      const again=await changeSessionArchiveStatus(planned,'archived','admin');
      const completed=await changeSessionArchiveStatus(again,'completed','admin');assert.equal(completed.status,'completed');assert.equal(completed.high_rating_limit,4);
    });
    await t.test('RLS denial with stale UI admin role returns zero rows and never success',async()=>{
      await authenticate(coach);await assert.rejects(changeSessionArchiveStatus(session,'archived','admin'),/verificado/);
      assert.equal((await db.query('SELECT status FROM sessions')).rows[0].status,'completed');
      await authenticate(admin);
    });
    await db.exec('RESET ROLE');
    assert.deepEqual((await db.query('SELECT * FROM attendance')).rows,[{id:1,session_id:session.id,status:'present'}]);
    assert.deepEqual((await db.query('SELECT * FROM evaluations')).rows,[{id:1,session_id:session.id,score:5}]);
    assert.deepEqual((await db.query('SELECT * FROM callups')).rows,[{id:1,session_id:session.id,status:'called_up'}]);
  } finally {await db.close();}
});

test('Supabase permission and invalid-enum errors are actionable and cannot be reported as success',async()=>{
  for(const [code,pattern] of [['42501',/permisos/],['22P02',/no admite este estado/],['23514',/no admite este estado/]]){
    client.from=()=>({update(){return this},eq(){return this},select:async()=>({data:null,error:{code,message:'database error'}})});
    await assert.rejects(changeSessionArchiveStatus(session,'archived','admin'),pattern);
  }
});

test('automatic operational selection never falls back to archived sessions or any unfiltered query',async()=>{
  const reads=[];
  client.from=()=>{const filters={};return {select(){return this},gte(){return this},in(key,values){filters[key]=values;return this},order(){return this},async limit(){reads.push(filters);return {data:[],error:null}}};};
  assert.equal(await getNextAvailableSession(),null);assert.equal(reads.length,2);
  for(const r of reads)assert.deepEqual(r.status,['planned','completed']);
  client.from=()=>({select(){return this},gte(){return this},in(){return this},order(){return this},limit:async()=>({data:[{...session,status:'archived'}],error:null})});
  assert.equal(await getNextAvailableSession(),null);
  assert.equal(isActiveSession({...session,status:'archived'}),false);
  client.from=()=>({select(){return this},gte(){return this},in(){return this},order(){return this},limit:async()=>({data:null,error:{message:'Read denied'}})});
  await assert.rejects(getNextAvailableSession(),/Read denied/);
});

test('historical catalog paginates all statuses, including archived sessions',async()=>{
  const rows=Array.from({length:503},(_,i)=>({...session,id:String(i),status:i%2?'archived':'completed'}));
  client.from=()=>({select(){return this},order(){return this},range:async from=>({data:rows.slice(from,from+100),error:null})});
  const catalog=await loadAllSessions();assert.equal(catalog.length,503);assert.equal(catalog.filter(s=>s.status==='archived').length,251);
});
