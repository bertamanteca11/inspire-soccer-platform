const {test,expect}=require('@playwright/test');
const fs=require('node:fs');const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const fixture=require('./phase4.fixture.ts');

async function setup(page,{failTable=null,failRefresh=false,archiveResult='ok',extraSeasons=false}={}){
  await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'));
  const writes=[],unexpected=[],errors=[];let rows=structuredClone(fixture.attendance);
  let sessionRows=structuredClone(fixture.sessions).map(s=>({...s,high_rating_limit:4,low_rating_limit:2,responsible:'Fixture coach',home_away:'home',start_time:'19:00'}));
  if(extraSeasons){
    const extra=['2026-06-30','2026-07-01','2027-07-01'].map((date,i)=>({id:'season-boundary-'+i,name:'Season boundary '+i,session_date:date,type:'training',status:'completed'}));
    sessionRows.push(...extra);rows.push(...extra.map(s=>({id:'attendance-'+s.id,session_id:s.id,player_id:fixture.marcos,status:'unjustified_absence'})));
  }
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const request=route.request();const url=new URL(request.url());
    if(['localhost','127.0.0.1'].includes(url.hostname)){
      if(url.pathname==='/phase4-test')return route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/@vite/client"></script><script type="module" src="/tests/phase4.browser-harness.tsx"></script></body></html>'});
      return route.continue();
    }
    const table=url.pathname.split('/').pop();
    if(table==='batch4_workflow_access')return route.fulfill({json:true});
    if(table==='batch4_workflow_action'){
      const body=request.postDataJSON();writes.push({table,body});
      sessionRows=sessionRows.map(s=>s.id===body.p_session?{...s,[body.p_workflow+'_confirmed']:body.p_action==='confirm'}:s);
      return route.fulfill({json:{id:body.p_session,[body.p_workflow+'_confirmed']:body.p_action==='confirm'}});
    }
    if(!url.pathname.includes('/rest/v1/')){unexpected.push(request.method()+' '+url.pathname);return route.abort();}
    if(request.method()!=='GET'){
      writes.push({table,body:request.postDataJSON()});
      if(table==='attendance' && request.method()==='POST'){
        for(const incoming of request.postDataJSON())rows=[...rows.filter(a=>a.player_id!==incoming.player_id||a.session_id!==incoming.session_id),{...incoming,id:'explicit-save'}];
        return route.fulfill({status:201,json:[]});
      }
      if(table==='sessions' && request.method()==='PATCH'){
        if(archiveResult==='denied')return route.fulfill({status:403,json:{code:'42501',message:'permission denied'}});
        if(archiveResult==='zero')return route.fulfill({json:[]});
        if(archiveResult==='invalid')return route.fulfill({status:400,json:{code:'22P02',message:'invalid input value for enum'}});
        const id=url.searchParams.get('id')?.slice(3),status=url.searchParams.get('status')?.slice(3);
        const updated=sessionRows.filter(s=>s.id===id&&s.status===status).map(s=>({...s,...request.postDataJSON()}));
        sessionRows=sessionRows.map(s=>updated.find(row=>row.id===s.id)||s);
        return route.fulfill({json:updated});
      }
      unexpected.push('unexpected write '+table);return route.abort();
    }
    if(table===failTable || failRefresh && table==='attendance' && writes.length)return route.fulfill({status:403,json:{code:'42501',message:'Read denied'}});
    const tables={sessions:sessionRows,attendance:rows,players:fixture.players,cards:[],official_evaluations:[],evaluations:[],callups:[{player_id:fixture.marcos,status:'called_up'}]};
    if(!Object.hasOwn(tables,table)){unexpected.push(table);return route.abort();}
    let records=[...tables[table]];
    for(const key of ['session_id','player_id']){const filter=url.searchParams.get(key);if(filter?.startsWith('eq.'))records=records.filter(row=>row[key]===filter.slice(3));}
    const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||500);
    return route.fulfill({json:records.slice(offset,offset+limit)});
  });
  return {writes,unexpected,errors,get sessions(){return sessionRows},get attendance(){return rows}};
}
const absenceCount=page=>page.locator('.card').filter({has:page.getByText('Asistencia del ámbito',{exact:true})}).locator('section.profile-section p').filter({hasText:'Ausencias injustificadas (incluye lesión):'});

