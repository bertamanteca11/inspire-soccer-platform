// Local visual review with synthetic fixtures. No production credentials or API.
// The browser intercepts every external request; unknown destinations are aborted.
const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const fixture=require('../tests/final.fixture.ts');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'..');const origin='http://127.0.0.1:4182';
const check=process.argv.includes('--check');
const html='<html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Inspire Soccer — DEMO LOCAL</title></head><body><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/final.harness.tsx"></script></body></html>';
async function main(){
  const {createServer}=await import('vite');const {default:react}=await import('@vitejs/plugin-react');
  const server=await createServer({root,configFile:false,cacheDir:path.join(root,'.phase4-test-artifacts','demo-vite-cache'),plugins:[react()],server:{host:'127.0.0.1',port:4182,strictPort:true},
    define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://preview.invalid'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('synthetic-demo-key')},
    optimizeDeps:{include:['xlsx']},logLevel:'error'});
  let browser;
  try{
    await server.listen();
    browser=await chromium.launch({headless:check,channel:process.env.VEO_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
    const context=await browser.newContext({serviceWorkers:'block',viewport:check?{width:390,height:844}:null});
    const data=structuredClone({players:fixture.players,sessions:fixture.sessions,callups:fixture.calls,attendance:fixture.visits,evaluations:fixture.evaluations,injuries:fixture.injuries,session_standouts:fixture.standouts,cards:[],suspensions:[],active_suspensions:[],player_card_totals:[],staff_flags:[],must_win_reviews:[],veo_matches:[],veo_player_match_stats:[],veo_player_links:[],veo_import_batches:[],veo_calculated_stats:[]});
    const samplePlayer=data.players[0],baselines=new Map();
    // Current operational session starts without sporting scores, so the user
    // can review the initial 3s. Earlier synthetic history remains available.
    data.evaluations=data.evaluations.filter(row=>row.session_id!==data.sessions[0].id);
    data.cards=Array.from({length:5},(_,i)=>({id:'historic-card-'+i,session_id:'synthetic-history',player_id:samplePlayer.id,type:'yellow',reason:'Ejemplo ficticio',players:{display_name:samplePlayer.display_name}}));
    data.suspensions=[{id:'sample-sanction',player_id:samplePlayer.id,source:'yellow_accumulation',status:'active',matches_total:1,matches_served:0,reason:'Ejemplo ficticio: acumulación de amarillas',created_at:'2026-10-01T10:00:00Z',players:{display_name:samplePlayer.display_name}}];
    const simpleYellows=player=>data.cards.filter(row=>row.player_id===player&&row.type==='yellow').length;
    let sequence=0;const blocked=[];
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').pop();
      if(url.origin===origin){if(url.pathname==='/demo')return route.fulfill({contentType:'text/html',body:html});return route.continue();}
      if(url.hostname!=='preview.invalid'){blocked.push(url.hostname);return route.abort();}
      const body=req.method()==='GET'||req.method()==='DELETE'?null:req.postDataJSON();
      if(table==='veo_status')return route.fulfill({json:{version:1,ruleVersion:'2026-j5-v1'}});
      const referer=new URL(req.headers().referer||origin);const role=referer.searchParams.get('role')||'admin';
      if(table==='batch4_workflow_access')return route.fulfill({json:role==='admin'||role==='coach'&&body.p_workflow!=='callup'});
      if(table==='batch4_discipline_balances')return route.fulfill({json:data.players.map(player=>({player_id:player.id,display_name:player.display_name,cycle_yellows:Math.max(0,simpleYellows(player.id)-(baselines.get(player.id)||0)),historical_yellows:simpleYellows(player.id)+2*data.cards.filter(row=>row.player_id===player.id&&row.type==='double_yellow').length,historical_reds:data.cards.filter(row=>row.player_id===player.id&&['double_yellow','straight_red'].includes(row.type)).length}))});
      if(table==='batch4_complete_suspension'||table==='batch4_initialize_discipline_cycle'){
        const row=data.suspensions.find(item=>item.id===body.p_suspension);
        if(!row)return route.fulfill({status:404,json:{message:'Sanción ficticia no encontrada'}});
        if(row.status==='active'&&row.source==='yellow_accumulation')baselines.set(row.player_id,simpleYellows(row.player_id));
        Object.assign(row,{status:'served',matches_served:row.matches_total,served_at:new Date().toISOString()});
        return route.fulfill({json:{...row,cycle_initialized:true}});
      }
      if(table==='batch4_workflow_action'){
        if(body.p_workflow==='evaluation'&&body.p_action==='confirm'){
          for(const row of body.p_rows||[])if(row.id===null&&!data.evaluations.some(old=>old.session_id===row.session_id&&old.player_id===row.player_id))data.evaluations.push({...row,id:'demo-'+(++sequence),evaluated:!body.p_records_only});
        }
        return route.fulfill({json:{id:body.p_session,[body.p_workflow+'_confirmed']:body.p_action==='confirm'}});
      }
      if(table==='batch4_save_standouts'){
        data.session_standouts=data.session_standouts.filter(r=>r.session_id!==body.p_session).concat(body.p_rows.map(r=>({...r,id:'demo-'+(++sequence)})));
        return route.fulfill({json:{session_id:body.p_session,saved:true}});
      }
      if(table==='batch4_save_card'){
        data.cards=data.cards.filter(r=>r.session_id!==body.p_session||r.player_id!==body.p_player);
        if(body.p_type!=='none')data.cards.push({id:'demo-'+(++sequence),session_id:body.p_session,player_id:body.p_player,type:body.p_type,reason:body.p_reason});
        if(['straight_red','double_yellow'].includes(body.p_type)&&!data.suspensions.some(row=>row.player_id===body.p_player&&row.created_from_session_id===body.p_session&&row.source===body.p_type))data.suspensions.push({id:'demo-sanction-'+(++sequence),player_id:body.p_player,created_from_session_id:body.p_session,source:body.p_type,matches_total:body.p_matches,matches_served:0,status:'active',reason:body.p_reason,players:{display_name:data.players.find(p=>p.id===body.p_player)?.display_name}});
        if(simpleYellows(body.p_player)-(baselines.get(body.p_player)||0)>=5&&!data.suspensions.some(row=>row.player_id===body.p_player&&row.source==='yellow_accumulation'&&row.status==='active'))data.suspensions.push({id:'demo-sanction-'+(++sequence),player_id:body.p_player,source:'yellow_accumulation',matches_total:1,matches_served:0,status:'active',reason:'Ejemplo ficticio: acumulación de amarillas',players:{display_name:data.players.find(p=>p.id===body.p_player)?.display_name}});
        return route.fulfill({json:{session_id:body.p_session,player_id:body.p_player,saved:true}});
      }
      if(!url.pathname.includes('/rest/v1/')||!Object.hasOwn(data,table)&&table!=='official_evaluations'){blocked.push(url.pathname);return route.abort();}
      const name=table==='official_evaluations'?'evaluations':table;
      const matches=row=>[...url.searchParams].every(([key,value])=>{
        if(!['id','session_id','player_id','created_from_session_id','session_date','status','week_start','month_start'].includes(key))return true;
        if(value.startsWith('eq.'))return String(row[key])===value.slice(3);
        if(value.startsWith('neq.'))return String(row[key])!==value.slice(4);
        if(value.startsWith('gte.'))return row[key]>=value.slice(4);
        if(value.startsWith('lte.'))return row[key]<=value.slice(4);
        if(value.startsWith('lt.'))return row[key]<value.slice(3);
        if(value.startsWith('in.'))return value.slice(4,-1).split(',').includes(String(row[key]));
        return true;
      });
      let result;
      if(req.method()==='GET'){
        if(name==='active_suspensions')data.active_suspensions=data.suspensions.filter(row=>row.status==='active').map(row=>({...row,display_name:row.players.display_name,matches_remaining:row.matches_total-row.matches_served}));
        const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||500);
        result=data[name].filter(matches).slice(offset,offset+limit);
      }else if(req.method()==='DELETE'){
        result=data[name].filter(matches);data[name]=data[name].filter(row=>!matches(row));
      }else if(req.method()==='PATCH'){
        result=[];data[name]=data[name].map(row=>{if(!matches(row))return row;const saved={...row,...body};result.push(saved);return saved;});
      }else{
        result=(Array.isArray(body)?body:[body]).map(row=>({...(name==='evaluations'?{tactical_discipline:3,effort_commitment:3,decision_making:3,mentality_attitude:3,coachability:3}:{}),id:'demo-'+(++sequence),...row}));
        for(const row of result){if(name==='attendance')data[name]=data[name].filter(old=>old.session_id!==row.session_id||old.player_id!==row.player_id);data[name].push(row);}
      }
      return route.fulfill({json:req.headers().accept?.includes('application/vnd.pgrst.object+json')?result[0]||null:result});
    });
    const page=await context.newPage();
    page.setDefaultTimeout(60000);
    const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto(origin+'/demo?interactive=1&mode=home&role=admin',{waitUntil:'domcontentloaded'});
    if(check){
      const {expect}=require('@playwright/test');await expect(page.getByText('DEMO VISUAL · Datos ficticios',{exact:true})).toBeVisible({timeout:60000});
      await page.getByLabel('Vista',{exact:true}).selectOption('callup');
      const complete=page.getByRole('button',{name:'Marcar como cumplida',exact:true});await expect(complete).toBeVisible({timeout:60000});
      page.once('dialog',dialog=>dialog.accept());await complete.click();
      await expect(page.getByText('No hay sanciones activas.',{exact:true})).toBeVisible();
      await page.getByLabel('Vista',{exact:true}).selectOption('evaluation');
      await expect(page.getByLabel('Cualidad que estás evaluando').locator('option')).toHaveCount(4);
      await expect(page.getByRole('button',{name:'3',exact:true})).toHaveClass(/active/);
      await expect(page.getByLabel('Vista',{exact:true}).getByRole('option',{name:'VEO Analytics',exact:true})).toHaveCount(1);
      await page.getByLabel('Vista',{exact:true}).selectOption('summary');
      await expect(page.getByLabel('Periodo del resumen')).toHaveValue('four-weeks');
      await page.getByLabel('Periodo del resumen').selectOption('season');
      await expect(page.getByLabel('Desde',{exact:true})).toHaveValue(/-07-01$/);
      await expect(page.getByLabel('Hasta',{exact:true})).toHaveValue(/-06-30$/);
      if((await page.getByLabel('Vista',{exact:true}).locator('option').allTextContents()).filter(text=>text.includes('VEO')).length!==1)throw Error('Duplicate VEO demo option');
      const request=await context.request.get(origin+'/src/supabase.ts');const clientSource=await request.text();
      if(!clientSource.includes('preview.invalid')||!clientSource.includes('synthetic-demo-key'))throw Error('Demo endpoint override failed');
      if(blocked.length)throw Error('Unexpected blocked demo requests: '+blocked.join(', '));
      if(pageErrors.length)throw Error('Demo page errors: '+pageErrors.join(', '));
      console.log('Demo checked: four qualities, initial 3, one VEO entry, rolling four weeks and season selector; synthetic endpoint, no external requests forwarded.');
    }else{
      console.log('DEMO VISUAL abierta en Edge: '+origin+'/demo?interactive=1');
      console.log('Datos ficticios; guardados simulados. Cierra la ventana o pulsa Ctrl+C para terminar.');
      process.once('SIGINT',()=>void browser.close());
      await new Promise(resolve=>browser.once('disconnected',resolve));
    }
  }finally{await browser?.close();await server.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
