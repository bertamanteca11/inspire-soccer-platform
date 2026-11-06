const { test, expect } = require('@playwright/test');
test.beforeEach(async ({ page }) => {
  page.__external = []; page.__errors = [];
  page.on('pageerror', error => page.__errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4178') { page.__external.push(url.origin); return route.abort(); }
    // The fixture, including login presentation, must never import a real client.
    if (url.pathname === '/src/supabase.ts') { page.__external.push('unexpected Supabase module'); return route.abort(); }
    return route.continue();
  });
});
test.afterEach(async ({ page }) => { expect(page.__external).toEqual([]); expect(page.__errors).toEqual([]); });
const roles = {
  admin: ['Inicio','Equipo','Sesiones','Resumen','Convocatoria','Asistencia','Evaluar','Destacados','Lesiones','VEO Analytics','Seguimiento semanal','Informes','Histórico'],
  coach: ['Inicio','Equipo','Sesiones','Resumen','Convocatoria','Asistencia','Evaluar','Destacados','Lesiones','VEO Analytics','Informes','Histórico'],
  viewer: ['Inicio','Resumen','Asistencia','Evaluar','Lesiones'],
};
for (const role of Object.keys(roles)) for (const width of [390, 900, 1440]) test(`${role} destinations and state at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 950 }); await page.goto(`/tests/shell.html?role=${role}`);
  const nav = page.getByRole('navigation', { name: width < 768 ? 'Navegación móvil' : 'Navegación principal', exact: true });
  await expect(nav).toBeVisible();
  if (width < 768) {
    const primary = roles[role].filter(label => ['Inicio','Equipo','Sesiones','Resumen'].includes(label));
    await expect(nav.getByRole('button')).toHaveText([...primary,'Más']);
    await nav.getByRole('button', { name: 'Más', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Más herramientas' });
    await expect(dialog.getByRole('navigation').getByRole('button')).toHaveText(roles[role].filter(label => !primary.includes(label)));
    await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  } else {
    const labels = await nav.getByRole('button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
    expect(labels.sort()).toEqual([...roles[role]].sort());
    await expect(page.getByRole('navigation', { name: 'Navegación móvil', exact: true })).not.toBeVisible();
  }
  await page.getByLabel('Nota local').fill('Keep draft');
  await page.getByRole('main').focus();
  await nav.getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Resumen', exact: true })).toHaveAttribute('aria-current','page');
  await expect(page.getByTestId('selected-session')).toHaveText('SYNTHETIC-SESSION-01');
  await expect(page.getByLabel('Nota local')).toHaveValue('Keep draft');
  await expect(page.locator('.club-context')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Salida local solicitada');
});

test('More is modal, traps focus, closes on Escape and returns focus', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 700 }); await page.goto('/tests/shell.html');
  const more = page.getByRole('button', { name: 'Más', exact: true }); await more.click();
  const dialog = page.getByRole('dialog', { name: 'Más herramientas' });
  await expect(page.getByRole('button', { name: 'Cerrar herramientas' })).toBeFocused();
  await expect(more).toHaveAttribute('aria-expanded','true');
  expect(await dialog.evaluate(node => node.matches(':modal'))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Cerrar herramientas' })).toBeFocused();
  for (let i=0;i<15;i++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true); }
  await page.screenshot({path:info.outputPath('mobile-more.png')});
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(more).toBeFocused();
  await expect(more).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('body')).not.toHaveCSS('overflow','hidden');
});

test('short mobile screens can reach every More destination by keyboard', async ({ page }) => {
  await page.setViewportSize({width:390,height:360}); await page.goto('/tests/shell.html');
  await page.getByRole('button',{name:'Más',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button',{name:'Histórico',exact:true})).toBeFocused();
  await expect(dialog.getByRole('button',{name:'Histórico',exact:true})).toBeInViewport();
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
});

test('More selection, backdrop and resizing close safely; current destination remains accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 }); await page.goto('/tests/shell.html');
  const more = page.getByRole('button', { name: 'Más', exact: true }); await more.click();
  await page.getByRole('dialog').getByRole('button', { name:'Asistencia', exact:true }).click();
  await expect(page.getByTestId('current-tab')).toHaveText('attendance'); await expect(more).toHaveAttribute('data-active','true');
  await more.click(); await expect(page.getByRole('dialog').getByRole('button', { name:'Asistencia', exact:true })).toHaveAttribute('aria-current','page');
  await page.mouse.click(5,5); await expect(page.getByRole('dialog')).not.toBeVisible();
  await more.click(); await page.setViewportSize({ width: 1440, height: 950 });
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('navigation', { name:'Navegación principal' }).getByRole('button',{name:'Asistencia',exact:true})).toBeFocused();
});

test('existing modal stays above bottom navigation and skip link reaches content', async ({ page }) => {
  await page.setViewportSize({ width:390, height:700 }); await page.goto('/tests/shell.html');
  await page.keyboard.press('Tab'); await expect(page.getByRole('link',{name:'Saltar al contenido'})).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('main')).toBeFocused();
  await page.getByRole('button',{name:'Abrir diálogo existente'}).click();
  const close = page.getByRole('button',{name:'Cerrar',exact:true}); await close.click(); await expect(close).not.toBeVisible();
});

for (const width of [320,360,390,900,1440]) test(`crest, layout isolation and screenshot at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 950 }); await page.goto('/tests/shell.html');
  const logo = page.locator(width < 768 ? '.club-header .club-crest' : '.club-sidebar .club-crest');
  await expect(logo).toHaveAttribute('src','/logo.png'); await expect(logo).toHaveCSS('object-fit','contain');
  expect(await logo.evaluate(async node => { await node.decode(); return node.naturalWidth > 0 && node.naturalHeight > 0; })).toBe(true);
  await expect(logo).toHaveCSS('filter','none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.club-main')).not.toHaveClass(/premium-ui/);
  await expect(page.locator('.veo-hero')).toHaveCSS('color','rgb(247, 255, 233)');
  await expect(page.locator('.club-main .page-title')).toHaveAttribute('data-shell-duplicate','true');
  if(width<768) for(const control of await page.locator('.club-header button,.club-context summary,.club-mobile-nav button,.club-session-workflow button').all()) {
    const box=await control.boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44);
  }
  if ([390,1440].includes(width)) await page.screenshot({ path: info.outputPath(`shell-${width}.png`), fullPage:true });
});

