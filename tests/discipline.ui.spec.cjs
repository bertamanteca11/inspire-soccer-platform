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
  await expect(dialog.getByLabel('Partidos de sanción',{exact:true})).toHaveValue('');
  const editor=dialog.getByRole('region',{name:'Editar sanción'});
  await editor.getByLabel('Partidos de sanción',{exact:true}).fill('2');
  await editor.getByLabel('Fecha del primer partido de sanción',{exact:true}).fill(await s.day(-9));
  await expect(editor.getByLabel('Fecha de la resolución',{exact:true})).toBeHidden();
  await expect(editor.getByRole('combobox',{name:'Partido cumplido',exact:true})).toBeHidden();
  await editor.getByRole('button',{name:'Guardar sanción',exact:true}).click();
  await expect(editor.getByText('Cumplidos: 0 / 2 · Quedan 2',{exact:true})).toBeVisible();
  expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('discipline-mobile-decision.png'),fullPage:true});
  for(const sid of [s.id(41),s.id(42)]){
    await editor.getByText('Registrar partido cumplido',{exact:true}).click();
    if(sid===s.id(41))await expect(editor.getByLabel('Partido cumplido').locator('option')).toHaveCount(3);
    await editor.getByRole('combobox',{name:'Partido cumplido',exact:true}).selectOption(sid);
    await editor.getByLabel('Confirmo que no jugó por esta sanción.',{exact:true}).check();
    await editor.getByLabel('Comentario del cumplimiento',{exact:true}).fill('No participó: partido cumplido de esta resolución');
    await editor.getByRole('button',{name:'Guardar partido cumplido',exact:true}).click();
    await expect.poll(async()=>Number((await s.db.query('SELECT count(*) AS n FROM discipline_service_matches WHERE player_id=$1 AND revoked_at IS NULL',[s.player])).rows[0].n)).toBe(sid===s.id(41)?1:2);
    await expect(editor.getByText(`Cumplidos: ${sid===s.id(41)?1:2} / 2 · Quedan ${sid===s.id(41)?1:0}`,{exact:true})).toBeVisible();
  }
  await expect(editor.getByText('Registrar partido cumplido',{exact:true})).toHaveCount(0);
  const row=(await s.db.query('SELECT status,matches_served FROM suspensions WHERE player_id=$1',[s.player])).rows[0];expect(row).toEqual({status:'served',matches_served:2});
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  await expect(page.locator('.home-discipline-entry')).toContainText('1 amarillas en total');
  await expect(page.getByRole('button',{name:'Gestionar sanciones de Alex',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('discipline-mobile-after-service.png'),fullPage:true});
});

