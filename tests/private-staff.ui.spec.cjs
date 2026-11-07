const {test,expect}=require('@playwright/test');
async function setup(page,{confirmed=false,sanction=false,stale=false,archived=false,noSessions=false,legacy=false,nonCalled=false,noCalled=false,savedNonCalled=false}={}){
  const writes=[],reads=[],unexpected=[],errors=[];
  const session={id:'session-1',name:'Partido de prueba',session_date:'2026-11-06',type:'league_match',status:archived?'archived':'planned'};
  let data={session_id:session.id,revision:2,workflow:{callup_confirmed:confirmed,attendance_confirmed:false},members:[{id:'staff-1',name:'Staff de prueba',job:'Entrenador',active:true,cycle_yellows:sanction?5:0,historical_yellows:sanction?5:0,historical_reds:0}],callups:confirmed?[{staff_id:'staff-1',status:'called_up'}]:[],attendance:[],cards:[],suspensions:sanction?[{id:'sanction-1',staff_id:'staff-1',matches_total:1,source:'yellow_accumulation',served_at:null}]:[]};
  if(noCalled)data.callups=[{staff_id:'staff-1',status:'not_called'}];
  if(nonCalled||savedNonCalled){
    data.members.push({id:'staff-other',name:'Fisio no convocado',job:'Fisio',active:!savedNonCalled,cycle_yellows:0,historical_yellows:0,historical_reds:0});
    data.callups.push({staff_id:'staff-other',status:'not_called'});
    if(savedNonCalled)data.attendance.push({staff_id:'staff-other',status:'justified_absence',notes:'Compromiso previo antes de incorporarse.'});
  }
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin==='http://127.0.0.1:4180'){
      if(url.pathname==='/staff-test')return route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/@vite/client"></script><script type="module" src="/tests/private-staff.harness.tsx"></script></body></html>'});
      return route.continue();
    }
    const name=url.pathname.split('/').pop();
    const workspace=sessionId=>({...data,session_id:sessionId,...(sessionId===null?{workflow:{callup_confirmed:false,attendance_confirmed:false},callups:[],attendance:[],cards:[]}: {})});
    if(name==='sessions'&&request.method()==='GET'){reads.push(name);return route.fulfill({json:noSessions||Number(url.searchParams.get('offset')||0)?[]:[session]});}
    if(name==='private_staff_workspace'){
      reads.push(name);const sid=request.postDataJSON().p_session;
      if(legacy&&sid===null)return route.fulfill({status:400,json:{code:'P0001',message:'Sesión no encontrada'}});
      return route.fulfill({json:workspace(sid)});
    }
    if(name==='private_staff_action'){
      const body=request.postDataJSON();writes.push(body);
      if(stale)return route.fulfill({status:409,json:{code:'40001',message:'Los datos han cambiado. Actualiza el staff antes de guardar.'}});
      const action=body.p_action,payload=body.p_payload;data=structuredClone(data);data.revision++;
      if(action.includes('callup')&&!action.startsWith('reopen')){data.callups=payload.rows;data.workflow.callup_confirmed=action==='confirm_callup';}
      if(action.includes('attendance')&&!action.startsWith('reopen')){data.attendance=payload.rows;data.workflow.attendance_confirmed=action==='confirm_attendance';}
      if(action==='reopen_attendance')data.workflow.attendance_confirmed=false;
      if(action==='serve_suspension'){data.suspensions[0].served_at='2026-11-06T12:00:00Z';data.members[0].cycle_yellows=0;}
      if(action==='add_member')data.members.push({id:'staff-2',name:payload.name,job:payload.job,active:true,cycle_yellows:0,historical_yellows:0,historical_reds:0});
      if(action==='member_active')data.members.find(m=>m.id===payload.staff_id).active=payload.active;
      return route.fulfill({json:workspace(body.p_session)});
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
  await page.getByRole('group',{name:'Apartados del staff'}).getByRole('button',{name:'Convocatoria',exact:true}).click();
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
test('staff attendance defaults to present, preserves an edited reason and confirms without evaluation',async({page})=>{
  const state=await setup(page,{confirmed:true});await page.goto('/staff-test');await page.getByRole('group',{name:'Apartados del staff'}).getByRole('button',{name:'Asistencia',exact:true}).click();
  await expect(page.getByLabel('Asistencia de Staff de prueba',{exact:true})).toHaveValue('present');expect(state.writes).toEqual([]);
  await page.getByLabel('Asistencia de Staff de prueba',{exact:true}).selectOption('late');
  await page.getByRole('button',{name:'Confirmar asistencia del staff',exact:true}).click();expect(state.writes).toEqual([]);
  await page.getByLabel('Notas de asistencia de Staff de prueba').fill('Tráfico');
  await page.getByRole('button',{name:'Confirmar asistencia del staff',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Asistencia del staff confirmada.');
  expect(state.writes[0].p_payload.rows).toEqual([{staff_id:'staff-1',status:'late',notes:'Tráfico'}]);
  await expect(page.locator('.private-staff-page').getByRole('button',{name:/Evaluar/})).toHaveCount(0);
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('untouched staff attendance defaults are persisted only when explicitly confirmed',async({page})=>{
  const state=await setup(page,{confirmed:true});await page.goto('/staff-test');
  await page.getByRole('group',{name:'Apartados del staff'}).getByRole('button',{name:'Asistencia',exact:true}).click();
  await expect(page.getByLabel('Asistencia de Staff de prueba',{exact:true})).toHaveValue('present');expect(state.writes).toEqual([]);
  await page.getByRole('button',{name:'Confirmar asistencia del staff',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Asistencia del staff confirmada.');
  expect(state.writes[0].p_payload.rows).toEqual([{staff_id:'staff-1',status:'present',notes:''}]);
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('a non-called physio can save and confirm a justified absence with a required reason, preserved after refresh',async({page})=>{
  const state=await setup(page,{confirmed:true,nonCalled:true});await page.setViewportSize({width:320,height:740});await page.goto('/staff-test');
  await page.getByRole('group',{name:'Apartados del staff'}).getByRole('button',{name:'Asistencia',exact:true}).click();
  const status=page.getByLabel('Asistencia de Fisio no convocado',{exact:true});
  await expect(status).toHaveValue('');await expect(page.getByLabel('Asistencia de Staff de prueba',{exact:true})).toHaveValue('present');
  await status.selectOption('justified_absence');
  await page.getByRole('button',{name:'Guardar asistencia del staff',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('explica');expect(state.writes).toEqual([]);
  const notes=page.getByLabel('Notas de asistencia de Fisio no convocado',{exact:true});
  await notes.fill('Compromiso previo acordado antes de incorporarse.');
  await page.getByRole('button',{name:'Guardar asistencia del staff',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Asistencia del staff guardada.');
  expect(state.writes[0].p_payload.rows).toEqual([{staff_id:'staff-1',status:'present',notes:''},{staff_id:'staff-other',status:'justified_absence',notes:'Compromiso previo acordado antes de incorporarse.'}]);
  await page.getByRole('button',{name:'Actualizar staff',exact:true}).click();
  await expect(status).toHaveValue('justified_absence');await expect(notes).toHaveValue('Compromiso previo acordado antes de incorporarse.');
  await expect(status.locator('option[value=""]')).toHaveJSProperty('disabled',true);
  await page.getByRole('button',{name:'Confirmar asistencia del staff',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Asistencia del staff confirmada.');
  await expect(notes).toBeDisabled();expect(state.writes[1].p_action).toBe('confirm_attendance');
  expect(state.writes.every(w=>!w.p_action.includes('callup'))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('untouched non-called staff remain optional and produce no attendance or absence records',async({page})=>{
  const state=await setup(page,{confirmed:true,nonCalled:true});await page.goto('/staff-test');
  await page.getByRole('group',{name:'Apartados del staff'}).getByRole('button',{name:'Asistencia',exact:true}).click();
  await expect(page.getByLabel('Asistencia de Fisio no convocado',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('Notas de asistencia de Fisio no convocado',{exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Confirmar asistencia del staff',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Asistencia del staff confirmada.');
  expect(state.writes[0].p_payload.rows).toEqual([{staff_id:'staff-1',status:'present',notes:''}]);
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('previously saved absence reasons stay available even for an inactive non-called staff member',async({page})=>{
  const state=await setup(page,{confirmed:true,savedNonCalled:true});await page.goto('/staff-test');
  await page.getByRole('group',{name:'Apartados del staff'}).getByRole('button',{name:'Asistencia',exact:true}).click();
  await expect(page.getByLabel('Asistencia de Fisio no convocado',{exact:true})).toHaveValue('justified_absence');
  await expect(page.getByLabel('Notas de asistencia de Fisio no convocado',{exact:true})).toHaveValue('Compromiso previo antes de incorporarse.');
  await page.getByRole('button',{name:'Guardar asistencia del staff',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Asistencia del staff guardada.');
  expect(state.writes[0].p_payload.rows.find(r=>r.staff_id==='staff-other').notes).toBe('Compromiso previo antes de incorporarse.');
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('a session with no called staff still permits an explicit justified absence',async({page})=>{
  const state=await setup(page,{confirmed:true,noCalled:true});await page.goto('/staff-test');
  await page.getByRole('group',{name:'Apartados del staff'}).getByRole('button',{name:'Asistencia',exact:true}).click();
  await page.getByLabel('Asistencia de Staff de prueba',{exact:true}).selectOption('justified_absence');
  await page.getByLabel('Notas de asistencia de Staff de prueba',{exact:true}).fill('Compromiso anterior al fichaje.');
  await page.getByRole('button',{name:'Confirmar asistencia del staff',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Asistencia del staff confirmada.');
  expect(state.writes[0].p_payload.rows).toEqual([{staff_id:'staff-1',status:'justified_absence',notes:'Compromiso anterior al fichaje.'}]);
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
  const state=await setup(page,{stale:true});await page.goto('/staff-test');
  await page.getByRole('group',{name:'Apartados del staff'}).getByRole('button',{name:'Convocatoria',exact:true}).click();
  await page.getByLabel('Convocatoria de Staff de prueba').selectOption('not_called');
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
  await page.getByRole('group',{name:'Apartados del staff'}).getByRole('button',{name:'Convocatoria',exact:true}).click();
  await expect(page.getByText('Sesión de solo consulta.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Confirmar convocatoria del staff',exact:true})).toBeDisabled();expect(state.writes).toEqual([]);
});

test('staff opens its global directory and adds a physio with zero sessions and no session queries',async({page})=>{
  const state=await setup(page,{noSessions:true});await page.setViewportSize({width:320,height:740});await page.goto('/staff-test');
  await expect(page.getByRole('heading',{name:'Miembros del equipo técnico',exact:true})).toBeVisible();
  await expect(page.getByLabel('Sesión del staff')).toHaveCount(0);
  await expect(page.getByText('Staff de prueba',{exact:true})).toBeVisible();
  expect(state.reads).not.toContain('sessions');expect(state.writes).toEqual([]);
  await page.getByLabel('Nombre del miembro').fill('Fisio sin sesión');await page.getByLabel('Función en el equipo').fill('Fisioterapeuta');
  await page.getByRole('button',{name:'Añadir miembro',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Miembro añadido a la lista general del staff.');
  await expect(page.getByText('Fisio sin sesión',{exact:true})).toBeVisible();
  expect(state.writes).toEqual([{p_session:null,p_action:'add_member',p_payload:{name:'Fisio sin sesión',job:'Fisioterapeuta'},p_revision:2}]);
  expect(state.reads).not.toContain('sessions');expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'.phase4-test-artifacts/staff-directory-mobile.png',fullPage:true});
});

test('directory activation is independent from archived sessions and never submits a session ID',async({page})=>{
  const state=await setup(page,{archived:true});await page.goto('/staff-test');
  await page.getByRole('button',{name:'Desactivar',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Estado del miembro actualizado.');
  expect(state.writes[0]).toMatchObject({p_session:null,p_action:'member_active',p_payload:{staff_id:'staff-1',active:false}});
  expect(state.reads).not.toContain('sessions');expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('an older database keeps the session-based member form usable until its upgrade is applied',async({page})=>{
  const state=await setup(page,{legacy:true});await page.goto('/staff-test');
  await expect(page.getByRole('alert')).toContainText('pendiente de activar');
  await page.getByRole('button',{name:'Gestionar miembros desde una sesión',exact:true}).click();
  await page.getByLabel('Nombre del miembro').fill('Fisio provisional');
  await page.getByRole('button',{name:'Añadir miembro',exact:true}).click();
  await expect(page.getByText('Fisio provisional',{exact:true})).toBeVisible();
  expect(state.writes[0]).toMatchObject({p_session:'session-1',p_action:'add_member'});
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
