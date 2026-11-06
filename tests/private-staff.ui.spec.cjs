const {test,expect}=require('@playwright/test');
async function setup(page,{confirmed=false,sanction=false,stale=false,archived=false}={}){
  const writes=[],reads=[],unexpected=[],errors=[];
  const session={id:'session-1',name:'Partido de prueba',session_date:'2026-11-06',type:'league_match',status:archived?'archived':'planned'};
  let data={session_id:session.id,revision:2,workflow:{callup_confirmed:confirmed,attendance_confirmed:false},members:[{id:'staff-1',name:'Staff de prueba',job:'Entrenador',active:true,cycle_yellows:sanction?5:0,historical_yellows:sanction?5:0,historical_reds:0}],callups:confirmed?[{staff_id:'staff-1',status:'called_up'}]:[],attendance:[],cards:[],suspensions:sanction?[{id:'sanction-1',staff_id:'staff-1',matches_total:1,source:'yellow_accumulation',served_at:null}]:[]};
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin==='http://127.0.0.1:4180'){
      if(url.pathname==='/staff-test')return route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/@vite/client"></script><script type="module" src="/tests/private-staff.harness.tsx"></script></body></html>'});
      return route.continue();
    }
    const name=url.pathname.split('/').pop();
    if(name==='sessions'&&request.method()==='GET'){reads.push(name);return route.fulfill({json:Number(url.searchParams.get('offset')||0)?[]:[session]});}
    if(name==='private_staff_workspace'){reads.push(name);return route.fulfill({json:data});}
    if(name==='private_staff_action'){
      const body=request.postDataJSON();writes.push(body);
      if(stale)return route.fulfill({status:409,json:{code:'40001',message:'Los datos han cambiado. Actualiza el staff antes de guardar.'}});
      const action=body.p_action,payload=body.p_payload;data=structuredClone(data);data.revision++;
      if(action.includes('callup')&&!action.startsWith('reopen')){data.callups=payload.rows;data.workflow.callup_confirmed=action==='confirm_callup';}
      if(action.includes('attendance')&&!action.startsWith('reopen')){data.attendance=payload.rows;data.workflow.attendance_confirmed=action==='confirm_attendance';}
      if(action==='serve_suspension'){data.suspensions[0].served_at='2026-11-06T12:00:00Z';data.members[0].cycle_yellows=0;}
      if(action==='add_member')data.members.push({id:'staff-2',name:payload.name,job:payload.job,active:true,cycle_yellows:0,historical_yellows:0,historical_reds:0});
      return route.fulfill({json:data});
    }
    unexpected.push(request.method()+' '+url.pathname);return route.abort();
  });
  return {writes,reads,unexpected,errors};
}
test('private staff denial makes no reads or writes even for an Admin shell',async({page})=>{
  const state=await setup(page);await page.goto('/staff-test?denied');
  await expect(page.getByRole('alert')).toContainText('privada para los perfiles Admin');
  expect(state.reads).toEqual([]);expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test('mobile staff callup requires explicit choices and sanction acknowledgement before confirmation',async({page})=>{
  const state=await setup(page,{sanction:true});await page.setViewportSize({width:320,height:740});await page.goto('/staff-test');
  await page.getByRole('button',{name:'Confirmar convocatoria del staff',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('cada miembro');expect(state.writes).toEqual([]);
  await page.getByLabel('Convocatoria de Staff de prueba').selectOption('called_up');
  await expect(page.getByRole('alert').filter({hasText:'Convocados con sanción activa'})).toBeVisible();
  await page.getByRole('button',{name:'Confirmar convocatoria del staff',exact:true}).click();expect(state.writes).toEqual([]);
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirmar convocatoria del staff',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Convocatoria del staff confirmada.');
  expect(state.writes[0]).toMatchObject({p_action:'confirm_callup',p_session:'session-1',p_revision:2,p_payload:{acknowledge_sanctions:true,rows:[{staff_id:'staff-1',status:'called_up'}]}});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'.phase4-test-artifacts/private-staff-mobile.png',fullPage:true});
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test('staff attendance starts unset, preserves a reason and confirms without evaluation',async({page})=>{
  const state=await setup(page,{confirmed:true});await page.goto('/staff-test');await page.getByRole('group',{name:'Apartados del staff'}).getByRole('button',{name:'Asistencia',exact:true}).click();
  await expect(page.getByLabel('Asistencia de Staff de prueba',{exact:true})).toHaveValue('');
  await page.getByRole('button',{name:'Confirmar asistencia del staff',exact:true}).click();expect(state.writes).toEqual([]);
  await page.getByLabel('Asistencia de Staff de prueba',{exact:true}).selectOption('late');
  await page.getByRole('button',{name:'Confirmar asistencia del staff',exact:true}).click();expect(state.writes).toEqual([]);
  await page.getByLabel('Notas de asistencia de Staff de prueba').fill('Tráfico');
  await page.getByRole('button',{name:'Confirmar asistencia del staff',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Asistencia del staff confirmada.');
  expect(state.writes[0].p_payload.rows).toEqual([{staff_id:'staff-1',status:'late',notes:'Tráfico'}]);
  await expect(page.locator('.private-staff-page').getByRole('button',{name:/Evaluar/})).toHaveCount(0);
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test('staff sanction completion requires confirmation and keeps historical card totals',async({page})=>{
  const state=await setup(page,{confirmed:true,sanction:true});await page.goto('/staff-test');await page.getByRole('button',{name:'Tarjetas',exact:true}).click();
  await page.getByRole('button',{name:'Marcar cumplida',exact:true}).click();expect(state.writes).toEqual([]);
  await page.getByRole('dialog').getByRole('button',{name:'Confirmar sanción cumplida',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText('Acumulación actual: 0 / 5 amarillas')).toBeVisible();
  await expect(page.getByText('Histórico: 5 🟨 · 0 🟥')).toBeVisible();
  expect(state.writes[0].p_action).toBe('serve_suspension');expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test('stale staff save reports a conflict and retains the unsaved selection',async({page})=>{
  const state=await setup(page,{stale:true});await page.goto('/staff-test');await page.getByLabel('Convocatoria de Staff de prueba').selectOption('not_called');
  await page.getByRole('button',{name:'Guardar convocatoria del staff',exact:true}).click();await expect(page.getByRole('alert')).toContainText('han cambiado');
  await expect(page.getByLabel('Convocatoria de Staff de prueba')).toHaveValue('not_called');
  await expect(page.getByRole('status')).toHaveCount(0);expect(state.writes).toHaveLength(1);expect(state.errors).toEqual([]);
});
test('staff member creation is separate from user access and archived sessions stay read only',async({page})=>{
  let state=await setup(page);await page.goto('/staff-test');await page.getByRole('button',{name:'Miembros',exact:true}).click();
  await page.getByLabel('Nombre del miembro').fill('Fisio de prueba');await page.getByLabel('Función en el equipo').fill('Fisio');
  await page.getByRole('button',{name:'Añadir miembro',exact:true}).click();await expect(page.getByText('Fisio de prueba',{exact:true})).toBeVisible();
  expect(state.writes[0].p_action).toBe('add_member');expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
  await page.unroute('**/*');state=await setup(page,{archived:true});await page.goto('/staff-test');
  await expect(page.getByText('Sesión de solo consulta.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Confirmar convocatoria del staff',exact:true})).toBeDisabled();expect(state.writes).toEqual([]);
});
