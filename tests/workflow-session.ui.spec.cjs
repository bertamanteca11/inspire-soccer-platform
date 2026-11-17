const {test,expect}=require('@playwright/test');
async function setup(page){
  const unexpected=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='http://127.0.0.1:4180'){unexpected.push(url.pathname);return route.abort();}
    if(url.pathname==='/src/supabase.ts')return route.fulfill({contentType:'application/javascript',body:'export {supabase} from "/tests/workflow-session.fixture.ts";'});
    return route.continue();
  });
  await page.goto('/');await expect(page.getByRole('heading',{level:1})).toHaveText('Inicio');
  return {unexpected,errors};
}
async function assertReadOnly(page,state){
  const writes=await page.evaluate(()=>window.workflowFixture.requests.filter(r=>!['select','rpc'].includes(r.method)||r.method==='rpc'&&!['app_access','veo_status','batch4_workflow_access','discipline_workspace'].includes(r.table)));
  expect(writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
}
test('entering Evaluation rereads a session confirmed by another Admin without writing flags or drafts',async({page})=>{
  const state=await setup(page);
  await page.evaluate(()=>window.workflowFixture.patch({attendance_confirmed:true}));
  await page.getByRole('button',{name:'Evaluar',exact:true}).first().click();
  await expect(page.getByText('Primero hay que confirmar la asistencia.',{exact:true})).toHaveCount(0);
  await expect(page.locator('.rating-player-row .rate.active',{hasText:'3'})).toHaveCount(1);
  expect(await page.evaluate(()=>window.workflowFixture.requests.filter(r=>r.table==='sessions'&&r.one).length)).toBeGreaterThan(1);
  await assertReadOnly(page,state);
});
test('entering Evaluation respects attendance reopened by another Admin',async({page})=>{
  const state=await setup(page);
  await page.evaluate(()=>window.workflowFixture.patch({attendance_confirmed:true}));
  await page.getByRole('button',{name:'Evaluar',exact:true}).first().click();
  await expect(page.locator('.rating-player-row')).toHaveCount(1);
  await page.getByRole('button',{name:'Inicio',exact:true}).first().click();
  await page.evaluate(()=>window.workflowFixture.patch({attendance_confirmed:false}));
  await page.getByRole('button',{name:'Evaluar',exact:true}).first().click();
  await expect(page.getByText('Primero hay que confirmar la asistencia.',{exact:true})).toBeVisible();
  await expect(page.locator('.rating-player-row')).toHaveCount(0);
  await assertReadOnly(page,state);
});
test('a failed session refresh blocks Evaluation rather than using cached confirmations',async({page})=>{
  const state=await setup(page);
  await page.evaluate(()=>window.workflowFixture.failSelected());
  await page.getByRole('button',{name:'Evaluar',exact:true}).first().click();
  await expect(page.getByRole('alert')).toContainText('Session read unavailable');
  await expect(page.locator('.rating-player-row')).toHaveCount(0);
  await assertReadOnly(page,state);
});
test('Evaluation waits for the authoritative read before showing prerequisite state',async({page})=>{
  const state=await setup(page);
  await page.evaluate(()=>{window.workflowFixture.patch({attendance_confirmed:true});window.workflowFixture.holdSelected();});
  await page.getByRole('button',{name:'Evaluar',exact:true}).first().click();
  await expect.poll(()=>page.evaluate(()=>window.workflowFixture.pendingSelected())).toBe(true);
  await expect(page.getByText('Cargando datos...', {exact:true})).toBeVisible();
  await expect(page.getByText('Primero hay que confirmar la asistencia.',{exact:true})).toHaveCount(0);
  await page.evaluate(()=>window.workflowFixture.releaseSelected());
  await expect(page.locator('.rating-player-row')).toHaveCount(1);
  await assertReadOnly(page,state);
});

test('confirming Evaluation shows the completed status returned by the RPC in Sessions without a direct session update',async({page})=>{
  const state=await setup(page);
  await page.evaluate(()=>window.workflowFixture.patch({attendance_confirmed:true,draft_defaults_version:1}));
  await page.getByRole('button',{name:'Evaluar',exact:true}).first().click();
  await expect(page.locator('.rating-player-row')).toHaveCount(1);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Confirmar evaluación',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.workflowFixture.requests.filter(r=>r.table==='batch4_workflow_action').length)).toBe(1);
  await page.getByRole('button',{name:'Sesiones',exact:true}).first().click();
  await expect(page.locator('.session-card .session-status')).toHaveText('Completada');
  const writes=await page.evaluate(()=>window.workflowFixture.requests.filter(r=>!['select','rpc'].includes(r.method)||r.table==='batch4_workflow_action'));
  expect(writes).toHaveLength(1);expect(writes[0].args.p_action).toBe('confirm');
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
