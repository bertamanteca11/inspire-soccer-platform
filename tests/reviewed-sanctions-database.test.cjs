const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createDisciplineUiDatabase}=require('./helpers/disciplineUiDatabase.cjs');
const template=fs.readFileSync('supabase/discipline/APPLY_REVIEWED_SANCTIONS.sql','utf8');
const marker='$config${"reviewer_user_id":null,"cases":[]}$config$';
test('reviewed partial-sanction corrections are atomic, idempotent, audited and preserve sporting records',async t=>{
  const fixture=await createDisciplineUiDatabase('admin'),{db,player,other,origin,id,day}=fixture;
  const configure=config=>template.replace(marker,'$config$'+JSON.stringify(config)+'$config$');
  const counts=async()=>(await db.query('SELECT (SELECT count(*) FROM suspensions) AS cases,(SELECT count(*) FROM discipline_service_matches) AS service,(SELECT count(*) FROM discipline_audit) AS audit')).rows;
  const unchanged=async()=>{
    const result={};
    for(const name of ['cards','attendance','callups','evaluations','sessions'])result[name]=(await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM ${name} t`)).rows[0].rows;
    return result;
  };
  const fails=async(sql,pattern)=>{await assert.rejects(db.exec(sql),pattern);await db.exec('ROLLBACK');};
  try{
    await db.exec('RESET ROLE');
    const legacy=(await db.query("INSERT INTO suspensions(player_id,source,matches_total,status,created_from_session_id,needs_review) VALUES($1,'straight_red',1,'active',$2,true) RETURNING id",[player,origin])).rows[0].id;
    const config={reviewer_user_id:id(1),cases:[
      {player_id:player,case_id:legacy,source:'straight_red',origin_session_id:origin,request_key:null,expected_revision:0,expected_matches_total:1,matches_total:3,applicable_from:await day(-7),notes:'Official decision and two service matches explicitly verified by responsible staff.',
        served_matches:[{session_id:id(41),session_date:await day(-7),notes:'First verified service match.'},{session_id:id(42),session_date:await day(-3),notes:'Second verified service match.'}]},
      {player_id:other,case_id:null,source:'manual',origin_session_id:null,request_key:id(901),matches_total:2,applicable_from:await day(-3),notes:'External prior-season direct red, two matches; first service explicitly verified, second pending.',
        served_matches:[{session_id:id(42),session_date:await day(-3),notes:'First verified match of the separate external sanction.'}]}
    ]};
    const beforeCounts=await counts(),beforeSport=await unchanged();
    await t.test('blank template cannot mutate a record',async()=>{
      await fails(template,/Plantilla sin configurar/);assert.deepEqual(await counts(),beforeCounts);
    });
    await t.test('unapproved actor and stale case revisions abort without modifying either player',async()=>{
      await fails(configure({...config,reviewer_user_id:id(2)}),/Admin autorizado/);
      const stale=structuredClone(config);stale.cases[0].expected_revision=9;
      await fails(configure(stale),/ha cambiado desde la revisión/);assert.deepEqual(await counts(),beforeCounts);
    });
    await t.test('incorrect fixture date and missing verification in the second case roll back the first case too',async()=>{
      const wrong=structuredClone(config);wrong.cases[1].served_matches[0].session_date=await day(-2);
      await fails(configure(wrong),/partidos no coincide/);
      const incomplete=structuredClone(config);incomplete.cases[1].served_matches[0].notes='';
      await fails(configure(incomplete),/verifica que no jugó/);
      assert.deepEqual(await counts(),beforeCounts);
      assert.deepEqual((await db.query('SELECT matches_total,matches_served,needs_review FROM suspensions WHERE id=$1',[legacy])).rows,[{matches_total:1,matches_served:0,needs_review:true}]);
    });
    await t.test('the two independently verified cases retain one pending match each and no old absences are rewritten',async()=>{
      const result=await db.exec(configure(config)),report=result.find(r=>r.rows?.[0]?.reviewed_sanctions_correction).rows[0].reviewed_sanctions_correction;
      assert.equal(report.all_ok,true);
      assert.deepEqual(report.cases.map(c=>[c.player_id,c.matches_total,c.matches_served,c.matches_remaining,c.status]),[
        [player,3,2,1,'partially_served'],[other,2,1,1,'partially_served']]);
      assert.equal(report.cases[0].case_id,legacy);
      const external=(await db.query('SELECT source,origin_card_id,created_from_session_id FROM suspensions WHERE player_id=$1',[other])).rows[0];
      assert.deepEqual(external,{source:'manual',origin_card_id:null,created_from_session_id:null});
      assert.deepEqual(await unchanged(),beforeSport);
      assert.equal((await db.query('SELECT count(*) AS n FROM discipline_audit WHERE actor=$1',[id(1)])).rows[0].n,5);
    });
    await t.test('an exact retry performs no extra writes, sanctions, service matches or audit entries',async()=>{
      const after=await counts();const result=await db.exec(configure(config));
      const report=result.find(r=>r.rows?.[0]?.reviewed_sanctions_correction).rows[0].reviewed_sanctions_correction;
      assert.ok(report.cases.every(c=>c.already_applied));assert.deepEqual(await counts(),after);
      assert.deepEqual(await unchanged(),beforeSport);
    });
  }finally{await fixture.close();}
});
