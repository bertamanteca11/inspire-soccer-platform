const {test,expect}=require('@playwright/test');
const {createDisciplineUiDatabase}=require('./helpers/disciplineUiDatabase.cjs');
const html='<html lang="es"><body><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/discipline.harness.tsx"></script></body></html>';
async function setup(page,role='coach'){
  const fixture=await createDisciplineUiDatabase(role),state={...fixture,writes:[],unexpected:[],errors:[]};page.__discipline=state;
  page.on('pageerror',e=>state.errors.push(e.message));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='http://127.0.0.1:4181'){state.unexpected.push(url.pathname);return route.abort();}
    if(url.pathname==='/discipline-test')return route.fulfill({contentType:'text/html',body:html});
    if(url.pathname==='/src/supabase.ts')return route.fulfill({contentType:'application/javascript',body:'export {supabase} from "/tests/discipline.browser-client.ts";'});
    if(url.pathname==='/discipline-test-api'){
      const body=route.request().postDataJSON();
      if(body.kind==='rpc'&&['discipline_action','discipline_save_card','batch4_workflow_action'].includes(body.name))state.writes.push(body);
      try{
        const data=await fixture.handle(body),dates=new Set(['session_date','birth_date','start_date','end_date']);
        const json=JSON.parse(JSON.stringify(data,function(key,value){return dates.has(key)&&this[key] instanceof Date?this[key].toISOString().slice(0,10):value;}));
        return route.fulfill({json});
      }catch(error){return route.fulfill({json:{data:null,error:{code:error.code||'TEST',message:error.message}}});}
    }
    return route.continue();
  });
  await page.goto('/discipline-test?role='+role);
  await expect(page.getByRole('heading',{level:1})).toHaveText('Evaluación');
  await page.getByLabel('Orden de evaluación',{exact:true}).selectOption('player');
  await expect(page.getByLabel('Tarjeta del jugador',{exact:true})).toBeEnabled();
  return state;
}
test.afterEach(async({page})=>{const s=page.__discipline;if(s){try{expect(s.unexpected).toEqual([]);expect(s.errors).toEqual([]);}finally{await s.close();}}});
async function saveIncident(page,kind){
  await page.getByLabel('Tarjeta del jugador',{exact:true}).selectOption(kind);
  if(!['none','yellow'].includes(kind))await page.getByPlaceholder('Motivo de la tarjeta...').fill('Incidente revisado según acta');
  if(!['none','yellow'].includes(kind))await expect(page.getByLabel('Partidos de sanción (si se conocen)',{exact:true})).toHaveValue('');
  await page.getByRole('button',{name:'Siguiente jugador →',exact:true}).click();
}
for(const [kind,yellows,reds]of [['yellow',1,0],['double_yellow',2,1],['straight_red',0,1],['yellow_red',1,1]])test(`real evaluation RPC persists ${kind} with its complete history and unknown sanction length`,async({page})=>{
  const s=await setup(page);expect(s.writes).toEqual([]);
  await saveIncident(page,kind);
  await expect.poll(async()=>Number((await s.db.query('SELECT count(*) AS n FROM cards WHERE player_id=$1',[s.player])).rows[0].n)).toBe(1);
  const workspace=(await s.db.query('SELECT discipline_workspace($1) AS w',[s.player])).rows[0].w;
  expect(workspace.balances[0].historical_yellows).toBe(yellows);expect(workspace.balances[0].historical_reds).toBe(reds);
  if(reds){expect(workspace.cases[0].matches_total).toBeNull();expect(workspace.cases[0].status).toBe('awaiting_decision');}
  expect(s.writes.filter(w=>w.name==='discipline_save_card')).toHaveLength(1);
});

test('Coach enters the official decision later through the Sanction button and verifies each eligible match separately on mobile',async({page},info)=>{
  await page.setViewportSize({width:360,height:844});const s=await setup(page);await saveIncident(page,'yellow_red');
  await page.getByRole('button',{name:'Inicio',exact:true}).first().click();
  await page.getByRole('button',{name:'Gestionar sanciones de Alex',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Sanciones de Alex',exact:true});
  await expect(dialog.getByText('Pendiente de resolución',{exact:false}).first()).toBeVisible();
  await dialog.getByRole('button',{name:'Ver / editar sanción',exact:true}).first().click();
  const editor=dialog.getByRole('region',{name:'Editar sanción'});
  await editor.getByLabel('Partidos de sanción confirmados',{exact:true}).fill('2');
  await editor.getByLabel('Aplicable desde',{exact:true}).fill(await s.day(-9));
  await editor.getByLabel('Fecha de la resolución',{exact:true}).fill(await s.day(0));
  await editor.getByLabel('Resolución / notas',{exact:true}).fill('Resolución oficial: dos partidos de liga');
  await editor.getByRole('button',{name:'Guardar decisión',exact:true}).click();
  await expect(editor.getByText('0 verificados · 2 de sanción',{exact:true})).toBeVisible();
  expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('discipline-mobile-decision.png'),fullPage:true});
  await expect(editor.getByLabel('Partido cumplido').locator('option')).toHaveCount(3);
  for(const sid of [s.id(41),s.id(42)]){
    await editor.getByRole('combobox',{name:'Partido cumplido',exact:true}).selectOption(sid);
    await editor.getByLabel(/Confirmo que el jugador no participó/).check();
    await editor.getByLabel('Justificación del cumplimiento / corrección',{exact:true}).fill('No participó: partido cumplido de esta resolución');
    await editor.getByRole('button',{name:'Registrar partido cumplido',exact:true}).click();
    await expect.poll(async()=>Number((await s.db.query('SELECT count(*) AS n FROM discipline_service_matches WHERE player_id=$1 AND revoked_at IS NULL',[s.player])).rows[0].n)).toBe(sid===s.id(41)?1:2);
    await expect(editor.getByText(`${sid===s.id(41)?1:2} verificados · 2 de sanción`,{exact:true})).toBeVisible();
  }
  await expect(editor.getByRole('button',{name:'Registrar partido cumplido',exact:true})).toHaveCount(0);
  const row=(await s.db.query('SELECT status,matches_served FROM suspensions WHERE player_id=$1',[s.player])).rows[0];expect(row).toEqual({status:'served',matches_served:2});
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  await expect(page.locator('.home-discipline-entry')).toContainText('1 amarillas en total');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('discipline-mobile-after-service.png'),fullPage:true});
});

