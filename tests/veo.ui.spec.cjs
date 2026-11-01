const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const fixture = path.resolve('data/BIG DATA EQUIPO.xlsx');

async function loginLocally(page, role = 'admin', backend = null) {
  const unexpected = [];
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    // No requests reach Supabase. Only mock authentication and the role lookup.
    if (url.pathname.endsWith('/auth/v1/token')) {
      const user = { id: '11111111-1111-4111-8111-111111111111', email: 'preview-test@example.invalid',
        aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
      const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600, role: 'authenticated' })).toString('base64url');
      return route.fulfill({ json: { access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test`,
        token_type: 'bearer', expires_in: 3600, refresh_token: 'local-test-only', user } });
    }
    if (url.pathname.endsWith('/rest/v1/profiles') && request.method() === 'GET') return route.fulfill({ json: { role } });
    if (backend && await backend(route, url)) return;
    if (url.pathname.endsWith('/rest/v1/rpc/veo_status')) return route.fulfill({ status:404, json:{ code:'PGRST202', message:'VEO not installed in local test' } });
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort();
  });
  await page.goto('/?veo-preview=1');
  await page.getByPlaceholder('Email', { exact: true }).fill('preview-test@example.invalid');
  await page.getByPlaceholder('Contraseña', { exact: true }).fill('local-test-only');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  return { unexpected, browserErrors };
}

test('admin reads the real workbook through the worker, inspects warnings, clears and reimports', async ({ page }) => {
  test.skip(!fs.existsSync(fixture), 'Private source workbook not present locally');
  const { unexpected, browserErrors } = await loginLocally(page);
  await expect(page.getByRole('heading', { name: 'VEO · Previsualización de Excel' })).toBeVisible();
  await page.getByLabel('Libro Excel (.xlsx, máximo 10 MB)').setInputFiles(fixture);
  await expect(page.getByRole('status').filter({ hasText: '23 observaciones' })).toBeVisible();
  const checks = page.getByRole('heading', { name: 'Reconciliación del piloto Alzamora' }).locator('..');
  await expect(checks.getByRole('cell', { name: 'Coincide', exact: true })).toHaveCount(14);
  await expect(page.getByText('Pol Pariente #11 (perfil)', { exact: true }).first()).toBeVisible();
  await page.getByRole('combobox', { name: 'Gravedad', exact: true }).selectOption('warning');
  await page.getByLabel('Buscar incidencia').fill('segundo');
  await expect(page.locator('.veo-issue')).toHaveCount(1);
  await expect(page.locator('.veo-issue')).toContainText('Montoro');
  const hash = await page.locator('.veo-hash').textContent();
  await page.getByRole('button', { name: 'Limpiar previsualización' }).click();
  await expect(page.locator('.veo-hash')).toHaveCount(0);
  await page.getByLabel('Libro Excel (.xlsx, máximo 10 MB)').setInputFiles(fixture);
  await expect(page.locator('.veo-hash')).toHaveText(hash);
  await expect(checks.getByRole('cell', { name: 'Coincide', exact: true })).toHaveCount(14);
  expect(unexpected).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test('viewer cannot select a workbook, even through the direct URL', async ({ page }) => {
  const { unexpected } = await loginLocally(page, 'viewer');
  await expect(page.getByRole('alert')).toContainText('administradores autenticados');
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  expect(unexpected).toEqual([]);
});

test('malformed XLSX reports an error and allows another selection', async ({ page }) => {
  const { unexpected, browserErrors } = await loginLocally(page);
  const input = page.getByLabel('Libro Excel (.xlsx, máximo 10 MB)');
  await expect(input).toBeVisible();
  await input.setInputFiles({ name: 'broken.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('not a workbook') });
  await expect(page.getByRole('alert')).toContainText('contenedor .xlsx');
  await expect(input).toBeEnabled();
  expect(unexpected).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test('mobile preview keeps horizontal overflow inside its tables', async ({ page }) => {
  test.skip(!fs.existsSync(fixture), 'Private source workbook not present locally');
  await page.setViewportSize({ width: 390, height: 844 });
  const { unexpected, browserErrors } = await loginLocally(page);
  await page.getByLabel('Libro Excel (.xlsx, máximo 10 MB)').setInputFiles(fixture);
  await expect(page.getByRole('status').filter({ hasText: '23 observaciones' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '.veo-test-artifacts/veo-preview-mobile.png', fullPage: true });
  expect(unexpected).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test('all six local analytics sections work on mobile without persistence', async ({ page }) => {
  test.skip(!fs.existsSync(fixture), 'Private workbook absent');
  await page.setViewportSize({width:390,height:844});
  const {unexpected,browserErrors}=await loginLocally(page);
  await page.getByLabel('Libro Excel (.xlsx, máximo 10 MB)').setInputFiles(fixture);
  await expect(page.getByRole('status').filter({hasText:'23 observaciones'})).toBeVisible();
  const sections=[['Dashboard','Balance de resultados'],['Partidos','Partidos importados'],['Jugadores','Analítica individual VEO'],['Rankings y comparación','Rankings deportivos'],['Primas','Primas calculadas · no son pagos'],['Importación','VEO · Previsualización de Excel']];
  for(const [name,heading] of sections){
    await page.getByRole('navigation',{name:'Secciones VEO'}).getByRole('button',{name,exact:true}).click();
    await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:`.veo-test-artifacts/veo-${name.split(' ')[0]}-mobile.png`,fullPage:true});
  }
  expect(unexpected).toEqual([]);expect(browserErrors).toEqual([]);
});

test('reviewed mappings, explicit publication, published analytics, safe reimport and withdrawal',async({page,browser})=>{
  test.skip(!fs.existsSync(fixture), 'Private workbook absent');
  const {browserBackend}=require('./veo.browser-fixture.cjs');
  const backend=browserBackend();
  const {unexpected,browserErrors}=await loginLocally(page,'admin',backend.handler);
  await expect(page.getByText('No hay lotes publicados.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Volver a comprobar'})).toHaveCount(0);
  await page.getByLabel('Libro Excel (.xlsx, máximo 10 MB)').setInputFiles(fixture);
  await expect(page.getByRole('status').filter({hasText:'23 observaciones'})).toBeVisible();
  const identities=page.getByRole('combobox',{name:/^Correspondencia /});
  await expect(identities).toHaveCount(23);
  for(let i=0;i<23;i++){
    await expect(identities.nth(i)).toHaveValue('');
    await identities.nth(i).selectOption(backend.players[i].id);
  }
  await page.getByRole('combobox',{name:'Sesión jornada 5'}).selectOption(backend.session.id);
  const publish=page.getByRole('button',{name:'Publicar lote aprobado'});
  await expect(publish).toBeDisabled();expect(backend.state.writes.length).toBe(0);
  await page.getByRole('checkbox',{name:/He revisado identidades/}).check();
  await expect(publish).toBeEnabled();await publish.click();
  await expect(page.getByRole('status').filter({hasText:/publicado de forma atómica/})).toBeVisible();
  expect(backend.state.writes.length).toBe(1);expect(backend.state.writes[0].p_approved).toBe(true);
  await expect(page.getByRole('combobox',{name:'Origen',exact:true})).toHaveValue('published');
  // Reload discards the file in memory and reconstructs all analytics from the
  // persisted backend, using the saved authenticated session.
  await page.reload();
  await expect(page.getByRole('combobox',{name:'Origen',exact:true})).toHaveValue('published');
  await expect(page.locator('input[type=file]')).toBeVisible();
  await expect(page.locator('.veo-hash')).toHaveCount(0);
  await page.getByRole('navigation',{name:'Secciones VEO'}).getByRole('button',{name:'Dashboard',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Balance de resultados'})).toBeVisible();
  await expect(page.locator('.veo-kpis').first()).toContainText('1089');
  for(const [name,heading] of [['Partidos','Partidos importados'],['Jugadores','Analítica individual VEO'],['Rankings y comparación','Rankings deportivos']]){
    await page.getByRole('navigation',{name:'Secciones VEO'}).getByRole('button',{name,exact:true}).click();
    await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Sin partidos para esta selección'})).toHaveCount(0);
  }
  await page.getByRole('navigation',{name:'Secciones VEO'}).getByRole('button',{name:'Primas',exact:true}).click();
  await expect(page.getByText('Total calculado:',{exact:false}).first()).toContainText('30,00');
  const coachPage=await browser.newPage();
  try {
    const coach=await loginLocally(coachPage,'coach',backend.handler);
    await expect(coachPage.locator('.veo-kpis').first()).toContainText('1089');
    await expect(coachPage.getByRole('button',{name:'Importación',exact:true})).toHaveCount(0);
    await expect(coachPage.locator('input[type=file]')).toHaveCount(0);
    expect(coach.unexpected).toEqual([]);expect(coach.browserErrors).toEqual([]);
  } finally { await coachPage.close(); }
  await page.getByRole('navigation',{name:'Secciones VEO'}).getByRole('button',{name:'Importación',exact:true}).click();
  await page.getByLabel('Libro Excel (.xlsx, máximo 10 MB)').setInputFiles(fixture);
  await expect(page.getByRole('status').filter({hasText:'23 observaciones'})).toBeVisible();
  await expect(page.getByRole('cell',{name:'Idéntico',exact:true})).toBeVisible();
  expect(backend.state.writes.length).toBe(1);
  await page.getByRole('checkbox',{name:/He revisado identidades/}).check();
  await page.getByRole('button',{name:'Publicar lote aprobado'}).click();
  await expect(page.getByRole('status').filter({hasText:/No se creó otro lote/})).toBeVisible();
  expect(backend.state.batches.length).toBe(1);
  expect(backend.state.writes.length).toBe(2);
  const history=page.getByRole('heading',{name:'Historial de importaciones'}).locator('..');
  await history.locator('summary').click();
  await page.getByRole('button',{name:'Revisar retirada de este lote'}).click();
  await expect(page.getByRole('button',{name:'Retirar lote aprobado'})).toBeDisabled();
  await page.getByRole('checkbox',{name:/Apruebo retirar este lote/}).check();
  await page.getByRole('button',{name:'Retirar lote aprobado'}).click();
  await expect(page.getByRole('status').filter({hasText:/lote retirado/})).toBeVisible();
  expect(backend.state.writes.length).toBe(3);
  expect(unexpected).toEqual([]);expect(browserErrors).toEqual([]);
});

test('anonymous direct VEO entry requires authentication before any VEO request',async({page})=>{
  const requests=[];
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(['127.0.0.1','localhost'].includes(url.hostname))return route.continue();
    requests.push(url.pathname);return route.abort();
  });
  await page.goto('/?veo=1');
  await expect(page.getByPlaceholder('Email',{exact:true})).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('coach has analytics access and cannot access import administration',async({page})=>{
  const {unexpected,browserErrors}=await loginLocally(page,'coach');
  await expect(page.getByRole('heading',{name:'El partido, con perspectiva'})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Secciones VEO'}).getByRole('button',{name:'Importación',exact:true})).toHaveCount(0);
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  expect(unexpected).toEqual([]);expect(browserErrors).toEqual([]);
});
