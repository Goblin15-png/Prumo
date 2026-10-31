// Build real; todas as respostas da API são fictícias e isoladas neste teste.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
const server = createServer(async (request, response) => {
  try {
    const path = resolve(dist, `.${new URL(request.url, 'http://localhost').pathname}`);
    assert.ok(path.startsWith(dist));
    const file = extname(path) ? path : resolve(dist, 'index.html');
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const permissions = ['products.view', 'products.create', 'products.update', 'taxonomy.view', 'categories.view', 'orders.view', 'health.view', 'insights.generate'];
const owner = { id: 1, name: 'Proprietário fictício', role: 'admin', admin_profile: 'owner', admin_permissions: permissions };
const technical = { id: 2, name: 'Técnico fictício', role: 'admin', admin_profile: 'technical', admin_permissions: ['system.view'] };
const product = { id: 1, name: 'Blend confidencial de teste', price: '25.00', stock: 4, tags: [], ingredients: [], symptoms: [], images: [] };
let browser;
const errors = [];
const contexts = [];
async function scenario({ user = null, mobile = false, setup = false } = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 360, height: 740 } : { width: 1440, height: 1000 } });
  contexts.push(context);
  const state = { user, identityFailure: null, metricsFailure: null, verifyFailure: null, logoutFailure: null, calls: [], setup, loginFailure: null, holdLogout: null };
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api/v1/') && !url.pathname.startsWith('/sanctum/')) return route.continue();
    const path = url.pathname.replace('/api/v1', '');
    state.calls.push({ path, method: request.method() });
    const reply = (json = {}, status = 200) => route.fulfill({ status, json });
    if (path.endsWith('/csrf-cookie')) return route.fulfill({ status: 204 });
    if (path === '/admin/auth/me') {
      const identity = state.user;
      if (state.holdIdentity) await state.holdIdentity;
      if (state.identityFailure) return reply(state.identityFailure.body || {}, state.identityFailure.status);
      return identity ? reply({ user: identity }) : reply({}, 401);
    }
    if (path === '/admin/auth/login') {
      if (state.loginFailure) return reply({}, state.loginFailure);
      return reply(state.setup ? { requires_two_factor_setup: true, secret: 'CHAVE-FICTICIA', otpauth_url: 'otpauth://totp/teste?secret=CHAVE-FICTICIA' } : { requires_two_factor: true });
    }
    if (path.startsWith('/admin/auth/two-factor/')) {
      if (state.verifyFailure) return reply({ message: 'A autenticação expirou. Entre novamente.' }, state.verifyFailure);
      state.user = owner;
      return reply({ user: owner, ...(state.setup ? { recovery_codes: ['RECUPERACAO-FICTICIA-1', 'RECUPERACAO-FICTICIA-2'] } : {}) });
    }
    if (path === '/admin/auth/logout') {
      if (state.holdLogout) await state.holdLogout;
      if (state.logoutFailure) return reply({}, state.logoutFailure);
      state.user = null;
      return reply();
    }
    if (path === '/password/forgot') return reply({}, 202);
    if (path === '/admin/health-metrics') {
      if (state.metricsFailure) return reply(state.metricsFailure.body || {}, state.metricsFailure.status);
      return reply({ total_clients_analyzed: 0, symptoms_distribution: [], demand_mapping: [] });
    }
    if (path === '/admin/system-status') return reply({ api: 'available', database: 'available' });
    if (path === '/admin/products') return reply({ products: [product] });
    if (path === '/admin/categories') return reply({ categories: [], products: [product] });
    if (path === '/admin/taxonomy') return reply({ symptoms: [], tags: [], ingredients: [] });
    if (path === '/admin/orders') return reply({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } });
    throw new Error(`Endpoint inesperado no teste: ${path}`);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', (error) => errors.push(error.message));
  state.page = page;
  state.context = context;
  state.open = async () => { await page.goto(`${base}/admin`); };
  return state;
}
async function login(page) {
  await page.getByRole('button', { name: 'Acessar painel', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email *', { exact: true }).fill('owner@example.invalid');
  await dialog.getByLabel('Senha *', { exact: true }).fill('senha-ficticia-longa');
  await dialog.getByRole('button', { name: 'Entrar no painel', exact: true }).click();
  await dialog.getByLabel('Código de autenticação', { exact: true }).waitFor();
  return dialog;
}
try {
  browser = await chromium.launch({ headless: true });

  const mobile = await scenario({ mobile: true });
  await mobile.open();
  let dialog = await login(mobile.page);
  assert.equal(await mobile.page.evaluate(() => document.activeElement.id), 'auth-mfa-code');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).focus();
  await mobile.page.keyboard.press('Tab');
  assert.equal(await mobile.page.evaluate(() => document.activeElement.id), 'auth-mfa-code', 'Tab não deve sair do diálogo.');
  await mobile.page.keyboard.press('Shift+Tab');
  assert.equal(await mobile.page.evaluate(() => document.activeElement.textContent), 'Fechar');
  mobile.verifyFailure = 401;
  await dialog.getByLabel('Código de autenticação', { exact: true }).fill('123456');
  await dialog.getByRole('button', { name: 'Verificar código', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByRole('button', { name: 'Verificar código' }).isDisabled(), true);
  await dialog.getByRole('button', { name: 'Recomeçar acesso' }).click();
  assert.equal(await dialog.getByLabel('Senha *', { exact: true }).inputValue(), '');
  assert.equal(await dialog.getByLabel('Email *', { exact: true }).inputValue(), 'owner@example.invalid');
  await mobile.page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await mobile.page.evaluate(() => document.activeElement.textContent), 'Acessar painel');
  assert.equal(await mobile.page.evaluate(() => document.body.style.overflow), '');
  assert.equal(await mobile.page.getByText('Cadastre-se', { exact: false }).count(), 0);
  console.log('OK: login móvel, rótulos, foco, teclado e reinício após expiração MFA.');

  const setup = await scenario({ setup: true, mobile: true });
  await setup.open();
  dialog = await login(setup.page);
  await dialog.getByText('CHAVE-FICTICIA', { exact: true }).waitFor();
  await dialog.getByLabel('Código de autenticação', { exact: true }).fill('123456');
  await dialog.getByRole('button', { name: 'Ativar 2FA e entrar' }).click();
  await dialog.getByText('Guarde seus códigos de recuperação').waitFor();
  assert.equal(await dialog.getByText('CHAVE-FICTICIA', { exact: true }).count(), 0);
  await setup.page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(), true, 'Não deve descartar os códigos de recuperação com Escape.');
  await dialog.getByRole('button', { name: 'Guardei os códigos e continuar' }).click();
  await setup.page.getByRole('heading', { name: 'Gestão da loja', exact: true }).waitFor();
  assert.equal(await setup.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'O painel deve caber na largura móvel.');
  assert.equal(await setup.page.getByRole('navigation', { name: 'Áreas do painel' }).isVisible(), true);
  console.log('OK: configuração MFA, confirmação dos códigos e painel móvel.');

  for (const failure of [{ status: 401 }, { status: 419 }, { status: 403, body: { code: 'ADMIN_REAUTH_REQUIRED' } }, { status: 403, body: { code: 'ADMIN_ACCESS_CHANGED' } }]) {
    const session = await scenario({ user: owner });
    await session.open();
    await session.page.getByRole('heading', { name: 'Gestão da loja', exact: true }).waitFor();
    await session.page.getByRole('button', { name: 'Atualizar métricas', exact: true }).waitFor();
    await session.page.getByRole('button', { name: 'Adicionar Blend', exact: true }).click();
    await session.page.getByRole('heading', { name: 'Cadastrar Novo Blend / Sinergia' }).waitFor();
    session.metricsFailure = failure;
    // Formulário aberto não deve sobreviver à perda de acesso em uma chamada concorrente.
    await session.page.getByRole('button', { name: 'Atualizar métricas', exact: true }).evaluate((button) => button.click());
    await session.page.getByRole('button', { name: 'Acessar painel', exact: true }).waitFor();
    assert.equal(await session.page.getByRole('heading', { name: 'Cadastrar Novo Blend / Sinergia' }).count(), 0);
    assert.equal(await session.page.getByText(product.name, { exact: true }).count(), 0);
    await session.context.close();
  }
  console.log('OK: sessão/CSRF expirados e acesso revogado removem dados e formulário abertos.');

  const denial = await scenario({ user: owner });
  await denial.open();
  await denial.page.getByRole('button', { name: 'Atualizar métricas', exact: true }).waitFor();
  for (const status of [403, 503]) {
    denial.metricsFailure = { status };
    await denial.page.getByRole('button', { name: 'Atualizar métricas', exact: true }).click();
    await denial.page.getByText('Não foi possível carregar métricas reais do servidor.', { exact: true }).waitFor();
    assert.equal(await denial.page.getByRole('button', { name: 'Sair do painel', exact: true }).isVisible(), true);
  }
  console.log('OK: recusa de operação e falha temporária não encerram a sessão.');

  const retry = await scenario({ user: technical });
  retry.identityFailure = { status: 503 };
  await retry.open();
  await retry.page.getByRole('button', { name: 'Verificar acesso novamente' }).waitFor();
  retry.identityFailure = null;
  await retry.page.getByRole('button', { name: 'Verificar acesso novamente' }).click();
  await retry.page.getByRole('heading', { name: 'Administração técnica', exact: true }).waitFor();
  assert.equal(retry.calls.some(({ path }) => ['/admin/orders', '/admin/products', '/admin/health-metrics', '/admin/ai-insights'].includes(path)), false);
  retry.identityFailure = { status: 403, body: { message: 'Autenticação em duas etapas necessária.' } };
  await retry.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await retry.page.getByRole('button', { name: 'Acessar painel', exact: true }).waitFor();
  console.log('OK: recuperação de falha inicial, técnico sem dados comerciais e revalidação ao voltar à aba.');

  const restricted = await scenario({ user: { ...owner, admin_permissions: ['orders.view'] } });
  await restricted.open();
  await restricted.page.getByRole('heading', { name: 'Gestão da loja', exact: true }).waitFor();
  assert.equal(await restricted.page.getByRole('region', { name: 'Métricas consentidas' }).count(), 0);
  assert.equal(await restricted.page.getByRole('region', { name: 'Assistente de estratégia' }).count(), 0);
  assert.equal(restricted.calls.some(({ path }) => ['/admin/health-metrics', '/admin/ai-insights'].includes(path)), false);
  let releaseLogout;
  restricted.holdLogout = new Promise((done) => { releaseLogout = done; });
  await restricted.page.getByRole('button', { name: 'Sair do painel', exact: true }).click();
  assert.equal(await restricted.page.getByRole('button', { name: 'Saindo…', exact: true }).isDisabled(), true);
  releaseLogout();
  await restricted.page.getByRole('button', { name: 'Acessar painel', exact: true }).waitFor();
  assert.equal(restricted.calls.filter(({ path }) => path === '/admin/auth/logout').length, 1);
  console.log('OK: exibição por permissão e logout sem envio duplicado.');

  const logoutFailure = await scenario({ user: technical });
  await logoutFailure.open();
  await logoutFailure.page.getByRole('heading', { name: 'Administração técnica', exact: true }).waitFor();
  logoutFailure.logoutFailure = 503;
  await logoutFailure.page.getByRole('button', { name: 'Sair do painel', exact: true }).click();
  await logoutFailure.page.getByText('Não foi possível confirmar o encerramento da sessão administrativa. Tente novamente.', { exact: true }).waitFor();
  assert.equal(await logoutFailure.page.getByRole('button', { name: 'Sair do painel', exact: true }).isVisible(), true);
  logoutFailure.logoutFailure = null;
  let releaseIdentity;
  logoutFailure.holdIdentity = new Promise((done) => { releaseIdentity = done; });
  const identityStarted = logoutFailure.page.waitForRequest(`${base}/api/v1/admin/auth/me`);
  await logoutFailure.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await identityStarted;
  await logoutFailure.page.getByRole('button', { name: 'Sair do painel', exact: true }).click();
  await logoutFailure.page.getByRole('button', { name: 'Acessar painel', exact: true }).waitFor();
  const identityReturned = logoutFailure.page.waitForResponse(`${base}/api/v1/admin/auth/me`);
  releaseIdentity();
  await identityReturned;
  // Turno de renderização após a resposta: a identidade anterior não pode reabrir o painel.
  await logoutFailure.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await logoutFailure.page.getByRole('button', { name: 'Acessar painel', exact: true }).isVisible(), true);
  assert.equal(await logoutFailure.page.getByRole('heading', { name: 'Administração técnica', exact: true }).count(), 0);
  console.log('OK: falha de logout explícita e identidade atrasada não restaura sessão encerrada.');

  const limited = await scenario();
  limited.loginFailure = 429;
  await limited.open();
  await limited.page.getByRole('button', { name: 'Acessar painel', exact: true }).click();
  await limited.page.getByLabel('Email *', { exact: true }).fill('owner@example.invalid');
  await limited.page.getByLabel('Senha *', { exact: true }).fill('senha-ficticia-longa');
  await limited.page.getByRole('button', { name: 'Entrar no painel', exact: true }).click();
  await limited.page.getByRole('alert').filter({ hasText: 'Muitas tentativas' }).waitFor();
  await limited.page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await limited.page.getByRole('button', { name: 'Enviar instruções' }).click();
  await limited.page.getByRole('status').filter({ hasText: 'Se o endereço puder receber recuperação' }).waitFor();
  assert.ok(limited.calls.some(({ path }) => path === '/password/forgot'));
  assert.deepEqual(errors, []);
  console.log('OK: limite de tentativas e recuperação de senha sem cadastro público.');
} finally {
  for (const context of contexts) await context.close();
  await browser?.close();
  await new Promise((done) => server.close(done));
}
