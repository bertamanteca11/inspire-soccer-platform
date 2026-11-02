const {test,expect}=require('@playwright/test');const fs=require('node:fs');const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const fixture=require('./evaluation.fixture.ts');
async function setup(page,{draft=false,denied=false,duplicateAttendance=false,slowConfirmation=false,alertCount=0,partialCallups=false,emptyCallups=false}={}){
  const writes=[],unexpected=[],errors=[];let evaluations=draft?[]:structuredClone(fixture.sportEvaluations);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(['localhost','127.0.0.1'].includes(url.hostname)){
      if(url.pathname==='/phase4-test')return route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/@vite/client"></script><script type="module" src="/tests/phase4.browser-harness.tsx"></script></body></html>'});
      return route.continue();
    }
    const table=url.pathname.split('/').pop();
    if(table==='batch4_workflow_access')return route.fulfill({json:true});
    if(table==='batch4_workflow_action'){
      const body=req.postDataJSON();writes.push({table,body});
      return route.fulfill({json:{id:body.p_session,[body.p_workflow+'_confirmed']:body.p_action==='confirm'}});
    }
    if(table==='create_yellow_accumulation_suspensions')return route.fulfill({json:null}); // Existing Home read-screen side effect is simulated only.
    if(!url.pathname.includes('/rest/v1/')){unexpected.push(url.pathname);return route.abort();}
    if(denied&&table==='callups')return route.fulfill({status:403,json:{code:'42501',message:'Eligibility read denied'}});
    if(slowConfirmation&&table==='evaluations'&&req.method()==='GET')await new Promise(resolve=>setTimeout(resolve,250));
    if(req.method()!=='GET'){
      writes.push({table,method:req.method(),body:req.postDataJSON()});
      if(table==='evaluations'){
        const body=req.postDataJSON();let changed;
        if(req.method()==='POST'){
          changed={id:'10000000-0000-4000-8000-000000009999',tactical_discipline:3,effort_commitment:3,decision_making:3,mentality_attitude:3,coachability:3,...body};evaluations.push(changed);
        }else{const id=url.searchParams.get('id')?.slice(3);evaluations=evaluations.map(e=>e.id===id?(changed={...e,...body}):e);}
        return route.fulfill({json:changed,status:200});
      }
      if(table==='sessions'&&req.method()==='PATCH')return route.fulfill({json:{id:url.searchParams.get('id')?.slice(3)}});
      unexpected.push('write '+table);return route.abort();
    }
    const visits=duplicateAttendance?[...fixture.sportAttendance,{...fixture.sportAttendance[0],id:'different-attendance-id'}]:fixture.sportAttendance;
    const tables={sessions:fixture.sportSessions,players:fixture.sportPlayers,callups:emptyCallups?[]:partialCallups?fixture.sportCallups.slice(0,1):fixture.sportCallups,attendance:visits,official_evaluations:evaluations,evaluations,cards:[],injuries:[],session_standouts:fixture.sportStandouts,staff_flags:[],must_win_reviews:[],active_suspensions:Array.from({length:alertCount},(_,i)=>({id:'suspension-'+i,display_name:'Suspended player '+i,matches_remaining:20-i}))};
    if(!Object.hasOwn(tables,table)){unexpected.push(table);return route.abort();}
    let rows=[...tables[table]];
    for(const key of ['id','session_id','player_id']){const f=url.searchParams.get(key);if(f?.startsWith('eq.'))rows=rows.filter(r=>r[key]===f.slice(3));}
    const a=Number(url.searchParams.get('offset')||0),b=Number(url.searchParams.get('limit')||500);
    return route.fulfill({json:rows.slice(a,a+b)});
  });
  return {writes,unexpected,errors,get evaluations(){return evaluations}};
}
test('editor only offers eligible participants and visibly exposes all five stored training qualities',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test?mode=evaluation');
  await expect(page.locator('.rating-player-row')).toHaveCount(1);
  await expect(page.locator('.rating-player-row')).toContainText('Alex eligible');
  const fifth=page.getByRole('option',{name:/E\. Capacidad de corrección/});await expect(fifth).toHaveCount(1);
  await page.locator('select').filter({has:fifth}).selectOption('4');
  await expect(page.getByRole('heading',{name:/E\. Capacidad de corrección/})).toBeVisible();
  await expect(page.getByRole('button',{name:'3',exact:true})).toHaveClass(/active/);
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test('missing evaluation is not defaulted or confirmed and explicit scoring excludes database defaults',async({page})=>{
  const state=await setup(page,{draft:true});await page.goto('/phase4-test?mode=evaluation&draft=new');
  await expect(page.locator('.rating-player-row')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'3',exact:true})).not.toHaveClass(/active/);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Confirmar evaluación',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'falta una evaluacion explicita'})).toBeVisible();expect(state.writes).toEqual([]);
  await page.getByRole('button',{name:'4',exact:true}).click();
  await expect(page.getByText('Cambios guardados correctamente',{exact:true})).toBeVisible();
  const saved=state.evaluations[0];expect(saved.evaluated).toBe(false);expect(saved.na_fields.coachability).toBe(true);expect(saved.na_fields.tactical_discipline).toBe(false);expect(saved.tactical_discipline).toBe(4);
  expect(state.writes.every(w=>w.table==='evaluations')).toBe(true);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test('Summary and Reports agree on eligible player average and exclude out-of-scope evaluations',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test');
  await page.getByLabel('Jugador del resumen').selectOption(fixture.sportPlayers[0].id);
  await page.getByLabel('Desde',{exact:true}).fill('2026-10-19');await page.getByLabel('Hasta',{exact:true}).fill('2026-10-25');
  for(const s of fixture.sportSessions.slice(0,2))await page.getByRole('checkbox',{name:new RegExp(s.id)}).check();
  const card=page.locator('.card').filter({has:page.getByText('Mejores jugadores del ámbito',{exact:true})});
  await expect(card.locator('.top-row')).toHaveCount(1);await expect(card.locator('.top-row')).toContainText('3.8');
  await page.goto('/phase4-test?mode=reports');await page.getByLabel('Desde',{exact:true}).fill('2026-10-19');await page.getByLabel('Hasta',{exact:true}).fill('2026-10-25');
  await page.getByRole('button',{name:'Generar informe',exact:true}).click();
  await expect(page.getByText('Sesiones: 2 · Evaluaciones: 2 · Media: 3.80',{exact:true})).toBeVisible();
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test('weekly reporting includes Sunday, excludes next Monday and retains its distinct weighted formula',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test?mode=intelligence');
  await page.getByLabel('Lunes de la semana').fill('2026-10-19');
  const row=page.locator('.weekly-person').filter({has:page.getByText('Alex eligible',{exact:true})});
  await expect(row.locator('.weekly-score')).toContainText('9.6'); // 4.6 + 3 + subjective Top 2, not a mean.
  await page.getByLabel('Lunes de la semana').fill('2026-10-26');
  await expect(row.locator('.weekly-score')).toContainText('5.0');
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test('eligibility read errors block editor and Summary instead of counting unchecked scores',async({page})=>{
  const state=await setup(page,{denied:true});await page.goto('/phase4-test?mode=evaluation');
  await expect(page.getByRole('alert')).toContainText('Eligibility read denied');await expect(page.locator('.rating-player-row')).toHaveCount(0);
  await page.goto('/phase4-test');await expect(page.getByRole('alert')).toContainText('Eligibility read denied');
  await expect(page.getByText('Mejores jugadores del ámbito',{exact:true})).toHaveCount(0);
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('original ineligible evaluations remain readable in history without entering operational averages',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test');
  await page.getByRole('button',{name:'Historial completo',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Evaluaciones originales conservadas'})).toBeVisible();
  await page.getByText('15 evaluaciones originales',{exact:true}).click();
  await expect(page.locator('details strong').filter({hasText:'Bruno no convocado'}).first()).toBeVisible();
  const ranking=page.locator('.card').filter({has:page.getByText('Mejores jugadores del ámbito',{exact:true})});
  await expect(ranking.locator('.top-row')).toHaveCount(1);await expect(ranking.locator('.top-row')).toContainText('Alex eligible');
  expect(state.evaluations).toEqual(fixture.sportEvaluations);expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('Home training ranking uses the same eligible evaluation mean as Summary and Reports',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test?mode=home');
  await page.getByRole('button',{name:'Entrenos',exact:true}).click();
  await expect(page.locator('.top-row')).toHaveCount(1);
  await expect(page.locator('.top-row')).toContainText('Alex eligible');
  await expect(page.locator('.top-row')).toContainText('4.20'); // All three completed training sessions.
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('ambiguous duplicate attendance leaves weekly scoring pending instead of inventing a penalty',async({page})=>{
  const state=await setup(page,{duplicateAttendance:true});await page.goto('/phase4-test?mode=intelligence');
  await page.getByLabel('Lunes de la semana').fill('2026-10-19');
  await expect(page.getByText(/Asistencias duplicadas:/)).toBeVisible();
  await expect(page.locator('.weekly-person')).toHaveCount(0);
  const activity=page.locator('.weekly-metric').filter({has:page.getByText('Jugadores con actividad registrada',{exact:true})});
  await expect(activity.locator('strong')).toHaveText('Pendiente');
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('confirmation never fills or overwrites explicit historical ratings',async({page})=>{
  const state=await setup(page);await page.goto('/phase4-test?mode=evaluation');
  await expect(page.locator('.rating-player-row')).toHaveCount(1);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Confirmar evaluación',exact:true}).click();
  await expect(page.getByRole('button',{name:'Evaluación confirmada',exact:true})).toBeVisible();
  expect(state.evaluations).toEqual(fixture.sportEvaluations);
  expect(state.writes).toHaveLength(1);expect(state.writes[0].table).toBe('batch4_workflow_action');
  expect(state.writes[0].body).toMatchObject({p_workflow:'evaluation',p_action:'confirm'});
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('confirmation disables edits while validating and submits the session only once',async({page})=>{
  const state=await setup(page,{slowConfirmation:true});await page.goto('/phase4-test?mode=evaluation');
  await expect(page.locator('.rating-player-row')).toHaveCount(1);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Confirmar evaluación',exact:true}).click();
  await expect(page.getByRole('button',{name:'Verificando evaluación…',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'4',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Evaluación confirmada',exact:true})).toBeVisible();
  expect(state.writes.filter(w=>w.table==='batch4_workflow_action')).toHaveLength(1);
  expect(state.evaluations).toEqual(fixture.sportEvaluations);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

for(const role of ['admin','coach','viewer']) for(const width of [320,360,390]) test(`Home cleanup ${role} at ${width}px preserves shortcut destinations and session`,async({page},info)=>{
  const state=await setup(page); await page.setViewportSize({width,height:740}); await page.goto(`/phase4-test?mode=home&shell=1&long=1&role=${role}`);
  await expect(page.locator('.club-header h1')).toHaveText('Inicio');
  await expect(page.locator('.club-header')).not.toContainText('Hospitalense');
  const shortcuts=page.getByRole('navigation',{name:'Acciones de la sesión seleccionada'});
  await expect(shortcuts).toHaveCount(1);
  expect(await shortcuts.evaluate(node=>node.parentElement.previousElementSibling?.classList.contains('hero-card'))).toBe(true);
  await expect(shortcuts.getByRole('button')).toHaveText(role==='viewer'?['Asistencia','Evaluar']:['Convocatoria','Asistencia','Evaluar']);
  await expect(page.getByRole('button',{name:'Preparar convocatoria',exact:true})).toHaveCount(0);
  await expect(page.getByText('Rendimiento oficial desde el 14/10/2026',{exact:true})).toBeVisible();
  for(const [name,destination] of (role==='viewer'?[['Asistencia','attendance'],['Evaluar','evaluation']]:[['Convocatoria','callup'],['Asistencia','attendance'],['Evaluar','evaluation']])){
    await shortcuts.getByRole('button',{name,exact:true}).click();
    await expect(page.getByTestId('requested-destination')).toHaveText(destination);
    await expect(page.getByTestId('preserved-session')).toHaveText(fixture.sportSessions[1].id);
  }
  if(role==='admin'&&width===360)await page.screenshot({path:info.outputPath('home-cleanup-360.png'),fullPage:true});
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(node=>node.getBoundingClientRect().right>innerWidth+1).slice(0,6).map(node=>node.tagName+'.'+node.className));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),JSON.stringify(overflow)).toBe(true);
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('Home alerts expand 2 to 5 to 10 and beyond without losing source order or content',async({page})=>{
  const state=await setup(page,{alertCount:3}); await page.setViewportSize({width:360,height:740}); await page.goto('/phase4-test?mode=home&shell=1&alerts=1');
  const list=page.locator('.home-alert-list'); await expect(list.locator(':scope > div')).toHaveCount(2);
  await expect(list).toContainText('Suspended player 0'); await expect(list).toContainText('Suspended player 1');
  await page.getByRole('button',{name:'Ver 5 avisos',exact:true}).click(); await expect(list.locator(':scope > div')).toHaveCount(5);
  await page.getByRole('button',{name:'Ver 10 avisos',exact:true}).click(); await expect(list.locator(':scope > div')).toHaveCount(10);
  await page.getByRole('button',{name:'Ver 14 avisos',exact:true}).click(); await expect(list.locator(':scope > div')).toHaveCount(14);
  await expect(list.locator('strong')).toHaveText([...Array.from({length:3},(_,i)=>'Suspended player '+i),...Array.from({length:11},(_,i)=>'Card player '+i)]);
  await expect(list).toContainText('20 partido(s) sanción');
  await page.getByRole('button',{name:'Mostrar solo 2'}).click(); await expect(list.locator(':scope > div')).toHaveCount(2);
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

for(const [mode,title] of [['callup','Convocatoria'],['attendance','Asistencia'],['evaluation','Evaluación']]) test(`${mode} has session context inside content and a title-only global header`,async({page})=>{
  const state=await setup(page); await page.setViewportSize({width:320,height:740}); await page.goto(`/phase4-test?mode=${mode}&shell=1&long=1`);
  await expect(page.locator('.club-header h1')).toHaveText(title);
  await expect(page.locator('.club-main .page-title h2')).toHaveCount(1);
  await expect(page.locator('.club-main .page-title h2')).toContainText("vs L'Hospitalense");
  await expect(page.locator('.club-main .page-title h2')).not.toContainText(title+':');
  await expect(page.locator('.club-header')).not.toContainText('Partido domingo');
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('callup missing-row semantics remain unchanged while suspensions expand progressively',async({page})=>{
  const state=await setup(page,{partialCallups:true,alertCount:7}); await page.goto('/phase4-test?mode=callup&shell=1&draft-callup=1');
  await expect(page.getByRole('button',{name:'Sin registro',exact:true})).toHaveCount(4);
  await expect(page.locator('.home-alert-list > div')).toHaveCount(2);
  await page.getByRole('button',{name:'Ver 5 avisos',exact:true}).click(); await expect(page.locator('.home-alert-list > div')).toHaveCount(5);
  await page.getByRole('button',{name:'Ver 7 avisos',exact:true}).click(); await expect(page.locator('.home-alert-list > div')).toHaveCount(7);
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('empty unmarked callup retains unknown historical records without persisting them',async({page})=>{
  const state=await setup(page,{emptyCallups:true}); await page.goto('/phase4-test?mode=callup&draft-callup=1');
  await expect(page.getByRole('button',{name:'Sin registro',exact:true})).toHaveCount(5);
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('evaluation read failures retain selected-session context and visible errors',async({page})=>{
  const state=await setup(page,{denied:true}); await page.setViewportSize({width:360,height:740}); await page.goto('/phase4-test?mode=evaluation&shell=1&long=1');
  await expect(page.getByRole('alert')).toContainText('No se pudo verificar la elegibilidad');
  await expect(page.locator('.club-main .page-title h2')).toContainText("vs L'Hospitalense");
  expect(state.writes).toEqual([]);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