test('opening and cancelling the decision editor performs no writes and stale decisions remain visibly rejected',async({page})=>{
  const s=await setup(page);await saveIncident(page,'straight_red');
  await page.getByRole('button',{name:'Inicio',exact:true}).first().click();
  await page.getByRole('button',{name:'Gestionar sanciones de Alex',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Partidos de sanción',{exact:true})).toBeVisible();
  const before=s.writes.length;await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();expect(s.writes.length).toBe(before);
  await page.getByRole('button',{name:'Gestionar sanciones de Alex',exact:true}).click();
  await dialog.getByLabel('Partidos de sanción',{exact:true}).fill('3');
  await dialog.getByText('Más opciones',{exact:true}).click();
  page.once('dialog',confirmation=>confirmation.dismiss());
  await dialog.getByRole('button',{name:'Actualizar sanciones',exact:true}).click();
  await expect(dialog.getByLabel('Partidos de sanción',{exact:true})).toHaveValue('3');
  page.once('dialog',confirmation=>confirmation.accept());
  await dialog.getByRole('button',{name:'Actualizar sanciones',exact:true}).click();
  await expect(dialog.getByLabel('Partidos de sanción',{exact:true})).toHaveValue('');
  expect(s.writes.length).toBe(before);
  await dialog.getByLabel('Partidos de sanción',{exact:true}).fill('3');
  page.once('dialog',confirmation=>confirmation.accept());
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  expect(s.writes.length).toBe(before);
  await page.getByRole('button',{name:'Gestionar sanciones de Alex',exact:true}).click();
  await expect(dialog.getByLabel('Partidos de sanción',{exact:true})).toHaveValue('');
  await s.db.exec('RESET ROLE;UPDATE suspensions SET revision=revision+1;');await s.auth();
  await dialog.getByLabel('Partidos de sanción',{exact:true}).fill('3');
  await dialog.getByRole('button',{name:'Guardar sanción',exact:true}).click();
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
  await expect(page.getByRole('button',{name:'Gestionar sanciones de Alex',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Equipo',exact:true}).first().click();await page.getByRole('button',{name:/9\. Alex/}).click();
  await page.getByText('Sanciones anteriores (1)',{exact:true}).click();
  await page.getByRole('button',{name:'Consultar historial de sanciones',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByText('Sanciones anteriores (1)',{exact:true}).click();
  await dialog.getByRole('button',{name:'Revisar registro anterior',exact:true}).click();
  await dialog.getByLabel('Partidos de sanción',{exact:true}).fill('');
  await dialog.getByLabel('Fecha del primer partido de sanción',{exact:true}).fill(await s.day(-9));
  const beforeReview=s.writes.length;
  await expect(dialog.getByRole('button',{name:'Guardar sanción',exact:true})).toBeDisabled();
  expect(s.writes.length).toBe(beforeReview);
  await dialog.getByLabel(/He revisado los partidos cumplidos/).check();
  await expect(dialog.getByRole('button',{name:'Guardar revisión',exact:true})).toBeDisabled();
  await dialog.getByLabel('Motivo de la revisión',{exact:true}).fill('Se marcó cumplida sin un partido posterior; pendiente de resolución oficial');page.once('dialog',d=>d.accept());
  await dialog.getByRole('button',{name:'Guardar revisión',exact:true}).click();
  await expect(dialog.getByText('0 partidos cumplidos · Duración pendiente',{exact:true})).toBeVisible();
  const row=(await s.db.query('SELECT status,matches_served,needs_review FROM suspensions WHERE player_id=$1',[s.player])).rows[0];
  expect(row).toEqual({status:'awaiting_decision',matches_served:0,needs_review:false});
  expect((await s.db.query('SELECT count(*) AS n FROM discipline_service_matches')).rows[0].n).toBe(0);
});

for(const role of ['coach','admin'])test(`${role}: yellow history and old completed or cancelled cases never show an active Sanction button`,async({page})=>{
  const s=await setup(page,role);await saveIncident(page,'yellow');
  await s.db.exec('RESET ROLE;');
  await s.db.query("INSERT INTO cards(player_id,session_id,type) VALUES($1,$2,'straight_red')",[s.other,s.origin]);
  for(const status of ['served','cancelled'])await s.db.query("INSERT INTO suspensions(player_id,source,status,matches_total,matches_served,created_from_session_id) VALUES($1,'straight_red',$2,1,$3,$4)",[s.other,status,status==='served'?1:0,s.origin]);
  await s.auth();await page.getByRole('button',{name:'Inicio',exact:true}).first().click();
  await expect(page.locator('.home-discipline-entry').filter({hasText:'Alex'})).toContainText('1 amarillas en total');
  await expect(page.locator('.home-discipline-entry').filter({hasText:'Bruno'})).toContainText('1 expulsiones');
  await expect(page.getByRole('button',{name:/^Gestionar sanciones de /})).toHaveCount(0);
  await page.getByRole('button',{name:'Equipo',exact:true}).first().click();await page.getByRole('button',{name:/9\. Alex/}).click();
  await expect(page.getByText('1 amarillas en total histórico · 0 expulsiones',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Sanciones de Alex',exact:true})).toHaveCount(0);
  await s.db.exec('RESET ROLE;');
  await s.db.query("INSERT INTO suspensions(player_id,source,status,matches_total,needs_review,created_from_session_id) VALUES($1,'manual','awaiting_decision',NULL,false,$2)",[s.other,s.origin]);
  await s.auth();await page.getByRole('button',{name:'Inicio',exact:true}).first().click();
  await page.getByRole('button',{name:'Gestionar sanciones de Bruno',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Sanciones de Bruno',exact:true});
  await expect(dialog.getByLabel('Partidos de sanción',{exact:true})).toBeVisible();
  await expect(dialog.locator('input:visible')).toHaveCount(2);
  await expect(dialog.getByRole('button',{name:'Ver / editar sanción',exact:true})).toHaveCount(0);
  await expect(dialog.getByLabel('Notas',{exact:true})).toBeHidden();
  await dialog.getByText('Notas y otras opciones',{exact:true}).click();
  await dialog.getByLabel('Cancelar esta sanción',{exact:true}).check();
  await dialog.getByRole('button',{name:'Guardar sanción',exact:true}).click();
  await expect(dialog.getByText('Sanción cancelada',{exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  await expect(page.getByRole('button',{name:/^Gestionar sanciones de /})).toHaveCount(0);
});

for(const role of ['coach','admin'])test(`${role}: an old unserved dismissal saves a three-match decision and explicitly serves two later games without a historical-review dead end`,async({page},info)=>{
  await page.setViewportSize({width:360,height:844});const s=await setup(page,role);await saveIncident(page,'straight_red');
  await s.db.exec('RESET ROLE;');
  await s.db.query("UPDATE suspensions SET needs_review=true,matches_total=1,status='active',applicable_from=(SELECT session_date FROM sessions WHERE id=$2) WHERE player_id=$1",[s.player,s.id(41)]);await s.auth();
  const original=(await s.db.query('SELECT id FROM suspensions WHERE player_id=$1',[s.player])).rows[0].id;
  await page.getByRole('button',{name:'Inicio',exact:true}).first().click();
  await page.getByRole('button',{name:'Gestionar sanciones de Alex',exact:true}).click();
  const dialog=page.getByRole('dialog'),editor=dialog.getByRole('region',{name:'Editar sanción'});
  await expect(editor.getByText('Registrar partido cumplido',{exact:true})).toBeVisible();
  const actionBox=await editor.getByText('Registrar partido cumplido',{exact:true}).boundingBox();expect(actionBox.y).toBeLessThan(600);
  await expect(editor.getByLabel(/He revisado los partidos cumplidos/)).toHaveCount(0);
  await editor.getByText('Registrar partido cumplido',{exact:true}).click();
  await expect(editor.getByRole('combobox',{name:'Partido cumplido',exact:true})).toBeDisabled();
  await expect(editor.getByRole('button',{name:'Guardar partido cumplido',exact:true})).toBeDisabled();
  await editor.getByText('Registrar partido cumplido',{exact:true}).click();
  await editor.getByLabel('Partidos de sanción',{exact:true}).fill('3');
  await editor.getByLabel('Fecha del primer partido de sanción',{exact:true}).fill(await s.day(-7));
  await expect(editor.getByText('Cambios sin guardar. Pulsa «Guardar sanción» para conservarlos al cerrar.',{exact:true})).toBeVisible();
  const noWrite=s.writes.length;
  page.once('dialog',dialog=>dialog.dismiss());
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  await expect(dialog).toBeVisible();
  expect(s.writes.length).toBe(noWrite);
  await expect(editor.getByLabel('Partidos de sanción',{exact:true})).toHaveValue('3');
  await expect(editor.getByRole('button',{name:'Guardar sanción',exact:true})).toBeEnabled();
  await editor.getByRole('button',{name:'Guardar sanción',exact:true}).click();
  await expect(editor.getByText('Cumplidos: 0 / 3 · Quedan 3',{exact:true})).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('3 partidos de sanción. 0 partidos cumplidos registrados.');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  const reviewed=(await s.db.query('SELECT id,matches_total,matches_served,needs_review,status FROM suspensions WHERE player_id=$1',[s.player])).rows;
  expect(reviewed).toEqual([{id:original,matches_total:3,matches_served:0,needs_review:false,status:'active'}]);
  for(const [index,sid]of [s.id(41),s.id(42)].entries()){
    await editor.getByText('Registrar partido cumplido',{exact:true}).click();
    await editor.getByRole('combobox',{name:'Partido cumplido',exact:true}).selectOption(sid);
    await editor.getByLabel('Confirmo que no jugó por esta sanción.',{exact:true}).check();
    await editor.getByLabel('Comentario del cumplimiento',{exact:true}).fill('Partido de liga cumplido de esta sanción');
    await editor.getByRole('button',{name:'Guardar partido cumplido',exact:true}).click();
    await expect(editor.getByText(`Cumplidos: ${index+1} / 3 · Quedan ${2-index}`,{exact:true})).toBeVisible();
  }
  expect((await s.db.query('SELECT matches_total,matches_served,status FROM suspensions WHERE id=$1',[original])).rows[0]).toEqual({matches_total:3,matches_served:2,status:'partially_served'});
  expect((await s.db.query('SELECT count(*) AS n FROM cards WHERE player_id=$1',[s.player])).rows[0].n).toBe(1);
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.getByRole('button',{name:'Gestionar sanciones de Alex',exact:true}).click();
  await expect(editor.getByLabel('Partidos de sanción',{exact:true})).toHaveValue('3');
  await expect(editor.getByText('Cumplidos: 2 / 3 · Quedan 1',{exact:true})).toBeVisible();
  expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('legacy-three-matches-two-served.png'),fullPage:true});
});

for(const role of ['coach','admin'])test(`${role}: a prior-season external sanction is created from an injured player's profile, persists after reopening and serves only the explicitly verified game`,async({page},info)=>{
  await page.setViewportSize({width:360,height:844});const s=await setup(page,role);
  await s.db.exec('RESET ROLE;');
  await s.db.query("UPDATE players SET status='injured' WHERE id=$1",[s.player]);await s.auth();
  await page.getByRole('button',{name:'Equipo',exact:true}).first().click();
  await page.getByRole('button',{name:/9\. Alex/}).click();
  await expect(page.getByRole('button',{name:'Sanciones de Alex',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Registrar sanción anterior / externa',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Sanciones de Alex',exact:true}),editor=dialog.getByRole('region',{name:'Editar sanción'});
  await expect(editor.getByRole('heading',{name:'Sanción anterior o de otro equipo',exact:true})).toBeVisible();
  await expect(editor.getByLabel('Motivo y referencia de la sanción',{exact:true})).toBeVisible();
  await editor.getByLabel('Partidos de sanción',{exact:true}).fill('2');
  await editor.getByLabel('Fecha del primer partido de sanción',{exact:true}).fill(await s.day(-7));
  await editor.getByRole('button',{name:'Guardar sanción',exact:true}).click();
  expect((await s.db.query('SELECT count(*) AS n FROM suspensions WHERE player_id=$1',[s.player])).rows[0].n).toBe(0);
  await editor.getByLabel('Motivo y referencia de la sanción',{exact:true}).fill('Resolución: roja directa de la temporada anterior, dos partidos; primera ficha con este equipo.');
  await editor.getByRole('button',{name:'Guardar sanción',exact:true}).click();
  await expect(editor.getByText('Cumplidos: 0 / 2 · Quedan 2',{exact:true})).toBeVisible();
  const original=(await s.db.query('SELECT id FROM suspensions WHERE player_id=$1',[s.player])).rows[0].id;
  await editor.getByText('Registrar partido cumplido',{exact:true}).click();
  await editor.getByRole('combobox',{name:'Partido cumplido',exact:true}).selectOption(s.id(41));
  await editor.getByLabel('Confirmo que no jugó por esta sanción.',{exact:true}).check();
  await editor.getByLabel('Comentario del cumplimiento',{exact:true}).fill('Primer partido cumplido, confirmado por la responsable según la resolución anterior.');
  await editor.getByRole('button',{name:'Guardar partido cumplido',exact:true}).click();
  await expect(editor.getByText('Cumplidos: 1 / 2 · Quedan 1',{exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.reload();
  await expect(page.getByRole('heading',{level:1})).toHaveText('Evaluación');
  await page.getByRole('button',{name:'Inicio',exact:true}).first().click();
  await page.getByRole('button',{name:'Gestionar sanciones de Alex',exact:true}).click();
  await expect(editor.getByLabel('Partidos de sanción',{exact:true})).toHaveValue('2');
  await expect(editor.getByText('Cumplidos: 1 / 2 · Quedan 1',{exact:true})).toBeVisible();
  const row=(await s.db.query('SELECT id,source,created_from_session_id,matches_total,matches_served,status FROM suspensions WHERE player_id=$1',[s.player])).rows;
  expect(row).toEqual([{id:original,source:'manual',created_from_session_id:null,matches_total:2,matches_served:1,status:'partially_served'}]);
  expect((await s.db.query('SELECT count(*) AS n FROM cards WHERE player_id=$1',[s.player])).rows[0].n).toBe(0);
  expect((await s.db.query('SELECT session_id FROM discipline_service_matches WHERE player_id=$1 AND revoked_at IS NULL',[s.player])).rows).toEqual([{session_id:s.id(41)}]);
  expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('external-sanction-one-of-two-served.png'),fullPage:true});
});

test('matches served before the official length is announced remain linked to the same case when three matches are confirmed later',async({page})=>{
  const s=await setup(page);await saveIncident(page,'straight_red');
  await page.getByRole('button',{name:'Inicio',exact:true}).first().click();
  await page.getByRole('button',{name:'Gestionar sanciones de Alex',exact:true}).click();
  const editor=page.getByRole('region',{name:'Editar sanción'});
  await editor.getByLabel('Fecha del primer partido de sanción',{exact:true}).fill(await s.day(-7));
  await editor.getByRole('button',{name:'Guardar sanción',exact:true}).click();
  await expect(editor.getByText('0 partidos cumplidos · Duración pendiente',{exact:true})).toBeVisible();
  const original=(await s.db.query('SELECT id FROM suspensions WHERE player_id=$1',[s.player])).rows[0].id;
  for(const [index,sid]of [s.id(41),s.id(42)].entries()){
    await editor.getByText('Registrar partido cumplido',{exact:true}).click();
    await editor.getByRole('combobox',{name:'Partido cumplido',exact:true}).selectOption(sid);
    await editor.getByLabel('Confirmo que no jugó por esta sanción.',{exact:true}).check();
    await editor.getByLabel('Comentario del cumplimiento',{exact:true}).fill('Cumplimiento confirmado; duración oficial todavía pendiente');
    await editor.getByRole('button',{name:'Guardar partido cumplido',exact:true}).click();
    await expect(editor.getByText(`${index+1} partidos cumplidos · Duración pendiente`,{exact:true})).toBeVisible();
  }
  const before=(await s.db.query('SELECT matches_total,matches_served,status FROM suspensions WHERE id=$1',[original])).rows[0];
  expect(before).toEqual({matches_total:null,matches_served:2,status:'awaiting_decision'});
  await editor.getByLabel('Partidos de sanción',{exact:true}).fill('3');
  await editor.getByRole('button',{name:'Guardar sanción',exact:true}).click();
  await expect(editor.getByText('Cumplidos: 2 / 3 · Quedan 1',{exact:true})).toBeVisible();
  expect((await s.db.query('SELECT id FROM suspensions WHERE player_id=$1',[s.player])).rows).toEqual([{id:original}]);
  expect((await s.db.query('SELECT count(*) AS n FROM discipline_service_matches WHERE suspension_id=$1 AND revoked_at IS NULL',[original])).rows[0].n).toBe(2);
});
