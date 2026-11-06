const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const fixture=require('./final.fixture.ts');
const html='<html lang="es"><body><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/final.harness.tsx"></script></body></html>';

async function setup(page,{mode='home',role='admin',readDenied='',zeroCard=false,failSuspension=false,slowWrite=false,newEvaluation=false,staleEvaluation=false,match=false,longCareer=false,noEligible=false,missingWorkflow=false,activeSanction=false,allEligible=false,highLimit,lowLimit,staleDuringComment=false}={}){
  const state={writes:[],unexpected:[],errors:[],pending:0};
  const data=structuredClone({players:fixture.players,sessions:fixture.sessions,callups:fixture.calls,attendance:fixture.visits,evaluations:newEvaluation?[]:fixture.evaluations,injuries:fixture.injuries,session_standouts:fixture.standouts,cards:[],suspensions:[],active_suspensions:[],player_card_totals:[],staff_flags:[],must_win_reviews:[],veo_matches:[],veo_player_match_stats:[],veo_player_links:[],veo_import_batches:[],veo_calculated_stats:[]});
  if(staleEvaluation)data.evaluations[0].tactical_discipline=1;
  if(longCareer)data.players[0].career_notes='Trayectoria histórica con detalles que deben conservarse en el informe. '.repeat(400);
  if(noEligible)data.callups=data.callups.map(row=>({...row,evaluable:false}));
  if(allEligible){data.callups=data.callups.map(row=>({...row,status:'called_up',evaluable:true}));data.attendance=data.sessions.flatMap(s=>data.players.map(p=>({id:s.id+'-'+p.id,session_id:s.id,player_id:p.id,status:'present'})));}
  if(activeSanction)data.suspensions=[{id:'sanction-1',player_id:data.players[0].id,source:'yellow_accumulation',status:'active',matches_total:1,matches_served:0,reason:'Acumulación de amarillas',players:{display_name:data.players[0].display_name}}];
  state.data=data;
  page.on('pageerror',error=>state.errors.push(error.message));
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin==='http://127.0.0.1:4180'){
      if(url.pathname==='/final-test')return route.fulfill({contentType:'text/html',body:html});
      return route.continue();
    }
    const table=url.pathname.split('/').pop();
    // Every external request is answered here or aborted, never forwarded.
    if(table==='veo_status')return route.fulfill({json:{version:1,ruleVersion:'2026-j5-v1'}});
    if(table==='batch4_workflow_access')return missingWorkflow?route.fulfill({status:404,json:{code:'PGRST202',message:'Could not find the function public.batch4_workflow_access in the schema cache'}}):route.fulfill({json:role==='admin'||role==='coach'&&req.postDataJSON().p_workflow!=='callup'});
    if(table==='batch4_discipline_balances')return route.fulfill({json:[{player_id:data.players[0].id,display_name:data.players[0].display_name,cycle_yellows:activeSanction&&data.suspensions[0].status==='active'?5:0,historical_yellows:5,historical_reds:0}]});
    if(table==='batch4_complete_suspension'){
      const body=req.postDataJSON();state.writes.push({table,body});
      data.suspensions[0]={...data.suspensions[0],status:'served',matches_served:1,served_at:'2026-11-06T10:00:00Z'};
      return route.fulfill({json:data.suspensions[0]});
    }
    if(table==='batch4_save_card'){
      const body=req.postDataJSON();state.writes.push({table,body});
      if(zeroCard||failSuspension)return route.fulfill({status:409,json:{code:'P0001',message:'Atomic disciplinary save failed'}});
      data.cards=data.cards.filter(c=>c.player_id!==body.p_player);
      if(body.p_type!=='none')data.cards.push({id:'card-saved',session_id:body.p_session,player_id:body.p_player,type:body.p_type,reason:body.p_reason});
      return route.fulfill({json:{session_id:body.p_session,player_id:body.p_player,saved:true}});
    }
    if(table==='create_yellow_accumulation_suspensions'){state.writes.push({table});return route.fulfill({json:null});}
    if(table==='batch4_workflow_action'){
      const body=req.postDataJSON();state.writes.push({table,body});
      return route.fulfill({json:{id:body.p_session,[body.p_workflow+'_confirmed']:body.p_action==='confirm'}});
    }
    if(!url.pathname.includes('/rest/v1/')||!Object.hasOwn(data,table)&&table!=='official_evaluations'){
      state.unexpected.push(url.pathname);return route.abort();
    }
    if(req.method()==='GET'){
      if(table===readDenied)return route.fulfill({status:403,json:{message:'Lectura denegada de '+table,code:'42501'}});
      if(table==='active_suspensions')data.active_suspensions=data.suspensions.filter(s=>s.status==='active'&&s.matches_total>s.matches_served).map(s=>({...s,display_name:s.players?.display_name,matches_remaining:s.matches_total-s.matches_served}));
      let rows=[...(data[table==='official_evaluations'?'evaluations':table]||[])];
      for(const key of ['id','session_id','player_id','created_from_session_id']){
        const filter=url.searchParams.get(key);
        if(filter?.startsWith('eq.'))rows=rows.filter(r=>r[key]===filter.slice(3));
      }
      const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||500);
      return route.fulfill({json:rows.slice(offset,offset+limit)});
    }
    const body=req.method()==='DELETE'?null:req.postDataJSON();state.writes.push({table,method:req.method(),body});
    if(slowWrite)await new Promise(resolve=>setTimeout(resolve,250));
    if(table==='cards'&&zeroCard||table==='suspensions'&&failSuspension)return route.fulfill({status:406,json:{code:'PGRST116',message:'No se verificó ninguna fila'}});
    const rowId=url.searchParams.get('id')?.slice(3);let changed;
    if(req.method()==='DELETE'){
      changed=data[table].filter(r=>r.id===rowId);data[table]=data[table].filter(r=>r.id!==rowId);
    }else if(req.method()==='PATCH'){
      if(staleDuringComment&&table==='evaluations'&&Object.hasOwn(body,'comment'))data.evaluations=data.evaluations.map(r=>r.id===rowId?{...r,tactical_discipline:1}:r);
      data[table]=data[table].map(r=>r.id===rowId?(changed={...r,...body}):r);
    }else if(table==='attendance'){
      changed=body.map((r,i)=>({...r,id:'saved-'+i}));data.attendance=changed;
    }else{
      changed={id:'saved-'+state.writes.length,...(table==='evaluations'?{tactical_discipline:3,effort_commitment:3,decision_making:3,mentality_attitude:3,coachability:3}:{}),...body};data[table].push(changed);
    }
    return route.fulfill({json:changed||null});
  });
  await page.goto(`/final-test?mode=${mode}&role=${role}${newEvaluation?'&new':''}${match?'&match':''}${highLimit!==undefined?'&high='+highLimit:''}${lowLimit!==undefined?'&low='+lowLimit:''}`);
  page.__final=state;return state;
}
test.afterEach(async({page})=>{if(page.__final){expect(page.__final.unexpected).toEqual([]);expect(page.__final.errors).toEqual([]);}});

