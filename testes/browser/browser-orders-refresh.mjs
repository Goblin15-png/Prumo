// Chromium → Laravel → SQLite exclusivo. Pagamento simulado; nenhum serviço externo.
// Uma resposta real da listagem é retida para reproduzir edição durante uma consulta.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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
const secrets = [];
let server;
let browser;
let releaseHeldResponse;
const deferred = () => {
  let resolvePromise;
  const promise = new Promise((done) => { resolvePromise = done; });
  return { promise, resolve: resolvePromise };
};
const within = async (promise) => {
  let timeout;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('A listagem de pedidos não respondeu ao evento esperado.')), 10000);
    })]);
  } finally { clearTimeout(timeout); }
};

try {
  await readFile(join(root, 'frontend/dist/index.html'));
  await mkdir(join(directory, 'storage/framework/views'), { recursive: true });
  const credentials = { password: randomBytes(24).toString('hex'), appKey: `base64:${randomBytes(32).toString('base64')}` };
  secrets.push(...Object.values(credentials));
  await writeFile(join(directory, 'credentials.json'), JSON.stringify(credentials), { mode: 0o600, flag: 'wx' });
  await writeFile(join(directory, 'test.sqlite'), '', { mode: 0o600, flag: 'wx' });

  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((done) => probe.close(done));
  const base = `http://127.0.0.1:${port}`;
  const env = { PATH: process.env.PATH, PROTOCOLAR_BROWSER_DIR: directory, PROTOCOLAR_BROWSER_ORIGIN: base, PROTOCOLAR_PREVIEW_CHECKOUT: '1' };
  const environment = join(root, 'testes/backend/Browser/environment.php');
  const php = (action) => execFileSync('php', [environment, action], { env, cwd: root, encoding: 'utf8' }).trim();
  console.log(php('setup'));
  server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', join(root, 'frontend/dist'), join(root, 'testes/backend/Browser/server.php')], { env, cwd: root, stdio: 'ignore' });
  let serverError;
  server.on('error', (error) => { serverError = error; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error('O servidor PHP isolado não iniciou.');
    try { ready = (await fetch(`${base}/up`, { signal: AbortSignal.timeout(2000) })).ok; } catch { /* aguarda inicialização */ }
    if (ready) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(ready, 'O Laravel isolado não respondeu.');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const errors = [];
  const customer = await context.newPage();
  const owner = await context.newPage();
  for (const page of [customer, owner]) {
    page.setDefaultTimeout(10000);
    page.on('pageerror', (error) => errors.push(error.message));
  }
  // Controla somente o tempo da aba administrativa: sem esperas reais de 15 segundos.
  await owner.clock.install();
  await owner.clock.pauseAt(new Date(Date.now() + 1000));
  const ordersPath = '/api/v1/admin/orders';
  const orderRequests = [];
  owner.on('request', (request) => {
    if (new URL(request.url()).pathname === ordersPath && request.method() === 'GET') orderRequests.push(new URL(request.url()));
  });
  const ordersResponse = () => owner.waitForResponse((response) => new URL(response.url()).pathname === ordersPath && response.request().method() === 'GET');
  const card = (number) => owner.getByRole('article', { name: `Gerenciar pedido ${number}`, exact: true });
  const panel = owner.locator('#admin-pedidos');
  const visibleOrders = () => panel.getByRole('article').count();
  const login = async (page, profile) => {
    const admin = profile === 'owner';
    await page.getByRole('button', { name: admin ? 'Acessar painel' : 'Entrar', exact: true }).first().click();
    await page.getByPlaceholder('seuemail@exemplo.com').fill(`${profile}@example.invalid`);
    await page.getByPlaceholder('Sua senha').fill(credentials.password);
    const response = page.waitForResponse(`${base}/api/v1/${admin ? 'admin/auth/login' : 'login'}`);
    await page.getByRole('button', { name: admin ? 'Entrar no painel' : 'Entrar no Pruma Essential', exact: true }).click();
    assert.equal((await response).status(), 200, 'Login da conta fictícia falhou.');
  };
  await customer.goto(base);
  await customer.getByRole('button', { name: 'Recusar rastreamento', exact: true }).click();
  await login(customer, 'customer');
  await owner.goto(`${base}/admin`);
  await login(owner, 'owner');
  const otp = php('otp');
  secrets.push(otp);
  await owner.getByPlaceholder('Código de autenticação').fill(otp);
  const initialOrders = ordersResponse();
  await owner.getByRole('button', { name: 'Verificar código', exact: true }).click();
  assert.equal((await initialOrders).status(), 200);
  await card('PC-INTEGRACAO-DELIVERY').waitFor();
  await card('PC-INTEGRACAO-PICKUP').waitFor();
  assert.equal(await card('PC-INTEGRACAO-PENDING').count(), 0, 'Pedidos sem pagamento não devem entrar na fila.');
  assert.equal(await visibleOrders(), 2);

  // Compra pela UI da loja enquanto o painel permanece aberto.
  await customer.getByRole('heading', { name: 'Blend de teste integrado', exact: true }).first().click();
  await customer.getByRole('button', { name: 'Adicionar à Sacola', exact: true }).click();
  await customer.getByRole('button', { name: 'Continuar para o checkout', exact: true }).click();
  await customer.getByRole('radio', { name: 'Retirada em loja', exact: true }).check();
  await customer.getByLabel('Nome de quem vai retirar', { exact: true }).fill('Pessoa fictícia do teste');
  await customer.getByLabel('CPF', { exact: true }).fill('12345678909');
  const paidResponse = customer.waitForResponse(`${base}/api/v1/checkout/transparent`);
  await customer.getByRole('button', { name: 'Finalizar pedido (teste)', exact: true }).click();
  const paid = await paidResponse;
  assert.equal(paid.status(), 200);
  const firstOrder = await paid.json();
  assert.equal(firstOrder.status, 'paid');
  await customer.getByRole('heading', { name: 'Pagamento confirmado', exact: true }).waitFor();
  const onFocus = ordersResponse();
  await owner.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.equal((await onFocus).status(), 200);
  await card(firstOrder.order_number).waitFor();
  assert.equal(await visibleOrders(), 3, 'O pedido pago deve chegar sem recarregar a página nem clicar em Atualizar.');
  console.log('Pedido finalizado no checkout apareceu no painel já aberto ao recuperar o foco.');

  // Polling mantém os filtros aplicados e não esvazia os cartões durante a consulta.
  await owner.getByRole('textbox', { name: 'Buscar pedidos', exact: true }).fill(firstOrder.order_number);
  await owner.getByRole('combobox', { name: 'Etapa de preparo e entrega', exact: true }).selectOption('confirmed');
  let filtered = ordersResponse();
  await owner.getByRole('button', { name: 'Filtrar pedidos', exact: true }).click();
  await filtered;
  await owner.waitForFunction(() => document.querySelectorAll('#admin-pedidos article').length === 1);
  const polled = ordersResponse();
  await owner.clock.fastForward(15001);
  const pollResponse = await polled;
  assert.equal(pollResponse.status(), 200);
  const pollUrl = new URL(pollResponse.url());
  assert.equal(pollUrl.searchParams.get('search'), firstOrder.order_number);
  assert.equal(pollUrl.searchParams.get('fulfillment_stage'), 'confirmed');
  assert.equal(pollUrl.searchParams.get('page'), '1');
  assert.equal(await visibleOrders(), 1);
  assert.equal(await panel.getByText('Carregando pedidos…', { exact: true }).count(), 0);
  await owner.getByRole('textbox', { name: 'Buscar pedidos', exact: true }).fill('');
  await owner.getByRole('combobox', { name: 'Etapa de preparo e entrega', exact: true }).selectOption('');
  filtered = ordersResponse();
  await owner.getByRole('button', { name: 'Filtrar pedidos', exact: true }).click();
  await filtered;
  await card('PC-INTEGRACAO-DELIVERY').waitFor();

  const cookies = await context.cookies(base);
  secrets.push(...cookies.map((cookie) => cookie.value));
  const csrf = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN');
  assert.ok(csrf, 'A compra de teste precisa do CSRF da sessão de cliente.');
  const products = await context.request.get(`${base}/api/v1/products`);
  const product = (await products.json()).data.find((item) => item.slug === 'blend-teste-integrado');
  assert.ok(product);
  const createPaidOrder = async () => {
    const response = await context.request.post(`${base}/api/v1/checkout/transparent`, {
      headers: { Origin: base, Accept: 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(csrf.value) },
      data: {
        idempotency_key: randomUUID(), items: [{ product_id: product.id, quantity: 1 }],
        fulfillment_method: 'pickup', pickup_contact_name: 'Pessoa fictícia do teste',
        expected_subtotal: '49.90', expected_shipping_price: '0.00',
        payment: { type: 'pix', identification: { type: 'CPF', number: '12345678909' } },
      },
    });
    assert.equal(response.status(), 200, 'Checkout local simulado falhou.');
    const order = await response.json();
    assert.equal(order.status, 'paid');
    return order;
  };
  const delivery = card('PC-INTEGRACAO-DELIVERY');
  const stage = delivery.getByRole('combobox', { name: 'Status do pedido PC-INTEGRACAO-DELIVERY', exact: true });
  const tracking = delivery.getByRole('textbox', { name: 'Código de rastreio do pedido PC-INTEGRACAO-DELIVERY', exact: true });
  await stage.selectOption('shipped');
  await tracking.fill('RASTREIO-FICTICIO-EM-EDICAO');
  const pausedCount = orderRequests.length;
  const secondOrder = await createPaidOrder();
  await owner.clock.fastForward(45001);
  await owner.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.equal(orderRequests.length, pausedCount, 'Atualização automática deve pausar enquanto há um rascunho.');
  assert.equal(await stage.inputValue(), 'shipped');
  assert.equal(await tracking.inputValue(), 'RASTREIO-FICTICIO-EM-EDICAO');
  assert.equal(await card(secondOrder.order_number).count(), 0);
  const save = async () => {
    const response = owner.waitForResponse((response) => response.url().endsWith('/fulfillment') && response.request().method() === 'PATCH');
    const reloaded = ordersResponse();
    await delivery.getByRole('button', { name: 'Salvar status', exact: true }).click();
    assert.equal((await response).status(), 200);
    assert.equal((await reloaded).status(), 200);
    await delivery.getByRole('button', { name: 'Salvar status', exact: true }).waitFor();
  };
  await save();
  await card(secondOrder.order_number).waitFor();
  assert.equal(await visibleOrders(), 4);
  console.log('Polling preservou filtros; rascunhos de status/rastreio pausaram consultas e foram salvos.');

  // O pedido seguinte já existe no Laravel, mas a resposta chega depois de começar uma edição.
  const thirdOrder = await createPaidOrder();
  const started = deferred();
  const release = deferred();
  const finished = deferred();
  releaseHeldResponse = release.resolve;
  let hold = true;
  const ordersMatcher = (url) => url.pathname === ordersPath;
  const holdResponse = async (route) => {
    if (!hold) return route.continue();
    hold = false;
    try {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      assert.ok((await response.json()).data.some((order) => order.order_number === thirdOrder.order_number));
      started.resolve();
      await release.promise;
      await route.fulfill({ response });
    } finally { finished.resolve(); }
  };
  await owner.route(ordersMatcher, holdResponse);
  const delayed = ordersResponse();
  await owner.clock.fastForward(15001);
  await within(started.promise);
  assert.equal(await visibleOrders(), 4, 'A atualização silenciosa deve manter os cartões durante a espera.');
  assert.equal(await panel.getByText('Carregando pedidos…', { exact: true }).count(), 0);
  await stage.selectOption('delivered');
  await tracking.fill('RASTREIO-FICTICIO-NOVO');
  release.resolve();
  await within(finished.promise);
  await delayed;
  await owner.clock.runFor(100);
  assert.equal(await card(thirdOrder.order_number).count(), 0, 'Resposta iniciada antes da edição deve ser ignorada.');
  assert.equal(await stage.inputValue(), 'delivered');
  assert.equal(await tracking.inputValue(), 'RASTREIO-FICTICIO-NOVO');
  await owner.unroute(ordersMatcher, holdResponse);
  await save();
  await card(thirdOrder.order_number).waitFor();
  assert.equal(await visibleOrders(), 5);
  assert.equal(await card('PC-INTEGRACAO-PENDING').count(), 0);
  // Um rascunho fora do filtro continua visível como pendência e pode ser descartado.
  await stage.selectOption('preparing');
  await owner.getByRole('textbox', { name: 'Buscar pedidos', exact: true }).fill(firstOrder.order_number);
  filtered = ordersResponse();
  await owner.getByRole('button', { name: 'Filtrar pedidos', exact: true }).click();
  await filtered;
  await owner.waitForFunction(() => document.querySelectorAll('#admin-pedidos article').length === 1);
  const hiddenDraftCount = orderRequests.length;
  await owner.clock.fastForward(15001);
  assert.equal(orderRequests.length, hiddenDraftCount);
  const discarded = ordersResponse();
  await panel.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
  assert.equal((await discarded).status(), 200);
  await panel.getByRole('button', { name: 'Descartar alterações', exact: true }).waitFor({ state: 'detached' });
  const resumed = ordersResponse();
  await owner.clock.fastForward(15001);
  assert.equal(new URL((await resumed).url()).searchParams.get('search'), firstOrder.order_number);
  await owner.getByRole('textbox', { name: 'Buscar pedidos', exact: true }).fill('');
  filtered = ordersResponse();
  await owner.getByRole('button', { name: 'Filtrar pedidos', exact: true }).click();
  await filtered;
  await delivery.waitFor();
  assert.equal(await stage.inputValue(), 'delivered', 'Descartar não deve gravar o rascunho no servidor.');
  console.log('Rascunho fora do filtro pôde ser descartado; atualização automática retomou sem alterar o pedido.');
  assert.deepEqual(errors, [], 'Erros JavaScript no navegador.');
  console.log('Resposta atrasada respeitou a edição em andamento; novos pedidos pagos apareceram após salvar.');
  console.log('Atualização de pedidos aprovada com UI real, MFA, sessões separadas e SQLite descartável. Nenhuma cobrança ou envio real.');
} catch (error) {
  let message = error.stack || String(error);
  for (const secret of secrets) message = message.replaceAll(secret, '[omitido]');
  console.error(message);
  process.exitCode = 1;
} finally {
  releaseHeldResponse?.();
  await browser?.close();
  if (server && server.exitCode === null) {
    const closed = once(server, 'exit');
    server.kill('SIGTERM');
    await closed;
  }
  await rm(directory, { recursive: true, force: true });
}
