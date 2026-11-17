const fs=require('node:fs');
const {createReleaseDatabase}=require('./releaseDatabase.cjs');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
exports.createDisciplineUiDatabase=async role=>{
  const db=await createReleaseDatabase(),admin=id(1),coach=id(2),player=id(20),other=id(21),origin=id(40);
  const auth=()=>db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.sub','${role==='admin'?admin:coach}',false);SET ROLE authenticated;`);
  try{
    await db.exec(fs.readFileSync('tests/fixtures/live-schema-2026-11-06.sql','utf8'));
    for(const [who,r]of [[admin,'admin'],[coach,'coach']]){
      await db.query('INSERT INTO auth.users VALUES($1)',[who]);await db.query('INSERT INTO profiles(id,email,role) VALUES($1,$2,$3)',[who,r+'@example.test',r]);
    }
    for(const [pid,name,shirt]of [[player,'Alex',9],[other,'Bruno',10]])await db.query('INSERT INTO players(id,name,display_name,shirt_number) VALUES($1,$2,$2,$3)',[pid,name,shirt]);
    for(const [sid,name,days,type]of [[origin,'Partido de origen',-10,'league_match'],[id(41),'Liga posterior 1',-7,'league_match'],[id(42),'Liga posterior 2',-3,'league_match'],[id(43),'Liga anterior',-20,'league_match'],[id(44),'Entrenamiento posterior',-5,'training']])
      await db.query("INSERT INTO sessions(id,name,session_date,type,status,callup_confirmed,attendance_confirmed) VALUES($1,$2,(statement_timestamp() AT TIME ZONE 'Europe/Copenhagen')::date+$3::integer,$4,'completed',true,true)",[sid,name,days,type]);
    for(const pid of [player,other]){
      await db.query("INSERT INTO callups(session_id,player_id,status,evaluable) VALUES($1,$2,'called_up',true)",[origin,pid]);
      await db.query("INSERT INTO attendance(session_id,player_id,status) VALUES($1,$2,'present')",[origin,pid]);
    }
    for(const file of ['supabase/batch4/REVIEW_INSTALL.sql','supabase/staff/INSTALL_PRIVATE_STAFF.sql','supabase/staff/RESTORE_COACH_ACCESS.sql','supabase/discipline/001_cases_and_service.sql'])await db.exec(fs.readFileSync(file,'utf8'));
    await auth();
    const day=async offset=>(await db.query("SELECT ((statement_timestamp() AT TIME ZONE 'Europe/Copenhagen')::date+$1::integer)::text AS d",[offset])).rows[0].d;
    async function handle(body){
      if(body.kind==='bootstrap')return {data:{session:(await db.query('SELECT * FROM sessions WHERE id=$1',[origin])).rows[0],players:(await db.query('SELECT * FROM players ORDER BY shirt_number')).rows,
        attendance:(await db.query('SELECT * FROM attendance WHERE session_id=$1',[origin])).rows,evaluations:(await db.query('SELECT * FROM evaluations WHERE session_id=$1',[origin])).rows,totals:(await db.query('SELECT * FROM player_card_totals')).rows},error:null};
      if(body.kind==='rpc'){
        const args=body.args||{},signatures={
          discipline_workspace:['p_player'],discipline_action:['p_action','p_payload','p_expected_revision'],
          discipline_save_card:['p_session','p_player','p_type','p_reason','p_matches','p_expected'],batch4_workflow_access:['p_session','p_workflow'],
          batch4_workflow_action:['p_session','p_workflow','p_action','p_rows','p_records_only','p_expected_rows'],batch4_discipline_balances:[],
        };
        if(!Object.hasOwn(signatures,body.name))return {data:null,error:{code:'PGRST202',message:'RPC unavailable in isolated fixture'}};
        const keys=signatures[body.name],values=keys.map(k=>args[k]??null),jsonFields=new Set(['p_payload','p_expected','p_rows','p_expected_rows']);
        const placeholders=keys.map((k,i)=>'$'+(i+1)+(jsonFields.has(k)?'::jsonb':''));
        const result=await db.query(`SELECT public.${body.name}(${placeholders.join(',')}) AS data`,values.map((v,i)=>jsonFields.has(keys[i])&&v!==null?JSON.stringify(v):v));
        return {data:result.rows[0].data,error:null};
      }
      if(body.kind==='read'){
        const allowed=new Set(['players','sessions','cards','suspensions','attendance','callups','evaluations','official_evaluations','player_card_totals','active_suspensions','session_standouts']);
        if(!allowed.has(body.table))return {data:[],error:null};
        const identifier=value=>{if(!/^[a-z_]+$/.test(value))throw Error('Unexpected identifier');return '"'+value+'"';};
        const values=[],where=[];
        for(const f of body.filters||[]){
          const key='t.'+identifier(f.key),operator={eq:'=',neq:'<>',gte:'>=',gt:'>',lte:'<=',lt:'<'}[f.op];values.push(f.value);
          where.push(f.op==='in'?`${key}::text=ANY($${values.length}::text[])`:`${key}${operator}$${values.length}`);
        }
        let select='t.*',joins='';
        if(body.select?.includes('players(')){select+=',to_jsonb(p) AS players';joins+=' LEFT JOIN players p ON p.id=t.player_id';}
        if(body.select?.includes('sessions(')){select+=',to_jsonb(s) AS sessions';joins+=' LEFT JOIN sessions s ON s.id=t.session_id';}
        const order=(body.orders||[]).map(o=>'t.'+identifier(o.key)+(o.ascending?' ASC':' DESC')).join(',');
        const result=await db.query(`SELECT ${select} FROM ${identifier(body.table)} t${joins}${where.length?' WHERE '+where.join(' AND '):''}${order?' ORDER BY '+order:''} OFFSET ${Number(body.offset)||0} LIMIT ${Number(body.limit)||500}`,values);
        return {data:body.one?result.rows[0]||null:result.rows,error:null};
      }
      throw Error('Unexpected browser request');
    }
    return {db,handle,player,other,origin,id,day,auth,close:()=>db.close()};
  }catch(error){await db.close();throw error;}
};