const modes=['home','players','sessions','callup','attendance','evaluation','injuries','summary','standouts','history','intelligence','reports','veo','veo-import','login'];
for(const width of [320,360,390,430])for(const mode of modes)test(`${mode} contains mobile content at ${width}px without writes`,async({page},info)=>{
  await page.setViewportSize({width,height:844});const state=await setup(page,{mode});
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  if(mode==='players')await expect(page.locator('.player-list-row')).toHaveCount(4);
  if(mode==='evaluation')await expect(page.locator('.rating-player-row')).toHaveCount(1);
  if(mode==='evaluation'){
    const colors=await page.locator('.card .muted').first().evaluate(node=>({text:getComputedStyle(node).color,opacity:getComputedStyle(node).opacity,background:getComputedStyle(node.closest('.card')).backgroundColor}));
    const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{const x=n/255;return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4}).reduce((sum,n,i)=>sum+n*[0.2126,0.7152,0.0722][i],0);
    const a=luminance(colors.text),b=luminance(colors.background);
    expect((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toBeGreaterThanOrEqual(4.5);expect(Number(colors.opacity)).toBe(1);
  }
  if(mode==='attendance')await expect(page.getByRole('button',{name:'Presente',exact:true})).toHaveCount(5);
  if(mode==='reports')await expect(page.getByRole('button',{name:'Generar informe',exact:true})).toBeEnabled();
  if(mode==='callup')await expect(page.getByRole('button',{name:'Confirmar convocatoria',exact:true})).toBeEnabled();
  if(mode==='history')await expect(page.getByLabel('Sesión del historial').locator('option')).toHaveCount(3);
  if(['veo','veo-import'].includes(mode))await expect(page.getByRole('status')).toContainText('Base VEO conectada');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // Detect clipped controls inside cards too; overflow-x:hidden alone can hide defects.
  const clipped=await page.locator('input:not([type=checkbox]),select,textarea,.rating').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width&&n.closest('.card')&&n.getBoundingClientRect().right>n.closest('.card').getBoundingClientRect().right+1).map(n=>n.getAttribute('aria-label')||n.className||n.tagName));
  expect(clipped).toEqual([]);expect(state.writes).toEqual([]);
  if(width===320&&['evaluation','players','reports','injuries','standouts'].includes(mode))await page.screenshot({path:info.outputPath(mode+'-320.png'),fullPage:true});
});