test('opening and cancelling the decision editor performs no writes and stale decisions remain visibly rejected',async({page})=>{
  const s=await setup(page);await saveIncident(page,'straight_red');
  await page.getByRole('button',{name:'Inicio',exact:true}).first().click();
  await page.getByRole('button',{name:'Gestionar sanciones de Alex',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Ver / editar sanción',exact:true}).first().click();
  const before=s.writes.length;await dialog.getByRole('button',{name:'Cerrar edición',exact:true}).click();expect(s.writes.length).toBe(before);
  await dialog.getByRole('button',{name:'Ver / editar sanción',exact:true}).first().click();
  await s.db.exec('RESET ROLE;UPDATE suspensions SET revision=revision+1;');await s.auth();
  await dialog.getByLabel('Partidos de sanción confirmados',{exact:true}).fill('3');
  await dialog.getByRole('button',{name:'Guardar decisión',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Los datos han cambiado');
  expect((await s.db.query('SELECT matches_total FROM suspensions WHERE player_id=$1',[s.player])).rows[0].matches_total).toBeNull();
});

test('editing the evaluation updates the same incident and sanction; player history retains yellow plus direct red',async({page})=>{
  const s=await setup(page);await saveIncident(page,'straight_red');
  const original=(await s.db.query('SELECT id FROM cards WHERE player_id=$1',[s.player])).rows[0].id;
  const sanction=(await s.db.query('SELECT id FROM suspensions WHERE player_id=$1',[s.player])).rows[0].id;
  await page.getByRole('button',{name:'← Anterior',exact:true}).click();
  await page.getByLabel('Tarjeta del jugador',{exact:true}).selectOption('yellow_red');
  await page.getByLabel('Partidos de sanción (si se conocen)',{exact:true}).fill('2');
  await page.getByRole('button',{name:'Siguiente jugador →',exact:true}).click();
  await expect.poll(async()=>(await s.db.query('SELECT discipline_kind FROM cards WHERE id=$1',[original])).rows[0].discipline_kind).toBe('yellow_red');
  expect((await s.db.query('SELECT id,matches_total FROM suspensions WHERE player_id=$1',[s.player])).rows).toEqual([{id:sanction,matches_total:2}]);
  await page.getByRole('button',{name:'Equipo',exact:true}).first().click();
  await page.getByRole('button',{name:/9\. Alex/}).click();
  await expect(page.getByText('1 amarillas en total histórico · 1 expulsiones',{exact:true})).toBeVisible();
  await page.getByText('Historial de tarjetas (1)',{exact:true}).click();
  await expect(page.getByText('Una amarilla + roja directa',{exact:true})).toBeVisible();
});

test('a legacy red marked served without evidence is explicitly reviewed without consuming the prior match',async({page})=>{
  const s=await setup(page);await s.db.exec('RESET ROLE;');
  await s.db.query("INSERT INTO suspensions(player_id,source,status,matches_total,matches_served,created_from_session_id) VALUES($1,'straight_red','served',1,1,$2)",[s.player,s.origin]);await s.auth();
  await page.getByRole('button',{name:'Inicio',exact:true}).first().click();
  await page.getByRole('button',{name:'Gestionar sanciones de Alex',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Revisar sanción histórica',exact:true}).click();
  await dialog.getByLabel('Partidos de sanción confirmados',{exact:true}).fill('');
  await dialog.getByLabel('Aplicable desde',{exact:true}).fill(await s.day(-9));
  await dialog.getByLabel('Resolución / notas',{exact:true}).fill('Se marcó cumplida sin un partido posterior; pendiente de resolución oficial');
  await dialog.getByLabel(/He revisado esta sanción histórica/).check();page.once('dialog',d=>d.accept());
  await dialog.getByRole('button',{name:'Guardar revisión histórica',exact:true}).click();
  await expect(dialog.getByText('0 verificados · Duración pendiente',{exact:true})).toBeVisible();
  const row=(await s.db.query('SELECT status,matches_served,needs_review FROM suspensions WHERE player_id=$1',[s.player])).rows[0];
  expect(row).toEqual({status:'awaiting_decision',matches_served:0,needs_review:false});
  expect((await s.db.query('SELECT count(*) AS n FROM discipline_service_matches')).rows[0].n).toBe(0);
});
