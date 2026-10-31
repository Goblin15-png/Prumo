// Sem interceptar a API: Chromium → PHP/Laravel → SQLite descartável.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory = await mkdtemp(join(tmpdir(), 'protocolar-integration-'));
const artifacts = process.env.SMOKE_ARTIFACTS || '/tmp/protocolar-smoke';
let server;
let browser;
const secrets = [];

try {
  await readFile(join(root, 'frontend/dist/index.html'));
  await mkdir(join(directory, 'storage/framework/views'), { recursive: true });
  await mkdir(artifacts, { recursive: true });
  const credentials = { password: randomBytes(24).toString('hex'), appKey: `base64:${randomBytes(32).toString('base64')}` };
  secrets.push(...Object.values(credentials));
  await writeFile(join(directory, 'credentials.json'), JSON.stringify(credentials), { mode: 0o600, flag: 'wx' });
  await writeFile(join(directory, 'test.sqlite'), '', { mode: 0o600, flag: 'wx' });

  const portProbe = createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise((resolveClose) => portProbe.close(resolveClose));
  const base = `http://127.0.0.1:${port}`;
  // Não herda variáveis de banco, serviços ou configuração do projeto.
  const env = { PATH: process.env.PATH, PROTOCOLAR_BROWSER_DIR: directory, PROTOCOLAR_BROWSER_ORIGIN: base };
  const environment = join(root, 'testes/backend/Browser/environment.php');
  const php = (action) => execFileSync('php', [environment, action], { env, cwd: root, encoding: 'utf8' }).trim();
  console.log(php('setup'));
  server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', join(root, 'frontend/dist'), join(root, 'testes/backend/Browser/server.php')], { env, cwd: root, stdio: 'ignore' });
  let serverError;
  server.on('error', (error) => { serverError = error; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error('O servidor PHP de testes não iniciou.');
    try { ready = (await fetch(`${base}/up`, { signal: AbortSignal.timeout(2000) })).ok; } catch { /* aguarda a inicialização */ }
    if (ready) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  assert.ok(ready, 'O Laravel isolado não respondeu.');
  browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  const contextFor = async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    // Somente recursos externos são bloqueados; respostas locais vêm do servidor real.
    await context.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(base);
    await page.getByText('Teste integrado local — dados fictícios em banco temporário. Serviços externos bloqueados.', { exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.getByRole('button', { name: 'Ativar modo escuro', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.getByRole('button', { name: 'Recusar rastreamento', exact: true }).click();
    await page.getByRole('heading', { name: 'Aromas florais (teste)', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Aromas cítricos (teste)', exact: true }).waitFor();
    assert.equal(await page.getByText('Não foi possível carregar o catálogo. Tente novamente.', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Não foi possível carregar as categorias.', { exact: true }).count(), 0);
    return { context, page };
  };
  const login = async (page, profile) => {
    const administrative = profile === 'owner';
    await page.getByRole('button', { name: administrative ? 'Acessar painel' : 'Entrar', exact: true }).first().click();
    await page.getByPlaceholder('seuemail@exemplo.com').fill(`${profile}@example.invalid`);
    await page.getByPlaceholder('Sua senha').fill(credentials.password);
    const response = page.waitForResponse((response) => response.url() === `${base}/api/v1/${administrative ? 'admin/auth/login' : 'login'}` && response.request().method() === 'POST');
    await page.getByRole('button', { name: administrative ? 'Entrar no painel' : 'Entrar no Protocolo Cuidar', exact: true }).click();
    const result = await response;
    assert.equal(result.status(), 200, 'Login pela interface falhou.');
  };
  const customer = await contextFor();
  await login(customer.page, 'customer');
  const owner = { context: customer.context, page: await customer.context.newPage() };
  owner.page.on('pageerror', (error) => pageErrors.push(error.message));
  await owner.page.goto(`${base}/admin`);
  await owner.page.getByRole('heading', { name: 'Administração da loja', exact: true }).waitFor();
  await owner.page.screenshot({ path: join(artifacts, 'laravel-admin-login.png'), fullPage: true });
  await owner.page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await owner.page.screenshot({ path: join(artifacts, 'laravel-admin-login-mobile.png'), fullPage: true });
  await owner.page.setViewportSize({ width: 1440, height: 1000 });
  await login(owner.page, 'owner');
  await owner.page.getByPlaceholder('Código de autenticação').waitFor();
  assert.equal((await owner.context.request.get(`${base}/api/v1/admin/orders`, { headers: { Origin: base, Accept: 'application/json' } })).status(), 401, 'Senha sem MFA não deve liberar pedidos.');
  const otp = php('otp');
  secrets.push(otp);
  await owner.page.getByPlaceholder('Código de autenticação').fill(otp);
  const verified = owner.page.waitForResponse(`${base}/api/v1/admin/auth/two-factor/verify`);
  await owner.page.getByRole('button', { name: 'Verificar código', exact: true }).click();
  assert.equal((await verified).status(), 200, 'MFA pelo formulário falhou.');
  const cookies = await owner.context.cookies(base);
  const adminSession = cookies.find((cookie) => cookie.name.endsWith('_admin_v1'));
  const customerSession = cookies.find((cookie) => cookie.name.startsWith('protocolar_browser_') && !cookie.name.endsWith('_admin_v1'));
  const adminCsrf = cookies.find((cookie) => cookie.name === 'ADMIN-XSRF-TOKEN');
  const customerCsrf = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN');
  assert.ok(adminSession?.httpOnly && customerSession?.httpOnly, 'As duas sessões precisam de cookies HttpOnly.');
  assert.ok(adminSession.value !== customerSession.value, 'As sessões precisam ter identificadores distintos.');
  assert.ok(adminCsrf && customerCsrf && adminCsrf.value !== customerCsrf.value, 'Cada contexto precisa de seu próprio CSRF.');
  secrets.push(...cookies.map((cookie) => cookie.value));
  const headers = { Origin: base, Accept: 'application/json' };
  const currentCustomer = await owner.context.request.get(`${base}/api/v1/me`, { headers });
  assert.equal(currentCustomer.status(), 200);
  assert.equal((await currentCustomer.json()).user.email, 'customer@example.invalid', 'Login administrativo alterou a conta da loja.');
  const delivery = owner.page.getByRole('article', { name: 'Gerenciar pedido PC-INTEGRACAO-DELIVERY', exact: true });
  const pickup = owner.page.getByRole('article', { name: 'Gerenciar pedido PC-INTEGRACAO-PICKUP', exact: true });
  await delivery.waitFor();
  await pickup.waitFor();
  assert.equal(await owner.page.getByRole('article', { name: 'Gerenciar pedido PC-INTEGRACAO-PENDING', exact: true }).count(), 0);
  const selector = delivery.getByRole('combobox', { name: 'Status do pedido PC-INTEGRACAO-DELIVERY', exact: true });
  const save = async (card, status) => {
    await card.getByRole('combobox').selectOption(status);
    const response = owner.page.waitForResponse((response) => response.url().endsWith('/fulfillment') && response.request().method() === 'PATCH');
    await card.getByRole('button', { name: 'Salvar status', exact: true }).click();
    const saved = await response;
    assert.equal(saved.status(), 200, 'Gravação operacional no Laravel falhou.');
    assert.equal((await saved.json()).data.fulfillment_status, status);
  };
  await selector.selectOption('delivered');
  await delivery.getByRole('textbox', { name: 'Código de rastreio do pedido PC-INTEGRACAO-DELIVERY', exact: true }).fill('RASTREIO-FICTICIO');
  await save(delivery, 'delivered');
  await save(delivery, 'preparing');
  await save(pickup, 'collected');
  await owner.page.reload();
  await delivery.waitFor();
  assert.equal(await selector.inputValue(), 'preparing', 'O status precisa sobreviver ao recarregamento.');
  await delivery.getByText('Histórico de alterações', { exact: true }).click();
  await delivery.getByText(/Proprietário fictício/).last().waitFor();
  const adminOrdersResponse = await owner.context.request.get(`${base}/api/v1/admin/orders`, { headers: { Origin: base, Accept: 'application/json' } });
  assert.equal(adminOrdersResponse.status(), 200);
  const adminOrders = (await adminOrdersResponse.json()).data;
  const deliveryOrder = adminOrders.find((order) => order.order_number === 'PC-INTEGRACAO-DELIVERY');
  assert.equal(deliveryOrder.fulfillment_history.length, 2);
  assert.equal(deliveryOrder.tracking_code, null);
  const noCsrf = await owner.context.request.patch(`${base}/api/v1/admin/orders/${deliveryOrder.id}/fulfillment`, {
    headers: { Origin: base, Accept: 'application/json' }, data: { fulfillment_status: 'shipped', expected_revision: 2 },
  });
  assert.equal(noCsrf.status(), 419, 'Cookie sem token CSRF não pode alterar pedido.');
  assert.equal((await owner.context.request.patch(`${base}/api/v1/admin/orders/${deliveryOrder.id}/fulfillment`, {
    headers: { ...headers, 'X-XSRF-TOKEN': decodeURIComponent(customerCsrf.value) }, data: { fulfillment_status: 'shipped', expected_revision: 2 },
  })).status(), 419, 'CSRF da loja não pode alterar pedido administrativo.');
  assert.equal((await owner.context.request.post(`${base}/api/v1/logout`, { headers: { ...headers, 'X-XSRF-TOKEN': decodeURIComponent(adminCsrf.value) } })).status(), 419, 'CSRF administrativo não pode encerrar a sessão da loja.');
  const swapped = await browser.newContext();
  await swapped.addCookies([{ ...adminSession, name: customerSession.name }]);
  assert.equal((await swapped.request.get(`${base}/api/v1/me`, { headers })).status(), 401, 'Cookie administrativo renomeado não pode autenticar na loja.');
  await swapped.clearCookies();
  await swapped.addCookies([{ ...customerSession, name: adminSession.name }]);
  assert.equal((await swapped.request.get(`${base}/api/v1/admin/auth/me`, { headers })).status(), 401, 'Cookie de cliente renomeado não pode autenticar no painel.');
  await swapped.close();
  await owner.page.screenshot({ path: join(artifacts, 'laravel-admin-orders.png'), fullPage: true });

  await customer.page.reload();
  await customer.page.getByRole('button', { name: 'Pedidos', exact: true }).first().click();
  await customer.page.getByRole('heading', { name: 'Pedido PC-INTEGRACAO-DELIVERY', exact: true }).waitFor();
  await customer.page.getByRole('heading', { name: 'Pedido PC-INTEGRACAO-PICKUP', exact: true }).waitFor();
  await customer.page.getByRole('article', { name: 'Pedido PC-INTEGRACAO-DELIVERY', exact: true }).getByText('Em preparação', { exact: true }).waitFor();
  await customer.page.getByRole('article', { name: 'Pedido PC-INTEGRACAO-PICKUP', exact: true }).getByText('Retirado', { exact: true }).waitFor();
  const customerResponse = await customer.context.request.get(`${base}/api/v1/orders`, { headers: { Origin: base, Accept: 'application/json' } });
  assert.equal(customerResponse.status(), 200);
  const customerOrders = (await customerResponse.json()).data;
  assert.equal(customerOrders.length, 2);
  assert.equal(customerOrders.find((order) => order.order_number === deliveryOrder.order_number).fulfillment_status, 'preparing');
  assert.equal(customerOrders.find((order) => order.fulfillment_method === 'pickup').fulfillment_status, 'collected');
  for (const order of customerOrders) {
    assert.equal(Object.hasOwn(order, 'fulfillment_history'), false);
    assert.equal(Object.hasOwn(order, 'fulfillment_allowed_statuses'), false);
  }
  await customer.page.screenshot({ path: join(artifacts, 'laravel-customer-orders.png'), fullPage: true });
  await customer.page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await customer.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await customer.page.screenshot({ path: join(artifacts, 'laravel-customer-orders-mobile.png'), fullPage: true });
  await customer.page.setViewportSize({ width: 1440, height: 1000 });
  const customerLogout = customer.page.waitForResponse(`${base}/api/v1/logout`);
  await customer.page.getByRole('button', { name: 'Sair', exact: true }).first().click();
  assert.equal((await customerLogout).status(), 200);
  assert.equal((await owner.context.request.get(`${base}/api/v1/admin/auth/me`, { headers })).status(), 200, 'Sair da loja encerrou o painel.');
  await login(customer.page, 'customer');
  const adminLogout = owner.page.waitForResponse(`${base}/api/v1/admin/auth/logout`);
  await owner.page.getByRole('button', { name: 'Sair do painel', exact: true }).click();
  assert.equal((await adminLogout).status(), 200);
  assert.equal((await owner.context.request.get(`${base}/api/v1/admin/auth/me`, { headers })).status(), 401);
  assert.equal((await customer.context.request.get(`${base}/api/v1/me`, { headers })).status(), 200, 'Sair do painel encerrou a conta da loja.');
  const other = await contextFor();
  await login(other.page, 'other');
  assert.equal((await other.context.request.get(`${base}/api/v1/admin/orders`, { headers })).status(), 401, 'Sessão exclusiva de cliente não pode autorizar o painel.');
  const hidden = await other.context.request.get(`${base}/api/v1/orders/${deliveryOrder.order_number}`, { headers: { Origin: base, Accept: 'application/json' } });
  assert.equal(hidden.status(), 404, 'Outro cliente não deve consultar este pedido.');
  console.log(php('verify'));
  assert.deepEqual(pageErrors, [], 'Erros JavaScript no navegador.');
  console.log('Integração real local aprovada: sessões e CSRF separados, logouts independentes no mesmo navegador, cookies trocados recusados, MFA, pedidos e isolamento entre contas. Nenhuma cobrança ou envio.');
} catch (error) {
  let message = error.stack || String(error);
  for (const secret of secrets) message = message.replaceAll(secret, '[omitido]');
  console.error(message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    const closed = once(server, 'exit');
    server.kill('SIGTERM');
    await closed;
  }
  await rm(directory, { recursive: true, force: true });
}
