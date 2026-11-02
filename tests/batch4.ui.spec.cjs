const {test,expect}=require('@playwright/test');
async function setup(page,{mode='attendance',coach=false,historical=false}={}) {
  const writes=[];
  const players=[{id:'p',display_name:'Alex',status:'active',shirt_number:1},{id:'g',display_name:'Guest',status:'guest',shirt_number:2},{id:'n',display_name:'Excluded',status:'active',shirt_number:3}];
  const session={id:'s',name:'Synthetic session',session_date:'2026-11-02',type:'training',status:'planned',high_rating_limit:6,callup_confirmed:mode!=='callup',attendance_confirmed:false,draft_defaults_version:historical?null:1};
  let calls=mode==='callup'?[]:[{player_id:'p',status:'called_up',evaluable:true},{player_id:'g',status:'guest_not_evaluable',evaluable:false},{player_id:'n',status:'not_called',evaluable:false}];
  let attendance=[];
  await page.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url());
    if(['localhost','127.0.0.1'].includes(url.hostname)) {
      if(url.pathname==='/batch4-test') return route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/batch4.harness.tsx"></script></body></html>'});
      return route.continue();
    }
    const table=url.pathname.split('/').pop();
    if(table==='batch4_workflow_access')return route.fulfill({json:!(coach&&mode==='callup')&&!session[`${mode==='callup'?'callup':'attendance'}_confirmed`]});
    if(table==='batch4_workflow_action') {
      const body=req.postDataJSON();writes.push({table,body});
      if(body.p_workflow==='callup'&&body.p_action==='confirm')calls=body.p_rows;
      session[`${body.p_workflow}_confirmed`]=body.p_action==='confirm';
      return route.fulfill({json:session});
    }
    if(req.method()!=='GET') {
      const body=req.postDataJSON();writes.push({table,body});
      if(table==='sessions')return route.fulfill({json:[{...body,id:'new'}]});
      if(table!=='attendance')throw new Error('Unexpected mutation '+table);
      attendance=body.map((r,i)=>({...r,id:String(i)}));return route.fulfill({json:null});
    }
    const tables={players,callups:calls,attendance,sessions:mode==='sessions'?[session]:session,active_suspensions:[]};
    if(!Object.hasOwn(tables,table))throw new Error('Unexpected read '+table);
    const data=tables[table];
    return route.fulfill({json:Array.isArray(data)?data.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+Number(url.searchParams.get('limit')||500)):data});
  });
  await page.goto(`/batch4-test?mode=${mode}${coach?'&coach':''}${historical?'&historical':''}`);
  return {writes,get attendance(){return attendance},get calls(){return calls}};
}
test('attendance defaults are local, complete save persists untouched guests, remount and reopen preserve choices',async({page})=>{
  const state=await setup(page);
  const present=page.getByRole('button',{name:'Presente',exact:true});
  await expect(present.nth(0)).toHaveAttribute('aria-pressed','true');
  await expect(present.nth(1)).toHaveAttribute('aria-pressed','true');
  await expect(present.nth(2)).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'Confirmar asistencia',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Guarda');expect(state.writes).toEqual([]);
  await page.getByRole('button',{name:'Ausencia',exact:true}).nth(0).click();
  expect(state.writes).toEqual([]);
  await page.getByRole('button',{name:'Toggle page'}).click();await page.getByRole('button',{name:'Toggle page'}).click();
  await expect(present.nth(0)).toHaveAttribute('aria-pressed','true');expect(state.writes).toEqual([]);
  await page.getByRole('button',{name:'Ausencia',exact:true}).nth(0).click();
  await page.getByRole('button',{name:'Guardar asistencia',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('guardada');
  expect(state.attendance.map(r=>[r.player_id,r.status])).toEqual([['p','unjustified_absence'],['g','present']]);
  await page.getByRole('button',{name:'Toggle page'}).click();await page.getByRole('button',{name:'Toggle page'}).click();
  await expect(page.getByRole('button',{name:'Ausencia',exact:true}).nth(0)).toHaveAttribute('aria-pressed','true');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Confirmar asistencia',exact:true}).click();
  await expect(page.getByRole('button',{name:'Asistencia cerrada',exact:true})).toBeVisible();
  expect(state.writes.filter(w=>w.table==='attendance')).toHaveLength(1);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Reabrir asistencia',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ausencia',exact:true}).nth(0)).toHaveAttribute('aria-pressed','true');
});
test('callup changes wait for confirmation and saved exclusions survive reopen',async({page})=>{
  const state=await setup(page,{mode:'callup'});
  await expect(page.getByRole('button',{name:'Convocado',exact:true})).toHaveCount(3);
  await page.getByRole('button',{name:'Convocado',exact:true}).first().click();expect(state.writes).toEqual([]);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Confirmar convocatoria',exact:true}).click();
  await expect(page.getByRole('button',{name:'Convocatoria confirmada',exact:true})).toBeVisible();
  expect(state.calls.find(r=>r.player_id==='p').status).toBe('not_called');expect(state.calls.find(r=>r.player_id==='g').evaluable).toBe(false);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Reabrir convocatoria',exact:true}).click();
  await expect(page.getByRole('button',{name:'No convocado',exact:true})).toHaveCount(1);
});
test('Coach callups are read-only and historical gaps never default',async({page})=>{
  const state=await setup(page,{mode:'callup',coach:true});
  await expect(page.getByRole('button',{name:'Confirmar convocatoria',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Convocado',exact:true}).first()).toBeDisabled();expect(state.writes).toEqual([]);
});
test('historical attendance remains unregistered without writes',async({page})=>{
  const state=await setup(page,{historical:true});await expect(page.getByText('Sin registrar',{exact:true})).toHaveCount(3);expect(state.writes).toEqual([]);
});
for(const kind of ['operational','historical'])test(`session creation marks only explicit operational origin: ${kind}`,async({page})=>{
  const state=await setup(page,{mode:'sessions'});
  await page.getByRole('button',{name:'Crear sesión',exact:true}).click();
  await expect(page.getByLabel('Origen sesión')).toHaveValue('');
  await page.getByLabel('Nombre sesión').fill('Created locally');
  await page.getByLabel('Origen sesión').selectOption(kind);
  await page.getByRole('button',{name:'Guardar sesión',exact:true}).click();
  await expect(page.getByText('Sesión guardada y verificada correctamente.',{exact:true})).toBeVisible();
  expect(state.writes).toHaveLength(1);
  if(kind==='operational')expect(state.writes[0].body.draft_defaults_version).toBe(1);
  else expect(state.writes[0].body).not.toHaveProperty('draft_defaults_version');
});