test('Susan review shortcut selects exactly 18/21/23 while preserving the actual Marcos discrepancy',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test');
  await page.getByLabel('Jugador del resumen').selectOption(fixture.marcos);
  await page.getByRole('button',{name:'Revisión de Susan: 18, 21 y 23 de octubre',exact:true}).click();
  await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(3);
  await expect(page.getByText('3 sesiones · 2 registros de asistencia · 0 tarjetas en este ámbito.',{exact:true})).toBeVisible();
  await expect(absenceCount(page)).toHaveText(/: 0$/);
  await expect(page.getByText('Sin registro — no suma presencia ni ausencia',{exact:true})).toBeVisible();
  expect(state.writes).toEqual([]);
});

test('selected-period totals show verified Marcos records and retain a separate complete history',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test');
  await expect(page.getByRole('heading',{name:'Sesiones y registros incluidos'})).toBeVisible();
  await expect(absenceCount(page)).toHaveText(/: 2$/);
  await page.getByLabel('Jugador del resumen').selectOption(fixture.marcos);
  await page.getByLabel('Desde',{exact:true}).fill('2026-10-18');
  await page.getByLabel('Hasta',{exact:true}).fill('2026-10-23');
  for(const id of fixture.intendedIds)await page.getByRole('checkbox',{name:new RegExp(id)}).check();
  await expect(page.getByText('3 sesiones · 2 registros de asistencia · 0 tarjetas en este ámbito.')).toBeVisible();
  await expect(absenceCount(page)).toHaveText(/: 0$/);
  await expect(page.getByText('Sin registro — no suma presencia ni ausencia',{exact:true})).toBeVisible();
  await expect(page.getByText('1 sesiones sin registro para este jugador.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Historial completo',exact:true}).click();
  await expect(absenceCount(page)).toHaveText(/: 4$/);
  await expect(page.getByText('No es el total operativo oficial.',{exact:false})).toBeVisible();
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('Summary opens the last 28 days, offers season totals, and resets a custom filter when reopened',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test');
  await expect(page.getByLabel('Periodo del resumen')).toHaveValue('four-weeks');
  await expect(page.getByLabel('Desde',{exact:true})).toHaveValue('2026-10-10');
  await expect(page.getByLabel('Hasta',{exact:true})).toHaveValue('2026-11-06');
  await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(5);
  await expect(page.getByText('5 sesiones · 4 registros de asistencia · 0 tarjetas en este ámbito.',{exact:true})).toBeVisible();
  await expect(absenceCount(page)).toHaveText(/: 2$/);
  await page.getByLabel('Periodo del resumen').selectOption('season');
  await expect(page.getByLabel('Desde',{exact:true})).toHaveValue('2026-07-01');
  await expect(page.getByLabel('Hasta',{exact:true})).toHaveValue('2027-06-30');
  await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(7);
  await expect(absenceCount(page)).toHaveText(/: 4$/);
  await page.getByRole('checkbox',{name:new RegExp(fixture.intendedIds[2])}).uncheck();
  await expect(page.getByLabel('Periodo del resumen')).toHaveValue('custom');
  await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(6);
  await page.getByRole('button',{name:'Actualizar datos del resumen',exact:true}).click();
  await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(6);
  await page.reload();await expect(page.getByLabel('Periodo del resumen')).toHaveValue('four-weeks');
  await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(5);
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('whole season excludes adjacent seasons and allows selecting an earlier July-June season',async({page})=>{
  const state=await setup(page,{extraSeasons:true});await page.goto('/phase4-test');
  await page.getByLabel('Periodo del resumen').selectOption('season');
  await expect(page.getByLabel('Temporada del resumen')).toHaveValue('2026');
  await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(8);
  await expect(absenceCount(page)).toHaveText(/: 5$/);
  await page.getByLabel('Temporada del resumen').selectOption('2025');
  await expect(page.getByLabel('Desde',{exact:true})).toHaveValue('2025-07-01');
  await expect(page.getByLabel('Hasta',{exact:true})).toHaveValue('2026-06-30');
  await expect(page.getByRole('checkbox',{checked:true})).toHaveCount(1);
  await expect(page.getByText('1 sesiones · 1 registros de asistencia · 0 tarjetas en este ámbito.',{exact:true})).toBeVisible();
  await expect(absenceCount(page)).toHaveText(/: 1$/);
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test('planned, archived and marked-test sessions cannot enter the operational selection',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test');
  for(const id of ['planned','archived','test'])await expect(page.getByRole('checkbox',{name:new RegExp(' · '+id+'$')})).toBeDisabled();
  await page.getByRole('checkbox',{name:new RegExp(fixture.intendedIds[2])}).check();
  await page.getByLabel('Desde',{exact:true}).fill('2026-10-24');
  await page.getByLabel('Hasta',{exact:true}).fill('2026-10-18');
  await expect(page.getByRole('alert')).toContainText('fecha inicial');
  await expect(absenceCount(page)).toHaveText(/: 0$/);
  expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
test('an unreadable source fails closed instead of displaying partial totals',async({page})=>{
  const state=await setup(page,{failTable:'cards'});await page.goto('/phase4-test');
  await expect(page.getByRole('alert')).toContainText('Read denied');
  await expect(page.getByText('Asistencia del ámbito',{exact:true})).toHaveCount(0);
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test('missing attendance cannot save or confirm as presence without an explicit choice',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test?mode=editor');
  await expect(page.getByText('Sin registrar',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Presente',exact:true})).toHaveAttribute('aria-pressed','false');
  await expect(page.getByRole('button',{name:'Guardar asistencia',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Guardar asistencia',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Selecciona la situación');expect(state.writes).toEqual([]);
  await page.getByRole('button',{name:'Confirmar asistencia',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Guarda y verifica');expect(state.writes).toEqual([]);
  await page.getByRole('button',{name:'Presente',exact:true}).click();
  await page.getByRole('button',{name:'Guardar asistencia',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('guardada correctamente');
  expect(state.writes).toHaveLength(1);expect(state.writes[0].table).toBe('attendance');
  expect(state.writes[0].body[0]).toMatchObject({player_id:fixture.marcos,session_id:fixture.intendedIds[0],status:'present'});
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test('editing an existing justified absence preserves its status and transfer note',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test?mode=editor&session='+fixture.intendedIds[1]);
  await expect(page.getByRole('button',{name:'Ausencia justificada',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByPlaceholder('Explicación recomendada...')).toHaveValue('Transferencia desde Guineueta');
  await expect(page.getByRole('button',{name:'Guardar asistencia',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Guardar asistencia',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('guardada correctamente');
  expect(state.writes[0].body[0]).toMatchObject({status:'justified_absence',notes:'Transferencia desde Guineueta'});
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('Admin opens the saved attendance from Summary, reopens it and changes the classification without losing its note',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test');
  const name=fixture.sessions.find(s=>s.id===fixture.intendedIds[1]).name;
  await page.getByRole('button',{name:'Revisar asistencia de '+name,exact:true}).click();
  await expect(page.getByRole('button',{name:'Ausencia justificada',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Ausencia injustificada',exact:true})).toBeDisabled();
  expect(state.writes).toEqual([]);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Reabrir asistencia',exact:true}).click();
  await page.getByRole('button',{name:'Ausencia injustificada',exact:true}).click();
  await expect(page.getByPlaceholder('Explicación recomendada...')).toHaveValue('Transferencia desde Guineueta');
  await page.getByRole('button',{name:'Guardar asistencia',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('guardada correctamente');
  expect(state.attendance.find(a=>a.session_id===fixture.intendedIds[1])).toMatchObject({status:'unjustified_absence',notes:'Transferencia desde Guineueta'});
  expect(state.attendance.filter(a=>a.session_id!==fixture.intendedIds[1])).toEqual(fixture.attendance.filter(a=>a.session_id!==fixture.intendedIds[1]));
  expect(state.writes[0]).toMatchObject({table:'batch4_workflow_action',body:{p_session:fixture.intendedIds[1],p_workflow:'attendance',p_action:'reopen'}});
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('Coach Summary does not expose Admin attendance correction actions',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test?role=coach');
  await expect(page.getByLabel('Periodo del resumen')).toBeVisible();
  await expect(page.getByRole('button',{name:/^Revisar asistencia de /})).toHaveCount(0);
  expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

test('an unavailable roster blocks attendance writes',async({page})=>{
  const state=await setup(page,{failTable:'players'});await page.goto('/phase4-test?mode=editor');
  await expect(page.getByText('No se puede guardar sin verificar la plantilla:',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Guardar asistencia',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Confirmar asistencia',exact:true})).toBeDisabled();
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('a failed verification read never confirms attendance after saving',async({page})=>{
  const state=await setup(page,{failRefresh:true});await page.goto('/phase4-test?mode=editor');
  await expect(page.getByRole('button',{name:'Presente',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Presente',exact:true}).click();
  await page.getByRole('button',{name:'Guardar asistencia',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('no se pudo verificar la lectura');
  expect(state.writes).toHaveLength(1);expect(state.writes[0].table).toBe('attendance');
  await expect(page.getByText('Asistencia cerrada',{exact:true})).toHaveCount(0);
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

const sessionCard=(page,name)=>page.locator('.session-card').filter({has:page.getByText(name,{exact:true})});
test('compact session cards select directly and disclose secondary actions without mobile overflow',async({page})=>{
  const state=await setup(page);await page.setViewportSize({width:390,height:844});
  await page.goto('/phase4-test?mode=sessions&shell');
  const name=fixture.sessions.find(s=>s.id===fixture.intendedIds[2]).name;
  const card=sessionCard(page,name);
  await expect(card.getByRole('button',{name:'Editar',exact:true})).toBeVisible();
  await expect(card.getByRole('button',{name:'Archivar sesión',exact:true})).toBeHidden();
  await card.getByRole('button',{name:'Seleccionar sesión: '+name,exact:true}).click();
  await expect(card.getByRole('button',{pressed:true})).toBeVisible();
  await expect(card.getByText('Seleccionada',{exact:true})).toBeVisible();
  expect((await card.boundingBox()).height).toBeLessThan(190);
  await page.screenshot({path:'.phase4-test-artifacts/sessions-390.png',fullPage:true});
  await page.setViewportSize({width:320,height:740});
  await card.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(card.getByRole('button',{name:'Ver registros históricos',exact:true})).toBeVisible();
  await expect(card.getByRole('button',{name:'Archivar sesión',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'.phase4-test-artifacts/sessions-320-options.png',fullPage:true});
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
async function sessionOption(page,name,action){
  const card=sessionCard(page,name);
  if(!await card.locator('details').getAttribute('open').then(value=>value!==null))await card.locator('summary').click();
  await card.getByRole('button',{name:action,exact:true}).click();
}
test('archive and explicit restore separate the catalogs, clear selection and preserve ratings and records',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test?mode=sessions');
  const name=fixture.sessions.find(s=>s.id===fixture.intendedIds[2]).name;
  await expect(page.getByText('Archivada',{exact:true})).toHaveCount(0);
  await sessionCard(page,name).getByRole('button',{name:'Seleccionar sesión'}).click();
  await expect(page.getByText('Selección operativa: '+name,{exact:true})).toBeVisible();
  await sessionOption(page,name,'Archivar sesión');
  expect(state.writes).toHaveLength(0);
  await page.getByRole('button',{name:'Confirmar archivo',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('archivada y verificada');
  await expect(page.getByText('Selección operativa: ninguna',{exact:true})).toBeVisible();
  await expect(sessionCard(page,name)).toHaveCount(0);
  expect(state.writes[0].body).toEqual({status:'archived'});
  expect(state.attendance).toEqual(fixture.attendance);
  await page.getByRole('button',{name:/^Archivadas /}).click();
  await expect(sessionCard(page,name)).toBeVisible();
  await expect(sessionCard(page,name).getByRole('button',{name:'Seleccionar sesión'})).toHaveCount(0);
  await sessionOption(page,name,'Restaurar sesión');
  await expect(page.getByRole('button',{name:'Confirmar restauración',exact:true})).toBeDisabled();
  await page.getByLabel('Restaurar como').selectOption('completed');
  await page.getByRole('button',{name:'Confirmar restauración',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('restaurada y verificada');
  expect(state.writes[1].body).toEqual({status:'completed'});
  expect(state.sessions.find(s=>s.id===fixture.intendedIds[2])).toMatchObject({high_rating_limit:4,low_rating_limit:2,status:'completed'});
  await page.getByRole('button',{name:/^Activas /}).click();await expect(sessionCard(page,name)).toBeVisible();
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

for(const [result,expected]of [['denied','permisos'],['zero','No se ha verificado'],['invalid','no admite este estado']]){
  test('archive '+result+' response never displays success',async({page})=>{
    const state=await setup(page,{archiveResult:result});await page.goto('/phase4-test?mode=sessions');
    const name=fixture.sessions.find(s=>s.id===fixture.intendedIds[2]).name;
    await sessionOption(page,name,'Archivar sesión');
    await page.getByRole('button',{name:'Confirmar archivo',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText(expected);
    await expect(page.getByText('Sesión archivada y verificada correctamente.',{exact:false})).toHaveCount(0);
    expect(state.sessions.find(s=>s.id===fixture.intendedIds[2]).status).toBe('completed');
    expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
  });
}

test('archived session records remain accessible through the explicitly historical Summary detail',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test?mode=sessions');
  const name=fixture.sessions.find(s=>s.id===fixture.intendedIds[2]).name;
  await sessionOption(page,name,'Archivar sesión');
  await page.getByRole('button',{name:'Confirmar archivo',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('archivada y verificada');
  await page.getByRole('button',{name:/^Archivadas /}).click();
  await sessionOption(page,name,'Ver registros históricos');
  await expect(page.getByText('Detalle histórico de una sesión.',{exact:false})).toBeVisible();
  await expect(page.getByText('1 sesiones · 1 registros de asistencia · 0 tarjetas en este ámbito.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Periodo y sesiones',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:new RegExp(fixture.intendedIds[2])})).toBeDisabled();
  expect(state.attendance).toEqual(fixture.attendance);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('ordinary session edits preserve nonstandard rating limits and cannot bypass archiving',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test?mode=sessions');
  const name=fixture.sessions.find(s=>s.id===fixture.intendedIds[2]).name;
  await sessionCard(page,name).getByRole('button',{name:'Editar',exact:true}).click();
  await expect(page.getByLabel('Estado sesión').getByRole('option',{name:'Archivada'})).toHaveCount(0);
  await page.getByLabel('Nombre sesión',{exact:true}).fill('Updated fixture');
  await page.getByRole('button',{name:'Guardar sesión',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('guardada y verificada');
  expect(state.writes[0].body).not.toHaveProperty('high_rating_limit');expect(state.writes[0].body).not.toHaveProperty('low_rating_limit');
  expect(state.sessions.find(s=>s.id===fixture.intendedIds[2])).toMatchObject({high_rating_limit:4,low_rating_limit:2});
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('coach cannot invoke archive or restore controls',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test?mode=sessions&role=coach');
  await expect(page.getByRole('button',{name:/^Activas /})).toBeVisible();
  await expect(page.getByRole('button',{name:'Archivar sesión',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:/^Archivadas /}).click();
  await expect(page.getByRole('button',{name:'Restaurar sesión',exact:true})).toHaveCount(0);
  await page.locator('.session-options summary').click();
  await expect(page.getByRole('button',{name:'Ver registros históricos'})).toBeVisible();
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