test('player profile wraps through the visible roster and preserves inactive history and player comments',async({page})=>{
  await setup(page,{mode:'players'});await page.locator('.player-list-row').first().click();
  await expect(page.getByRole('heading',{name:'Alex eligible',exact:true})).toBeVisible();
  await expect(page.getByText('Comentario histórico de Alex eligible',{exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'Jugador siguiente →',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Bruno no convocado',exact:true})).toBeVisible();
  await expect(page.getByText('Comentario histórico de Bruno no convocado',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Comentario histórico de Alex eligible',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'← Jugador anterior',exact:true}).click();await page.getByRole('button',{name:'← Jugador anterior',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Diego invitado',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'← Volver a jugadores',exact:true}).click();
  await page.getByLabel('Mostrar jugadores de baja').check();await expect(page.locator('.player-list-row')).toHaveCount(5);
  expect((await page.locator('.player-inactive-toggle').boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.locator('.player-list-row').last().click();await page.getByRole('button',{name:'Jugador siguiente →',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Alex eligible',exact:true})).toBeVisible();
});

test('player dialog traps focus, closes with Escape and returns focus without saving',async({page})=>{
  const state=await setup(page,{mode:'players'});const trigger=page.getByRole('button',{name:'Añadir jugador',exact:true});await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Añadir jugador'});await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Cerrar',exact:true})).toBeFocused();
  for(let i=0;i<20;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(n=>n.contains(document.activeElement))).toBe(true);}
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();expect(state.writes).toEqual([]);
});

test('team and player PDF download directly and CSV contains persisted scoped totals',async({page})=>{
  await setup(page,{mode:'reports',longCareer:true});await page.getByLabel('Desde',{exact:true}).fill('2026-10-19');await page.getByLabel('Hasta',{exact:true}).fill('2026-10-25');
  await page.getByRole('button',{name:'Generar informe',exact:true}).click();await expect(page.getByText('Sesiones: 2 · Evaluaciones: 2 · Media: 4.00',{exact:true})).toBeVisible();
  let download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();
  let file=await download;expect(file.suggestedFilename()).toContain('equipo');expect(fs.readFileSync(await file.path()).subarray(0,4).toString()).toBe('%PDF');
  download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar CSV',exact:true}).click();file=await download;
  const csv=fs.readFileSync(await file.path(),'utf8');expect(csv).toContain('Alex eligible');expect(csv).toContain('"2","4.00"');
  await page.getByLabel('Ámbito').selectOption(fixture.players[0].id);await expect(page.getByRole('button',{name:'Descargar PDF',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Generar informe',exact:true}).click();download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();file=await download;
  expect(file.suggestedFilename()).toContain('Alex_eligible');expect(fs.readFileSync(await file.path()).subarray(0,4).toString()).toBe('%PDF');
  expect((fs.readFileSync(await file.path(),'latin1').match(/\/Type \/Page\b/g)||[]).length).toBeGreaterThan(3);
});

test('rapid score clicks cannot insert duplicate evaluations or confirm an in-flight write',async({page})=>{
  const state=await setup(page,{mode:'evaluation',newEvaluation:true,slowWrite:true});
  const four=page.getByRole('button',{name:'4',exact:true});await expect(four).toBeEnabled();
  await four.evaluate(button=>{button.click();button.click();});
  await expect(page.getByRole('button',{name:'Confirmar evaluación',exact:true})).toBeDisabled();
  await expect(page.getByText('Cambios guardados correctamente',{exact:true})).toBeVisible();
  expect(state.writes.filter(w=>w.table==='evaluations'&&w.method==='POST')).toHaveLength(1);
  expect(state.writes.filter(w=>w.table==='evaluations'&&w.method==='PATCH')).toHaveLength(1);
});

test('new operational evaluation starts at 3 without writes and confirms untouched defaults explicitly',async({page})=>{
  const state=await setup(page,{mode:'evaluation',newEvaluation:true});
  await expect(page.getByRole('button',{name:'3',exact:true})).toHaveClass(/active/);
  await page.getByLabel('Cualidad que estás evaluando').selectOption('3');
  await expect(page.getByRole('button',{name:'3',exact:true})).toHaveClass(/active/);expect(state.writes).toEqual([]);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Confirmar evaluación',exact:true}).click();
  await expect(page.getByRole('button',{name:'Evaluación confirmada',exact:true})).toBeVisible();
  expect(state.writes).toHaveLength(1);
  const row=state.writes[0].body.p_rows[0];expect(row.id).toBeNull();expect(row.evaluated).toBe(false);
  for(const field of ['tactical_discipline','effort_commitment','decision_making','mentality_attitude']){expect(row[field]).toBe(3);expect(row.na_fields[field]).toBe(false);}
});

test('explicit N/A overrides the initial 3 and is preserved while switching qualities',async({page})=>{
  const state=await setup(page,{mode:'evaluation',newEvaluation:true});
  await page.getByRole('button',{name:'N/A',exact:true}).click();
  await expect(page.getByText('Cambios guardados correctamente',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'N/A',exact:true})).toHaveClass(/active/);
  await page.getByLabel('Cualidad que estás evaluando').selectOption('1');
  await expect(page.getByRole('button',{name:'3',exact:true})).toHaveClass(/active/);
  await page.getByLabel('Cualidad que estás evaluando').selectOption('0');
  await expect(page.getByRole('button',{name:'N/A',exact:true})).toHaveClass(/active/);
  expect(state.data.evaluations[0].na_fields.tactical_discipline).toBe(true);expect(state.data.evaluations[0].na_fields.effort_commitment).toBe(false);
});

test('rating quotas disable a new high or low while allowing edits within an occupied band',async({page})=>{
  await setup(page,{mode:'evaluation',newEvaluation:true,allEligible:true,highLimit:1,lowLimit:1});
  const rows=page.locator('.rating-player-row');await expect(rows).toHaveCount(5);
  await rows.nth(0).getByRole('button',{name:'5',exact:true}).click();
  await expect(rows.nth(1).getByRole('button',{name:'4',exact:true})).toBeDisabled();
  await expect(rows.nth(1).getByRole('button',{name:'5',exact:true})).toBeDisabled();
  await expect(rows.nth(0).getByRole('button',{name:'4',exact:true})).toBeEnabled();
  await rows.nth(1).getByRole('button',{name:'1',exact:true}).click();
  await expect(rows.nth(2).getByRole('button',{name:'1',exact:true})).toBeDisabled();
  await expect(rows.nth(2).getByRole('button',{name:'2',exact:true})).toBeDisabled();
  await expect(rows.nth(1).getByRole('button',{name:'2',exact:true})).toBeEnabled();
  await rows.nth(0).getByRole('button',{name:'3',exact:true}).click();
  await expect(rows.nth(2).getByRole('button',{name:'5',exact:true})).toBeEnabled();
});

test('confirming a new default evaluation saves its pending comment without losing the four initial scores',async({page})=>{
  const state=await setup(page,{mode:'evaluation',newEvaluation:true});
  await page.getByLabel('Orden de evaluación').selectOption('player');
  await page.getByLabel('Comentario de Alex eligible',{exact:true}).fill('Comentario revisado');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Confirmar evaluación',exact:true}).click();
  await expect(page.getByRole('button',{name:'Evaluación confirmada',exact:true})).toBeVisible();
  const saved=state.writes.find(row=>row.table==='batch4_workflow_action').body.p_rows[0];
  expect(saved.comment).toBe('Comentario revisado');expect(saved.id).toBeTruthy();
  for(const field of ['tactical_discipline','effort_commitment','decision_making','mentality_attitude'])expect(saved[field]).toBe(3);
});

test('a score changed during comment saving still blocks confirmation',async({page})=>{
  const state=await setup(page,{mode:'evaluation',staleDuringComment:true});
  await page.getByLabel('Orden de evaluación').selectOption('player');
  await page.getByLabel('Comentario de Alex eligible',{exact:true}).fill('Comentario revisado');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Confirmar evaluación',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'cambiaron durante la confirmación'})).toBeVisible();
  expect(state.writes.filter(row=>row.table==='batch4_workflow_action')).toHaveLength(0);
});

test('changed evaluations fail confirmation before any disciplinary or workflow request',async({page})=>{
  const state=await setup(page,{mode:'evaluation',staleEvaluation:true});await expect(page.locator('.rating-player-row')).toHaveCount(1);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Confirmar evaluación',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'han cambiado'})).toBeVisible();expect(state.writes).toEqual([]);
});

test('records-only remains usable without sporting participants and never fabricates numeric evaluations',async({page})=>{
  const state=await setup(page,{mode:'evaluation',newEvaluation:true,noEligible:true});
  await expect(page.getByRole('heading',{name:'No hay jugadores para evaluar',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Solo registros (sin puntuación)',exact:true}).click();
  const comment=page.getByPlaceholder('Motivo de no convocatoria, no participación, observaciones...');
  await expect(comment).toBeEnabled();expect(state.writes).toEqual([]);
  await comment.fill('Comentario sin evaluación deportiva');await page.getByRole('button',{name:'Guardar registros',exact:true}).click();
  await expect(page.getByText('Registros guardados. No se ha confirmado ninguna evaluación deportiva.',{exact:true})).toBeVisible();
  expect(state.data.evaluations).toHaveLength(1);expect(state.data.evaluations[0].not_applicable).toBe(true);expect(Object.values(state.data.evaluations[0].na_fields).every(Boolean)).toBe(true);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Confirmar solo registros',exact:true}).click();
  await expect(page.getByRole('button',{name:'Registros confirmados · sin notas',exact:true})).toBeVisible();
  expect(state.writes.filter(w=>w.table==='batch4_workflow_action')).toHaveLength(1);
  expect(state.writes.find(w=>w.table==='batch4_workflow_action').body.p_records_only).toBe(true);
});

test('unreadable cards disable confirmation until an authoritative read succeeds',async({page})=>{
  const state=await setup(page,{mode:'evaluation',readDenied:'cards'});await expect(page.getByRole('button',{name:'Confirmar evaluación',exact:true})).toBeDisabled();
  await expect(page.getByRole('alert').first()).toContainText('tarjetas');expect(state.writes).toEqual([]);
});

for(const failure of ['zero-card','suspension'])test(`${failure} never reports successful disciplinary save or confirms the evaluation`,async({page})=>{
  const state=await setup(page,{mode:'evaluation',match:true,zeroCard:failure==='zero-card',failSuspension:failure==='suspension'});
  await page.getByLabel('Orden de evaluación').selectOption('player');await page.getByLabel('Tarjeta del jugador').selectOption(failure==='zero-card'?'yellow':'straight_red');
  if(failure==='suspension')await page.getByPlaceholder('Motivo de la tarjeta...').fill('Revisión de prueba');
  await page.getByRole('button',{name:'Siguiente jugador →',exact:true}).click();
  await expect(page.getByRole('alert').first()).toContainText('No se ha podido comprobar');
  expect(state.data.cards).toHaveLength(0);expect(state.data.suspensions).toHaveLength(0);
  expect(state.writes.filter(w=>w.table==='batch4_workflow_action')).toHaveLength(0);
  await expect(page.getByText(/Tarjeta guardada para/)).toHaveCount(0);
});

test('missing workflow displays an actionable Spanish message and never enables changes',async({page})=>{
  const state=await setup(page,{mode:'callup',missingWorkflow:true});
  await expect(page.getByRole('alert').filter({hasText:'actualización de la base de datos está pendiente'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Confirmar convocatoria',exact:true})).toBeDisabled();
  await expect(page.getByText(/schema cache|Could not find the function/)).toHaveCount(0);expect(state.writes).toEqual([]);
});

test('Admin can mark a sanction served; new cycle is zero and historical cards remain',async({page})=>{
  const state=await setup(page,{mode:'callup',activeSanction:true,match:true});
  await expect(page.getByRole('alert')).toContainText('jugadores convocados con sanción activa');
  await expect(page.locator('.player-suspension-warning')).toHaveCount(1);
  const finish=page.getByRole('button',{name:'Marcar como cumplida',exact:true});await expect(finish).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());await finish.click();
  await expect(page.getByText('No hay sanciones activas.',{exact:true})).toBeVisible();
  await expect(page.getByText('Sanción marcada como cumplida.',{exact:true})).toBeVisible();
  await expect(page.locator('.player-suspension-warning')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByText('Contadores e historial',{exact:true}).click();
  await expect(page.getByText(/0 amarillas simples en la cuenta actual/)).toContainText('5 amarillas históricas');
  expect(state.writes.filter(w=>w.table==='batch4_complete_suspension')).toHaveLength(1);
});

test('a sanctioned match player is flagged in their row; the called-up alert follows local selection without writing',async({page})=>{
  const state=await setup(page,{mode:'callup',activeSanction:true,match:true});
  const row=page.locator('.card').filter({has:page.locator('.player-suspension-warning')});
  await expect(row).toContainText('Alex eligible');
  await expect(page.getByRole('alert')).toContainText('jugadores convocados con sanción activa');
  await row.getByRole('button',{name:'Convocado',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(row.locator('.player-suspension-warning')).toBeVisible();
  await row.getByRole('button',{name:'No convocado',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('jugadores convocados con sanción activa');
  expect(state.writes).toEqual([]);
});

test('confirming a match refreshes sanctions and warns about a newly added sanction; cancelling preserves the callup',async({page})=>{
  const state=await setup(page,{mode:'callup',match:true});
  await expect(page.getByRole('button',{name:'Confirmar convocatoria',exact:true})).toBeEnabled();
  state.data.suspensions.push({id:'new-sanction',player_id:fixture.players[0].id,status:'active',matches_total:2,matches_served:0,players:{display_name:fixture.players[0].display_name}});
  let message='';page.once('dialog',async dialog=>{message=dialog.message();await dialog.dismiss();});
  await page.getByRole('button',{name:'Confirmar convocatoria',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirmar convocatoria',exact:true})).toBeEnabled();
  expect(message).toContain('Alex eligible');expect(message).toContain('sanción activa');
  await expect(page.getByRole('alert')).toContainText('jugadores convocados con sanción activa');
  expect(state.writes).toEqual([]);
});

test('an unreadable sanctions source blocks callup confirmation without a write',async({page})=>{
  const state=await setup(page,{mode:'callup',match:true,readDenied:'active_suspensions'});
  await expect(page.getByRole('alert')).toContainText('Lectura denegada');
  await expect(page.getByRole('button',{name:'Confirmar convocatoria',exact:true})).toBeDisabled();
  expect(state.writes).toEqual([]);
});

test('Coach sees the match sanction alert but cannot mark a sanction served',async({page})=>{
  const state=await setup(page,{mode:'callup',role:'coach',match:true,activeSanction:true});
  await expect(page.getByRole('alert')).toContainText('jugadores convocados con sanción activa');
  await expect(page.locator('.player-suspension-warning')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Marcar como cumplida',exact:true})).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

for(const role of ['coach','viewer'])test(`${role} cannot edit callups or view private intelligence`,async({page})=>{
  const state=await setup(page,{mode:'callup',role});await expect(page.getByRole('button',{name:'Confirmar convocatoria',exact:true})).toBeDisabled();
  await expect(page.getByRole('heading',{name:'Convocatoria confirmada',exact:true})).toHaveCount(0);expect(state.writes).toEqual([]);
  await page.goto('/final-test?mode=intelligence&role='+role);await expect(page.getByText('Solo administradores',{exact:true})).toBeVisible();
  await expect(page.getByText('Notas privadas del cuerpo técnico',{exact:true})).toHaveCount(0);
});
