const {test,expect}=require('@playwright/test');
async function setup(page){
  const unexpected=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='http://127.0.0.1:4180'){unexpected.push(url.pathname);return route.abort();}
    if(url.pathname==='/src/supabase.ts')return route.fulfill({contentType:'application/javascript',body:'export {supabase} from "/tests/auth.fixture.ts";'});
    return route.continue();
  });
  await page.goto('/');await expect.poll(()=>page.evaluate(()=>window.authFixture?.pending())).toContain('A');
  return {unexpected,errors};
}
test('account changes never retain the previous Admin permissions or operational state',async({page})=>{
  const state=await setup(page);await expect(page.getByRole('status')).toContainText('Verificando permisos');
  expect(await page.evaluate(()=>window.authFixture.requests)).toEqual(['rpc:app_access']);
  await page.evaluate(()=>window.authFixture.resolve('A','admin'));await expect(page.getByRole('button',{name:/Seguimiento semanal/}).first()).toBeVisible();
  const before=await page.evaluate(()=>window.authFixture.requests.length);
  await page.evaluate(()=>window.authFixture.change('B'));await expect(page.getByRole('status')).toContainText('Verificando permisos');
  expect(await page.evaluate(offset=>window.authFixture.requests.slice(offset),before)).toEqual(['rpc:app_access']);
  await page.evaluate(()=>window.authFixture.resolve('B','coach'));await expect(page.getByRole('heading',{level:1})).toHaveText('Asistencia');
  await expect(page.getByRole('button',{name:/Seguimiento semanal/})).toHaveCount(0);
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test('a late Admin profile response cannot overwrite the current Coach account',async({page})=>{
  const state=await setup(page);await page.evaluate(()=>window.authFixture.change('B'));
  await expect.poll(()=>page.evaluate(()=>window.authFixture.pending())).toContain('B');
  await page.evaluate(()=>window.authFixture.resolve('B','coach'));await expect(page.getByRole('heading',{level:1})).toHaveText('Asistencia');
  await page.evaluate(()=>window.authFixture.resolve('A','admin'));await expect(page.getByRole('heading',{level:1})).toHaveText('Asistencia');
  await expect(page.getByRole('button',{name:/Seguimiento semanal/})).toHaveCount(0);
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test('a denied or unknown profile fails closed with a retry and no operational queries',async({page})=>{
  const state=await setup(page);await page.evaluate(()=>window.authFixture.resolve('A','owner'));
  await expect(page.getByRole('alert')).toContainText('permisos');
  expect(await page.evaluate(()=>window.authFixture.requests)).toEqual(['rpc:app_access']);
  await page.getByRole('button',{name:'Reintentar permisos',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.authFixture.pending())).toContain('A');
  await page.evaluate(()=>window.authFixture.resolve('A',null));await expect(page.getByRole('alert')).toContainText('permisos');
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('membership denial blocks an existing account before any sporting queries',async({page})=>{
  const state=await setup(page);await page.evaluate(()=>window.authFixture.deny('A'));
  await expect(page.getByRole('alert')).toContainText('no tiene acceso');
  expect(await page.evaluate(()=>window.authFixture.requests)).toEqual(['rpc:app_access']);
  await expect(page.getByRole('navigation')).toHaveCount(0);
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test('staff visibility uses a private capability and disappears on account change or access revocation',async({page})=>{
  const state=await setup(page);
  await page.evaluate(()=>window.authFixture.resolve('A','admin',true));
  await expect(page.getByRole('button',{name:'Staff',exact:true}).first()).toBeVisible();
  await page.evaluate(()=>window.authFixture.change('B'));
  await expect.poll(()=>page.evaluate(()=>window.authFixture.pending())).toContain('B');
  await page.evaluate(()=>window.authFixture.resolve('B','admin',false));
  await expect(page.getByRole('heading',{level:1})).toHaveText('Inicio');
  await expect(page.getByRole('button',{name:'Staff',exact:true})).toHaveCount(0);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(()=>page.evaluate(()=>window.authFixture.pending())).toContain('B');
  await page.evaluate(()=>window.authFixture.deny('B'));
  await expect(page.getByRole('alert')).toContainText('no tiene acceso');
  await expect(page.getByRole('navigation')).toHaveCount(0);
  expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
