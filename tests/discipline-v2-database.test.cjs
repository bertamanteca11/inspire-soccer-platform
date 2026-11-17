const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createReleaseDatabase}=require('./helpers/releaseDatabase.cjs');
const read=f=>fs.readFileSync(f,'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('disciplinary cases use explicit match service, independent cards and preserved historical records',async t=>{
  const db=await createReleaseDatabase(),admin=id(1),coach=id(2),viewer=id(3);
  const auth=who=>db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.sub','${who||''}',false);SET ROLE ${who?'authenticated':'anon'};`);
  const privileged=()=>db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.sub','${admin}',false);`);
  const workspace=async player=>(await db.query('SELECT discipline_workspace($1) AS data',[player||null])).rows[0].data;
  const action=async(action,payload,revision=null)=>(await db.query('SELECT discipline_action($1,$2::jsonb,$3) AS data',[action,JSON.stringify(payload),revision])).rows[0].data;
  let seq=100;
  const player=async()=>{
    await privileged();const pid=id(seq++);await db.query("INSERT INTO players(id,name,display_name) VALUES($1,'Synthetic player','Synthetic player')",[pid]);return pid;
  };
  const match=async(offset,type='league_match')=>{
    await privileged();const sid=id(seq++);
    await db.query("INSERT INTO sessions(id,name,session_date,type,status,callup_confirmed,attendance_confirmed) VALUES($1,'Synthetic match',(statement_timestamp() AT TIME ZONE 'Europe/Copenhagen')::date+$2::integer,$3,'completed',true,true)",[sid,offset,type]);
    return sid;
  };
  const save=async(pid,sid,kind,matches=null,reason='Verified incident')=>{
    await privileged();
    if(!(await db.query('SELECT 1 FROM callups WHERE session_id=$1 AND player_id=$2',[sid,pid])).rows.length){
      await db.query('UPDATE sessions SET callup_confirmed=false WHERE id=$1',[sid]);
      await db.query("INSERT INTO callups(session_id,player_id,status,evaluable) VALUES($1,$2,'called_up',true)",[sid,pid]);
      await db.query('UPDATE sessions SET callup_confirmed=true WHERE id=$1',[sid]);
    }
    await auth(coach);
    const old=(await db.query('SELECT * FROM cards WHERE session_id=$1 AND player_id=$2 AND voided_at IS NULL',[sid,pid])).rows[0];
    if(old){const linked=(await db.query("SELECT revision FROM suspensions WHERE origin_card_id=$1 AND source<>'yellow_accumulation'",[old.id])).rows[0];old._case_revision=linked?.revision??null;}
    return (await db.query('SELECT discipline_save_card($1,$2,$3,$4,$5,$6::jsonb) AS data',[sid,pid,kind,reason,matches,old?JSON.stringify(old):null])).rows[0].data;
  };
  const balance=async pid=>(await workspace(pid)).balances[0];
  const caseFor=async(pid,source)=>(await workspace(pid)).cases.find(s=>!source||s.source===source);
  const decide=async(pid,s,days,applicable,extra={})=>{
    const data=await action('save_case',{id:s.id,matches_total:days,applicable_from:applicable,decision_date:applicable,
      decision_notes:'Official decision reviewed',...extra},s.revision);
    return data.cases.find(c=>c.id===s.id);
  };
  const date=async offset=>(await db.query("SELECT ((statement_timestamp() AT TIME ZONE 'Europe/Copenhagen')::date+$1::integer)::text AS d",[offset])).rows[0].d;
  const serve=async(s,sid)=>action('serve_match',{id:s.id,session_id:sid,verified_not_played:true,notes:'Official suspension served; confirmed did not play'},s.revision);
  try{
    await db.exec(read('tests/fixtures/live-schema-2026-11-06.sql').replace('"total_score" "pg_catalog"."numeric",','"total_score" "pg_catalog"."numeric" GENERATED ALWAYS AS (round((tactical_discipline+effort_commitment+decision_making+mentality_attitude+coachability)::numeric/5,2)) STORED,'));
    for(const [who,role]of [[admin,'admin'],[coach,'coach'],[viewer,'viewer']]){
      await db.query('INSERT INTO auth.users VALUES($1)',[who]);await db.query('INSERT INTO profiles(id,email,role) VALUES($1,$2,$3)',[who,role+'@example.test',role]);
    }
    await db.exec(read('supabase/batch4/REVIEW_INSTALL.sql'));
    await db.exec(read('supabase/staff/INSTALL_PRIVATE_STAFF.sql'));
    await db.exec(read('supabase/staff/RESTORE_COACH_ACCESS.sql'));
    const legacy=await player(),legacyMatch=await match(-10);
    await db.query("INSERT INTO cards(player_id,session_id,type,reason) VALUES($1,$2,'yellow','Preserved historical record')",[legacy,legacyMatch]);
    await db.query("INSERT INTO suspensions(player_id,source,matches_total,matches_served,status,reason,created_from_session_id,served_at) VALUES($1,'straight_red',1,1,'served','Preserved unverified legacy service',$2,now())",[legacy,legacyMatch]);
    const beforeCards=(await db.query('SELECT * FROM cards')).rows,beforeCases=(await db.query('SELECT * FROM suspensions')).rows;
    await db.exec(read('supabase/discipline/001_cases_and_service.sql'));
    const installation=await db.exec(read('diagnostics/discipline_post_install_check.sql'));
    assert.equal(installation.at(-1).rows[0].discipline_install_check.all_ok,true);
    await auth(coach);
    await t.test('J: migration preserves all original sporting values and flags ambiguous service for explicit review',async()=>{
      for(const original of beforeCards){const row=(await db.query('SELECT * FROM cards WHERE id=$1',[original.id])).rows[0];for(const key of Object.keys(original))assert.deepEqual(row[key],original[key]);}
      for(const original of beforeCases){const row=(await db.query('SELECT * FROM suspensions WHERE id=$1',[original.id])).rows[0];for(const key of Object.keys(original))assert.deepEqual(row[key],original[key]);assert.equal(row.needs_review,true);}
      assert.equal((await db.query('SELECT count(*) AS n FROM discipline_service_matches')).rows[0].n,0);
    });
    for(const [kind,yellows,reds]of [['yellow',1,0],['double_yellow',2,1],['straight_red',0,1],['yellow_red',1,1]])await t.test('A–D: '+kind+' retains its complete historical events',async()=>{
      const pid=await player(),sid=await match(-8);await save(pid,sid,kind);
      const b=await balance(pid);assert.equal(b.historical_yellows,yellows);assert.equal(b.historical_reds,reds);
      if(reds){const s=await caseFor(pid);assert.equal(s.status,'awaiting_decision');assert.equal(s.matches_total,null);assert.equal(s.matches_served,0);}
      if(kind==='double_yellow'||kind==='yellow_red')assert.equal(b.undecided_yellow_events,1);
    });
    for(const extrasBefore of [false,true])await t.test('E: a verified five-yellow suspension consumes five, not all seven; extras '+(extrasBefore?'before':'after')+' service remain 2/5',async()=>{
      const pid=await player();
      for(let i=0;i<5;i++)await save(pid,await match(-30+i),'yellow');
      let s=await caseFor(pid,'yellow_accumulation');assert.equal(s.status,'awaiting_decision');assert.equal(s.accumulation_threshold,5);
      if(extrasBefore)for(let i=0;i<2;i++)await save(pid,await match(-24+i),'yellow');
      await auth(coach);s=await decide(pid,s,1,await date(-25));
      const servedMatch=await match(-20);await auth(coach);await serve(s,servedMatch);
      if(!extrasBefore)for(let i=0;i<2;i++)await save(pid,await match(-18+i),'yellow');
      const b=await balance(pid);assert.equal(b.historical_yellows,7);assert.equal(b.cycle_yellows,2);assert.equal(b.yellow_threshold,5);
      assert.equal((await caseFor(pid,'yellow_accumulation')).status,'served');
      assert.equal((await db.query('SELECT units FROM discipline_cycle_credits WHERE player_id=$1',[pid])).rows[0].units,5);
    });
    await t.test('F/I: an earlier served match never consumes a later red or two different sanctions',async()=>{
      const pid=await player();for(let i=0;i<5;i++)await save(pid,await match(-25+i),'yellow');
      let yellow=await caseFor(pid,'yellow_accumulation');yellow=await decide(pid,yellow,1,await date(-20));
      const earlier=await match(-19);await auth(coach);await serve(yellow,earlier);
      const redOrigin=await match(-15);await save(pid,redOrigin,'straight_red',1);
      let red=await caseFor(pid,'straight_red');assert.equal(red.matches_served,0);assert.equal(red.status,'active');
      red=await decide(pid,red,1,await date(-14));
      await assert.rejects(serve(red,earlier),/posterior al origen/);
      const later=await match(-12);await auth(coach);
      const manual=(await action('save_case',{player_id:pid,source:'manual',request_key:id(seq++),matches_total:1,applicable_from:await date(-14),decision_notes:'Separate official case'})).cases.find(c=>c.source==='manual');
      await serve(red,later);await assert.rejects(serve(manual,later),error=>error.code==='23505');
      const data=await workspace(pid);assert.equal(data.cases.find(c=>c.id===manual.id).matches_served,0);
      assert.equal(data.cases.find(c=>c.id===red.id).status,'served');
      assert.equal(data.service_matches.filter(m=>!m.revoked_at).length,2);
    });
    await t.test('G: unknown red length accepts explicitly verified eligible service; the later official decision accounts for that case only',async()=>{
      const pid=await player();await save(pid,await match(-12),'yellow_red');
      let s=await caseFor(pid);s=await decide(pid,s,null,await date(-11));
      const served1=await match(-10);await auth(coach);let data=await serve(s,served1);s=data.cases.find(c=>c.id===s.id);
      assert.equal(s.matches_total,null);assert.equal(s.matches_served,1);assert.equal(s.status,'awaiting_decision');
      s=await decide(pid,s,2,await date(-11));assert.equal(s.status,'partially_served');assert.equal(s.matches_remaining,1);
      await assert.rejects(decide(pid,s,0,await date(-11)),/entre 1 y 99/);
      const served2=await match(-9);await auth(coach);data=await serve(s,served2);
      assert.equal(data.cases.find(c=>c.id===s.id).status,'served');assert.equal(data.balances[0].historical_yellows,1);
    });
    await t.test('H: editing a match card updates the same event and case; stale writes and changing served incidents are rejected',async()=>{
      const pid=await player(),sid=await match(-10);const first=await save(pid,sid,'straight_red');
      let s=await caseFor(pid);const originalId=s.id;
      const edited=await save(pid,sid,'yellow_red',2,'Corrected official incident');
      assert.equal(edited.card.id,first.card.id);s=await caseFor(pid);
      assert.equal(s.id,originalId);assert.equal(s.source,'yellow_red');assert.equal(s.matches_total,2);
      assert.equal((await workspace(pid)).cases.length,1);assert.equal((await balance(pid)).historical_yellows,1);
      await assert.rejects(db.query('SELECT discipline_save_card($1,$2,$3,$4,$5,$6::jsonb)',[sid,pid,'yellow','Stale',null,JSON.stringify(first.card)]),/Stale card snapshot/);
      s=await decide(pid,s,1,await date(-9));const served=await match(-8);await auth(coach);await serve(s,served);
      await assert.rejects(save(pid,sid,'yellow',null,'Cannot remove a served red'),/Revisa el servicio/);
      assert.equal((await workspace(pid)).cases.length,1);
    });
    await t.test('a stale evaluation card draft cannot overwrite an official sanction decision entered on another device',async()=>{
      const pid=await player(),sid=await match(-10);await save(pid,sid,'straight_red');let s=await caseFor(pid);
      const card=(await db.query('SELECT * FROM cards WHERE player_id=$1',[pid])).rows[0];card._case_revision=s.revision;
      s=await decide(pid,s,3,await date(-9));
      await assert.rejects(db.query('SELECT discipline_save_card($1,$2,$3,$4,$5,$6::jsonb)',[sid,pid,'straight_red','Stale edit',null,JSON.stringify(card)]),error=>error.code==='40001');
      assert.equal((await caseFor(pid)).matches_total,3);
      assert.equal((await db.query('SELECT reason FROM cards WHERE id=$1',[card.id])).rows[0].reason,'Verified incident');
    });
    await t.test('ordinary absence, injury, training, future matches and actual participation do not count automatically or qualify as service',async()=>{
      const pid=await player();await save(pid,await match(-10),'straight_red');let s=await caseFor(pid);s=await decide(pid,s,2,await date(-9));
      const training=await match(-7,'training'),future=await match(1),participated=await match(-6);
      await privileged();await db.query('UPDATE sessions SET callup_confirmed=false,attendance_confirmed=false WHERE id=$1',[participated]);
      await db.query("INSERT INTO callups(session_id,player_id,status,evaluable) VALUES($1,$2,'called_up',true)",[participated,pid]);
      await db.query('UPDATE sessions SET callup_confirmed=true WHERE id=$1',[participated]);
      await db.query("INSERT INTO attendance(session_id,player_id,status) VALUES($1,$2,'present')",[participated,pid]);
      await db.query('UPDATE sessions SET attendance_confirmed=true WHERE id=$1',[participated]);await auth(coach);
      await assert.rejects(serve(s,training),/partido de liga completado/);await assert.rejects(serve(s,future),/partido de liga completado/);
      await assert.rejects(serve(s,participated),/participante/);
      await privileged();await db.query('UPDATE sessions SET callup_confirmed=false WHERE id=$1',[participated]);
      await db.query("UPDATE callups SET status='guest_not_evaluable',evaluable=false WHERE session_id=$1 AND player_id=$2",[participated,pid]);
      await db.query('UPDATE sessions SET callup_confirmed=true WHERE id=$1',[participated]);await auth(coach);
      await assert.rejects(serve(s,participated),/participante/);
      const data=await workspace(pid);assert.equal(data.cases[0].matches_served,0);assert.equal(data.service_matches.length,0);
    });
    await t.test('later attendance edits cannot turn a verified suspension match into a played match',async()=>{
      const pid=await player();await save(pid,await match(-10),'straight_red');let s=await caseFor(pid);s=await decide(pid,s,2,await date(-9));
      const serviceMatch=await match(-8);await auth(coach);await serve(s,serviceMatch);
      await privileged();await db.query('UPDATE sessions SET callup_confirmed=false,attendance_confirmed=false WHERE id=$1',[serviceMatch]);
      await db.query("INSERT INTO callups(session_id,player_id,status,evaluable) VALUES($1,$2,'called_up',true)",[serviceMatch,pid]);
      await db.query('UPDATE sessions SET callup_confirmed=true WHERE id=$1',[serviceMatch]);
      await assert.rejects(db.query("INSERT INTO attendance(session_id,player_id,status) VALUES($1,$2,'present')",[serviceMatch,pid]),/cumplimiento de una sanción/);
      await db.query("INSERT INTO attendance(session_id,player_id,status,notes) VALUES($1,$2,'justified_absence','Serving this explicit case')",[serviceMatch,pid]);
      await auth(coach);assert.equal((await caseFor(pid)).matches_served,1);
    });
    await t.test('legacy red wrongly marked served can be reopened only through a documented explicit review, retaining its original audit',async()=>{
      await auth(coach);let s=(await workspace(legacy)).cases[0];assert.equal(s.status,'served');assert.equal(s.needs_review,true);
      await assert.rejects(decide(legacy,s,null,await date(-9)),/revisión histórica/);
      s=await decide(legacy,s,null,await date(-9),{review_history:true,decision_notes:'Prior served flag had no later match; official length not known'});
      assert.equal(s.status,'awaiting_decision');assert.equal(s.matches_total,null);assert.equal(s.matches_served,0);assert.equal(s.needs_review,false);
      const audit=(await db.query("SELECT before_data,after_data FROM discipline_audit WHERE entity_id=$1 AND action='save_case'",[s.id])).rows.at(-1);
      assert.equal(audit.before_data.status,'served');assert.equal(audit.before_data.matches_served,1);assert.equal(audit.after_data.matches_served,0);
    });
    await t.test('only league yellows contribute; dismissal rules remain explicitly unknown until an Admin configures them',async()=>{
      const pid=await player();await save(pid,await match(-9,'friendly_match'),'yellow');
      assert.equal((await balance(pid)).cycle_yellows,0);assert.equal((await balance(pid)).historical_yellows,1);
      await save(pid,await match(-8),'double_yellow');await save(pid,await match(-7),'yellow_red');
      let data=await workspace(pid);assert.equal(data.balances[0].cycle_yellows,0);assert.equal(data.balances[0].undecided_yellow_events,2);
      const pendingPlayer=await player();for(let i=0;i<4;i++)await save(pendingPlayer,await match(-20+i),'yellow');
      await save(pendingPlayer,await match(-15),'yellow_red');
      assert.equal((await workspace(pendingPlayer)).cases.filter(c=>c.source==='yellow_accumulation').length,0);
      await assert.rejects(action('rules',{...data.rules,double_yellow_units:0,yellow_red_units:1},data.rules.revision),/Admin only/);
      await auth(admin);await action('rules',{...data.rules,double_yellow_units:0,yellow_red_units:1},data.rules.revision);
      data=await workspace(pid);assert.equal(data.balances[0].cycle_yellows,1);assert.equal(data.balances[0].historical_yellows,4);assert.equal(data.balances[0].undecided_yellow_events,0);
      assert.equal((await workspace(pendingPlayer)).cases.filter(c=>c.source==='yellow_accumulation').length,1);
    });
    await t.test('selecting no card withdraws the incident with an audit, preserving the original instead of deleting it',async()=>{
      const pid=await player(),sid=await match(-10);const saved=await save(pid,sid,'yellow');await save(pid,sid,'none',null,'Correction');
      assert.ok((await db.query('SELECT voided_at FROM cards WHERE id=$1',[saved.card.id])).rows[0].voided_at);
      assert.equal((await balance(pid)).historical_yellows,0);
      assert.equal((await db.query('SELECT count(*) AS n FROM discipline_audit WHERE entity_id=$1',[saved.card.id])).rows[0].n,2);
    });
    await t.test('correcting a fifth yellow cannot silently invalidate or duplicate its independent accumulation decision',async()=>{
      const pid=await player();let last;for(let i=0;i<5;i++){last=await match(-20+i);await save(pid,last,'yellow');}
      const s=await caseFor(pid,'yellow_accumulation');
      await assert.rejects(save(pid,last,'none',null,'Official correction'),/invalidaría una sanción/);
      assert.equal((await balance(pid)).historical_yellows,5);
      await decide(pid,s,null,null,{cancelled:true});await save(pid,last,'none',null,'Official correction');
      const data=await workspace(pid);assert.equal(data.cases.length,1);assert.equal(data.cases[0].status,'cancelled');
      assert.equal(data.balances[0].historical_yellows,4);
    });
    await t.test('public writes and old automatic-completion paths cannot bypass reviewed service or authorized roles',async()=>{
      for(const who of [null,viewer]){
        await auth(who);await assert.rejects(workspace(legacy),/permission|Staff only/);await assert.rejects(action('save_case',{player_id:legacy}),/permission|Staff only/);
      }
      await auth(coach);
      await assert.rejects(db.query("INSERT INTO discipline_service_matches(suspension_id,player_id,session_id,verified_by,notes) VALUES($1,$2,$3,$4,'No RPC')",[beforeCases[0].id,legacy,legacyMatch,coach]),/permission denied/);
      await assert.rejects(db.query('SELECT batch4_complete_suspension($1)',[beforeCases[0].id]),/Selecciona y verifica/);
      await assert.rejects(db.query('SELECT batch4_initialize_discipline_cycle($1)',[beforeCases[0].id]),/no se reinicia/);
    });
    await t.test('a new season starts its own league count without resetting physical history or previous service credits',async()=>{
      await auth(admin);let data=await workspace();
      const previous=data.balances.find(b=>b.historical_yellows===7&&b.cycle_yellows===2);assert.ok(previous);
      await action('rules',{...data.rules,season_start:await date(1)},data.rules.revision);
      data=await workspace(previous.player_id);
      assert.equal(data.balances[0].historical_yellows,7);assert.equal(data.balances[0].cycle_yellows,0);
      assert.equal(data.balances[0].consumed_yellows,0);
      assert.equal((await db.query('SELECT units FROM discipline_cycle_credits WHERE player_id=$1',[previous.player_id])).rows[0].units,5);
    });
  }finally{await db.close();}
});
