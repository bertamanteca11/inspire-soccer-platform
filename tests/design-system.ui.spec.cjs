const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  const external = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4177') return route.continue();
    external.push(url.origin); return route.abort();
  });
  page.__designErrors = errors; page.__externalRequests = external;
  await page.goto('/tests/design-system.html');
  await expect(page.getByRole('heading', { name: 'Club workspace' })).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect(page.__externalRequests).toEqual([]);
  expect(page.__designErrors).toEqual([]);
});

test('synthetic states render with semantic labels and safe button defaults', async ({ page }) => {
  await expect(page.getByText('Confirmed', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unavailable action' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Saving example' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Saving example' })).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('alert')).toContainText('No partial totals');
  await expect(page.getByRole('status').filter({ hasText: 'Loading' })).toBeVisible();
  await expect(page.getByLabel('Session label', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Session label', { exact: true })).toHaveAccessibleDescription('Enter a session label.');
  await expect(page.getByLabel('Squad name')).toHaveAccessibleDescription('Local demonstration; nothing is saved.');
  await expect(page.locator('.ds-field label').first()).toHaveCSS('display', 'block');
  await expect(page.getByLabel('Unavailable field')).toBeDisabled();
  await expect(page.getByLabel('Read-only reference')).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Non-submit action' }).click();
  await expect(page.getByText('Local primary actions: 0')).toBeVisible();
  await page.getByRole('button', { name: 'Submit locally' }).click();
  await expect(page.getByText('Local primary actions: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Select option', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Selected option' })).toHaveAttribute('aria-pressed', 'true');
});

test('keyboard focus is visible and reduced motion stops the loading animation', async ({ page }) => {
  await page.keyboard.press('Tab');
  const primary = page.getByRole('button', { name: 'Primary action', exact: true });
  await expect(primary).toBeFocused();
  await expect(primary).toHaveCSS('outline-style', 'solid');
  await expect(primary).toHaveCSS('outline-width', '3px');
  await page.keyboard.press('Space');
  await expect(page.getByText('Local primary actions: 1')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.ds-spinner')).toHaveCSS('animation-name', 'none');
});

test('premium CSS leaves legacy and VEO probes unchanged outside the scope', async ({ page }) => {
  const styles = () => page.evaluate(() => ['#legacy-probe', '#legacy-probe button', '#veo-probe'].map(selector => {
    const style = getComputedStyle(document.querySelector(selector));
    return ['color', 'background', 'border-radius', 'padding', 'font-family', 'box-shadow'].map(key => style.getPropertyValue(key));
  }));
  const before = await styles();
  const disabled = await page.evaluate(() => { let count = 0; for (const sheet of document.styleSheets) {
    if (sheet.ownerNode?.getAttribute('data-vite-dev-id')?.replaceAll('\\', '/').match(/\/premium(?:-tokens)?\.css$/)) { sheet.disabled = true; count++; }
  } return count; });
  expect(disabled).toBeGreaterThan(0);
  expect(await styles()).toEqual(before);
  await expect(page.locator('#legacy-probe')).toHaveCSS('--ds-primary', '');
});

for (const width of [320, 390, 768, 1440]) test(`reference fits ${width}px and controls retain touch targets`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  const dimensions = await page.locator('.premium-ui').evaluate(scope => ({ width: scope.clientWidth, content: scope.scrollWidth,
    overflow: [...scope.querySelectorAll('button,input')].filter(node => node.getBoundingClientRect().right > scope.getBoundingClientRect().right + 1).length }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.overflow).toBe(0);
  for (const control of await page.locator('.premium-ui button,.premium-ui input').all()) expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
  if ([390,1440].includes(width)) await page.locator('.premium-ui').screenshot({ path: testInfo.outputPath(`reference-${width}.png`), animations: 'disabled' });
});

test('normal text, action and status color pairs meet AA contrast', async ({ page }) => {
  const pairs = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector('.premium-ui'));
    const token = name => style.getPropertyValue('--ds-' + name).trim();
    return [['text','background'],['secondary','surface'],['surface','primary'],['surface','primary-hover'],['surface','danger'],['navy','info-soft'],['success','success-soft'],['warning','warning-soft'],['danger','danger-soft'],['secondary','surface-subtle'],['text','accent']].map(([a,b]) => [a,b,token(a),token(b)]);
  });
  const luminance = hex => { const rgb = hex.replace('#','').match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4); return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722; };
  for (const [a,b,foreground,background] of pairs) { const l=[luminance(foreground),luminance(background)].sort((x,y)=>y-x); expect((l[0]+.05)/(l[1]+.05), `${a} on ${b}`).toBeGreaterThanOrEqual(4.5); }
});
