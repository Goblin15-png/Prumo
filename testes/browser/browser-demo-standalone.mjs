import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const requests = [];
  const errors = [];
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (/^\/(api|sanctum)(\/|$)/.test(url.pathname)) {
      requests.push(url.pathname);
      return route.abort();
    }
    return url.origin === base ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('heading', { name: 'Explore nossos blends' }).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await page.getByRole('link', { name: 'Voltar para a loja real' }).count(), 0);
  await page.getByRole('button', { name: 'Ativar modo escuro', exact: true }).click();
  await page.getByLabel('Perfil simulado', { exact: true }).selectOption('admin');
  const navigation = page.getByRole('navigation', { name: 'Páginas para testar' });
  for (const name of ['Início', 'Favoritos', 'Sacola', 'Checkout', 'Minha conta', 'Pedidos', 'Admin simulado']) {
    const button = navigation.getByRole('button', { name: name === 'Sacola' ? /^Sacola \(\d+\)$/ : name, exact: true });
    await button.click();
    assert.equal(await button.getAttribute('aria-current'), 'page');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, name);
  }
  await page.getByRole('heading', { name: 'Painel administrativo · apenas simulação', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Painel administrativo · apenas simulação', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.deepEqual(requests, [], 'A demonstração chamou uma API.');
  assert.deepEqual(errors, []);
  console.log('PASS: entrada testes, todas as abas, recarga, tema, tela móvel e isolamento sem API.');
} finally {
  await browser.close();
}