test('login shows the unchanged crest and keeps both authentication modes', async ({ page }) => {
  await page.goto('/tests/shell.html?login=1');
  const logo = page.getByRole('img', { name:'Escudo oficial de Inspire Soccer' });
  await expect(logo).toHaveAttribute('src','/logo.png'); await expect(logo).toHaveCSS('object-fit','contain');
  expect(await logo.evaluate(async node => { await node.decode(); return node.naturalWidth>0; })).toBe(true);
  await page.getByRole('button',{name:'Enlace por correo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Enviar enlace',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Contraseña',exact:true}).click();
  await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();
});

for (const width of [320,360,390]) test(`compact More keeps close visible with long labels at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({width,height:568}); await page.goto('/tests/shell.html?long=1');
  await page.getByRole('button',{name:'Más',exact:true}).click();
  const dialog=page.getByRole('dialog'), list=dialog.getByRole('navigation');
  await list.getByRole('button').last().locator('span').evaluate(node => { node.textContent='Herramienta de referencia con una etiqueta extremadamente larga sin abreviaturas'; });
  await list.evaluate(node => { node.scrollTop=node.scrollHeight; });
  const close=page.getByRole('button',{name:'Cerrar herramientas'});
  await expect(close).toBeInViewport();
  expect(await list.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  for(const button of await dialog.getByRole('button').all()) {
    const box=await button.boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44);
    if(await button.locator('span').count()) {
      const text=await button.locator('span').boundingBox();
      expect(text.y).toBeGreaterThanOrEqual(box.y); expect(text.y+text.height).toBeLessThanOrEqual(box.y+box.height);
    }
  }
  await expect(page.locator('body')).toHaveCSS('overflow','hidden');
  if(width===360) await page.screenshot({path:info.outputPath('compact-more-360.png')});
  await close.click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Más',exact:true})).toBeFocused();
});

for (const width of [320,360,390]) test(`mobile header contains only page identity at ${width}px`, async ({page},info) => {
  await page.setViewportSize({width,height:640}); await page.goto('/tests/shell.html?long=1');
  const header=page.locator('.club-header');
  expect((await header.boundingBox()).height).toBeLessThanOrEqual(90);
  await expect(header.getByRole('heading')).toHaveText('Inicio');
  await expect(header).not.toContainText('23 octubre');
  await expect(header.locator('details,p')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if(width===360) await page.screenshot({path:info.outputPath('long-header-360.png'),fullPage:true});
});

for (const viewport of [{width:844,height:390},{width:812,height:375}]) test(`short landscape uses usable mobile navigation at ${viewport.width}px`, async ({page}) => {
  await page.setViewportSize(viewport); await page.goto('/tests/shell.html');
  await expect(page.getByRole('navigation',{name:'Navegación móvil',exact:true})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Navegación principal',exact:true})).not.toBeVisible();
  await expect(page.locator('.club-header-scope')).toHaveCSS('position','relative');
  await page.getByRole('button',{name:'Más',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button').last()).toBeInViewport();
  await expect(page.getByRole('button',{name:'Cerrar herramientas'})).toBeInViewport();
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:844,height:650});
  await expect(page.getByRole('navigation',{name:'Navegación principal',exact:true})).toBeVisible();
});

test('height breakpoint restores focus when the sidebar becomes phone navigation', async({page}) => {
  await page.setViewportSize({width:844,height:650}); await page.goto('/tests/shell.html');
  await page.getByRole('navigation',{name:'Navegación principal',exact:true}).getByRole('button',{name:'Inicio',exact:true}).focus();
  await page.setViewportSize({width:844,height:390});
  await expect(page.getByRole('navigation',{name:'Navegación móvil',exact:true}).getByRole('button',{name:'Inicio',exact:true})).toBeFocused();
});

for(const width of [320,360,390]) test(`editing and resized viewports keep inputs and feedback unobscured at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:740}); await page.goto('/tests/shell.html?keyboard=1');
  const field=page.getByLabel('Comentario largo');
  await field.fill('Unchanged local draft');
  await expect(page.locator('.club-mobile-scope')).not.toBeVisible();
  await page.setViewportSize({width,height:360});
  await field.scrollIntoViewIfNeeded();
  await expect(field).toBeFocused(); await expect(field).toHaveValue('Unchanged local draft');
  await expect(field).toBeInViewport();
  await expect(page.getByRole('status')).toHaveText('Guardados locales: 0');
  await page.getByRole('button',{name:'Guardar ejemplo local'}).click();
  await expect(page.getByRole('status')).toHaveText('Guardados locales: 1');
  await expect(page.locator('.club-mobile-scope')).not.toBeVisible();
  await expect(page.getByRole('status')).toBeInViewport();
  await page.getByRole('main').focus();
  await expect(page.locator('.club-mobile-scope')).toBeVisible();
  await page.setViewportSize({width,height:740});
  await expect(field).toHaveValue('Unchanged local draft');
});

for(const role of ['admin','coach','viewer']) test(`${role} session shortcuts preserve visibility and selected session`,async({page})=>{
  await page.setViewportSize({width:360,height:740}); await page.goto(`/tests/shell.html?role=${role}`);
  await expect(page.getByRole('navigation',{name:'Acciones de la sesión seleccionada'})).toHaveCount(0);
  await page.getByRole('button',{name:'Más',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Asistencia',exact:true}).click();
  const nav=page.getByRole('navigation',{name:'Acciones de la sesión seleccionada'});
  await expect(nav.getByRole('button')).toHaveText(role==='viewer'?['Asistencia','Evaluar']:['Convocatoria','Asistencia','Evaluar']);
  await nav.getByRole('button',{name:'Asistencia',exact:true}).click();
  await expect(nav.getByRole('button',{name:'Asistencia',exact:true})).toHaveAttribute('aria-current','page');
  await expect(page.getByTestId('selected-session')).toHaveText('SYNTHETIC-SESSION-01');
  await page.goto(`/tests/shell.html?role=${role}&no-session=1`);
  await expect(page.getByRole('navigation',{name:'Acciones de la sesión seleccionada'})).toHaveCount(0);
});
