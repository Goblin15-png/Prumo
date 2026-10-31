// Opcional: executar com Playwright instalado fora do projeto; consulte LANCAMENTO.md.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { demoAudienceMetrics } from '../demo/demoModel.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Os testes só podem acessar uma prévia local.');
const demoBase = process.env.DEMO_BASE_URL || 'http://127.0.0.1:4174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(demoBase).hostname));
const artifacts = process.env.SMOKE_ARTIFACTS || '/tmp/protocolar-smoke';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const ownerPermissions = ['products.view', 'products.create', 'products.update', 'products.delete', 'categories.view', 'health.view', 'insights.generate', 'orders.view', 'orders.ship', 'orders.fulfillment.update'];
const symptoms = [{ id: 1, name: 'Alvo A' }, { id: 2, name: 'Alvo B' }];
const product = { id: 1, name: 'Blend fictício', slug: 'blend-ficticio', price: '49.90', stock: 8, images: [], ingredients: [], tags: [], symptoms: [], category_id: null, sales_count: 1, is_active: true };

async function contextFor(profile = null, { storageBlocked = false, cookiesBlocked = false, catalogFails = false, commerce = false, ordersFail = false, ordersEmpty = false, readOnlyOrders = false, unverified = false, localTestMode = false, fulfillmentConflict = false, colorScheme = 'light' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme });
  const requests = [];
  const writes = [];
  const queries = [];
  const ingredients = [];
  const groups = [{ id: 11, name: 'Categoria A', products: [product, { ...product, id: 2, name: 'Outro blend' }] }, { id: 12, name: 'Categoria B', products: [product] }];
  const catalog = () => [product, { ...product, id: 2, name: 'Outro blend' }].map((item) => ({ ...item, categories: groups.filter((group) => group.products.some((linked) => linked.id === item.id)).map(({ id, name }) => ({ id, name, pivot: { sort_order: 0 } })) }));
  const order = { id: 1, order_number: 'PC-FICTICIO-1', status: profile === 'customer' ? 'shipped' : 'paid', total_price: '49.90', items: [{ product_name: 'Blend fictício', quantity: 1, unit_price: 49.9, subtotal: 49.9 }], created_at: '2026-10-14T12:00:00Z', user: { name: 'Pessoa fictícia', email: 'customer@example.invalid' }, shipping_method: 'Entrega fictícia', tracking_code: profile === 'customer' ? 'RASTREIO-FICTICIO' : null };
  Object.assign(order, { fulfillment_method: 'delivery', fulfillment_status: profile === 'customer' ? 'shipped' : 'confirmed', fulfillment_revision: 0, fulfillment_allowed_statuses: ['confirmed', 'preparing', 'shipped', 'delivered'], fulfillment_history: [] });
  let shouldFail = catalogFails;
  let orderShouldFail = ordersFail;
  let conflictNextStatus = fulfillmentConflict;
  const user = profile ? { id: 1, name: 'Pessoa fictícia', role: profile === 'customer' ? 'customer' : 'admin', admin_profile: profile, admin_permissions: profile === 'owner' ? ownerPermissions.filter((permission) => !readOnlyOrders || !['orders.ship', 'orders.fulfillment.update'].includes(permission)) : profile === 'technical' ? ['system.view'] : [], email_verified_at: unverified ? null : '2026-01-01' } : null;
  if (storageBlocked) {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
    });
  }
  if (cookiesBlocked) {
    await context.addInitScript(() => {
      Object.defineProperty(document, 'cookie', {
        get() { throw new DOMException('Blocked', 'SecurityError'); },
        set() { throw new DOMException('Blocked', 'SecurityError'); },
      });
    });
  }
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/sanctum/')) {
      requests.push(url.pathname);
      queries.push(url.toString());
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': base, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE', 'access-control-allow-headers': 'content-type,accept,x-xsrf-token' } });
      const headers = { 'access-control-allow-origin': base, 'access-control-allow-credentials': 'true' };
      const path = url.pathname.replace('/api/v1', '');
      if (request.method() !== 'GET') {
        const payload = request.postData() ? request.postDataJSON() : null;
        writes.push({ path, payload });
        if (commerce) {
          const assignment = path.match(/^\/admin\/categories\/(\d+)\/products$/);
          const removal = path.match(/^\/admin\/categories\/(\d+)\/products\/(\d+)$/);
          if (assignment) {
            const group = groups.find((item) => item.id === Number(assignment[1]));
            for (const id of payload.product_ids) if (!group.products.some((item) => item.id === id)) group.products.push(catalog().find((item) => item.id === id));
          }
          if (removal) {
            const group = groups.find((item) => item.id === Number(removal[1]));
            group.products = group.products.filter((item) => item.id !== Number(removal[2]));
          }
          if (path === '/admin/ingredients') ingredients.push({ id: 1, ...payload });
          if (path.endsWith('/shipment')) { order.tracking_code = payload.tracking_code; order.status = 'shipped'; }
          if (path.endsWith('/fulfillment')) {
            if (conflictNextStatus) {
              conflictNextStatus = false;
              order.fulfillment_status = 'preparing';
              order.fulfillment_revision++;
              return route.fulfill({ status: 409, json: { message: 'O pedido foi alterado por outra operação. Atualize a lista e selecione o status novamente.' }, headers });
            }
            assert.equal(payload.expected_revision, order.fulfillment_revision);
            assert.deepEqual(Object.keys(payload).sort(), ['expected_revision', 'fulfillment_status', 'tracking_code']);
            order.fulfillment_history.push({ from: order.fulfillment_status, to: payload.fulfillment_status, actor: user.name, at: '2026-10-14T12:00:00Z', previous_tracking_code: order.tracking_code });
            order.fulfillment_status = payload.fulfillment_status;
            order.fulfillment_revision++;
            order.tracking_code = ['shipped', 'delivered'].includes(payload.fulfillment_status) ? payload.tracking_code : null;
            return route.fulfill({ json: { message: 'Status salvo.', data: order }, headers });
          }
        }
        return route.fulfill({ status: 201, json: { product: { ...product, ...payload } }, headers });
      }
      if (path === '/products' && shouldFail) return route.fulfill({ status: 503, json: { message: 'Falha simulada' }, headers });
      if (path === '/orders' && orderShouldFail) return route.fulfill({ status: 503, json: { message: 'Falha simulada nos pedidos' }, headers });
      const responses = {
        '/orders': { data: ordersEmpty ? [] : [order] },
        '/products': { data: commerce ? catalog() : [product] }, '/categories': commerce ? groups.map(({ id, name }) => ({ id, name })) : [], '/runtime-config': { local_test_mode: localTestMode },
        '/me': { user: profile === 'customer' ? user : null }, '/admin/auth/me': { user: profile === 'customer' ? null : user }, '/admin/categories': { categories: commerce ? groups : [], products: commerce ? catalog() : [product] },
        '/admin/products': { products: commerce ? catalog() : [product] }, '/admin/taxonomy': { tags: [], ingredients, symptoms },
        '/admin/health-metrics': { total_clients_analyzed: 20, symptoms_distribution: [], demand_mapping: [], ...(commerce ? demoAudienceMetrics : {}) },
        '/admin/orders': { data: commerce && (!url.searchParams.get('status') || url.searchParams.get('status') === order.status) && (!url.searchParams.get('fulfillment_stage') || url.searchParams.get('fulfillment_stage') === order.fulfillment_status) ? [order] : [], meta: { current_page: Number(url.searchParams.get('page') || 1), last_page: commerce ? 2 : 1, total: commerce ? 26 : 0 } }, '/admin/system-status': { api: 'available', database: 'available' },
      };
      assert.ok(Object.hasOwn(responses, path), `Endpoint inesperado: ${path}`);
      return route.fulfill({ json: responses[path], headers });
    }
    if (url.hostname === 'example.invalid' && request.resourceType() === 'image') return route.fulfill({ contentType: 'image/png', body: await readFile(new URL('../../frontend/public/Protocolo.png', import.meta.url)) });
    if (![base, demoBase].includes(url.origin)) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page, requests, writes, queries, recoverCatalog: () => { shouldFail = false; }, recoverOrders: () => { orderShouldFail = false; } };
}

async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'A página transborda horizontalmente.');
}

async function themeIs(page, theme) {
  await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, theme);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), theme);
}

async function readable(locator) {
  const ratio = await locator.evaluate((element) => {
    const channels = (color) => (color.match(/[\d.]+/g) || []).map(Number);
    const foreground = channels(getComputedStyle(element).color);
    let parent = element;
    let background;
    while (parent) {
      const color = channels(getComputedStyle(parent).backgroundColor);
      if (color.length === 3 || color[3] === 1) { background = color; break; }
      parent = parent.parentElement;
    }
    if (!background) return 0;
    const luminance = (color) => color.slice(0, 3).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  });
  assert.ok(ratio >= 4.5, `Contraste insuficiente no conteúdo verificado: ${ratio.toFixed(2)}.`);
}

try {
  const appearance = await contextFor(null, { colorScheme: 'dark' });
  await appearance.page.goto(`${demoBase}/`);
  await appearance.page.getByRole('heading', { name: 'Explore nossos blends' }).waitFor();
  await themeIs(appearance.page, 'light');
  assert.equal((await appearance.context.cookies()).some((cookie) => cookie.name === 'protocolo-theme'), false);
  await appearance.page.getByRole('button', { name: 'Ativar modo escuro', exact: true }).click();
  await themeIs(appearance.page, 'dark');
  await readable(appearance.page.getByRole('heading', { name: 'Explore nossos blends' }));
  await readable(appearance.page.getByRole('textbox', { name: 'Buscar produtos fictícios', exact: true }));
  await appearance.page.screenshot({ path: `${artifacts}/theme-demo-dark.png`, fullPage: true });
  await appearance.page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(appearance.page);
  await appearance.page.screenshot({ path: `${artifacts}/theme-demo-dark-mobile.png`, fullPage: true });
  await appearance.page.getByRole('button', { name: 'Ativar modo claro', exact: true }).focus();
  await appearance.page.keyboard.press('Enter');
  await themeIs(appearance.page, 'light');
  await appearance.page.reload();
  await themeIs(appearance.page, 'light');
  const savedTheme = (await appearance.context.cookies()).find((cookie) => cookie.name === 'protocolo-theme');
  assert.equal(savedTheme.value, 'light');
  assert.equal(savedTheme.path, '/');
  assert.equal(savedTheme.sameSite, 'Lax');
  assert.ok(savedTheme.expires > Date.now() / 1000 + 360 * 86400);
  assert.equal(await appearance.page.evaluate(() => localStorage.getItem('protocolo-theme')), null);
  await appearance.page.goto(`${base}/admin`);
  await appearance.page.getByRole('heading', { name: 'Administração da loja', exact: true }).waitFor();
  await themeIs(appearance.page, 'light');
  await appearance.page.getByRole('button', { name: 'Ativar modo escuro', exact: true }).click();
  await appearance.page.getByRole('button', { name: 'Acessar painel', exact: true }).click();
  await appearance.page.getByRole('heading', { name: 'Entrar no painel', exact: true }).waitFor();
  await readable(appearance.page.getByPlaceholder('seuemail@exemplo.com'));
  await appearance.page.screenshot({ path: `${artifacts}/theme-admin-login-dark-mobile.png`, fullPage: true });
  const otherTab = await appearance.context.newPage();
  otherTab.on('pageerror', (error) => errors.push(error.message));
  await otherTab.goto(base);
  await otherTab.getByRole('button', { name: 'Recusar rastreamento', exact: true }).click();
  await otherTab.getByRole('heading', { name: /^Blend fictício$/i }).first().waitFor();
  await themeIs(otherTab, 'dark');
  await otherTab.screenshot({ path: `${artifacts}/theme-store-dark.png`, fullPage: true });
  await otherTab.setViewportSize({ width: 390, height: 844 });
  await noOverflow(otherTab);
  assert.equal(await otherTab.getByRole('button', { name: 'Início', exact: true }).evaluate((button) => button.getBoundingClientRect().left >= button.closest('nav').getBoundingClientRect().left), true, 'O início do menu móvel ficou recortado.');
  await otherTab.screenshot({ path: `${artifacts}/theme-store-dark-mobile.png`, fullPage: true });
  await otherTab.getByRole('button', { name: 'Ativar modo claro', exact: true }).click();
  await themeIs(appearance.page, 'light');
  await themeIs(otherTab, 'light');
  await otherTab.getByRole('button', { name: 'Ativar modo escuro', exact: true }).click();
  await themeIs(appearance.page, 'dark');
  await appearance.page.goto(`${demoBase}/?view=checkout&persona=cliente`);
  await appearance.page.getByRole('heading', { name: 'Checkout de demonstração', exact: true }).waitFor();
  await themeIs(appearance.page, 'dark');
  await appearance.page.screenshot({ path: `${artifacts}/theme-checkout-dark-mobile.png`, fullPage: true });
  await appearance.context.close();

  const automatic = await contextFor();
  await automatic.page.goto(`${demoBase}/`);
  await automatic.page.getByRole('heading', { name: 'Explore nossos blends' }).waitFor();
  await automatic.page.emulateMedia({ colorScheme: 'dark' });
  await themeIs(automatic.page, 'light');
  await automatic.page.getByRole('button', { name: 'Ativar modo escuro', exact: true }).click();
  await automatic.page.emulateMedia({ colorScheme: 'light' });
  await automatic.page.emulateMedia({ colorScheme: 'dark' });
  await themeIs(automatic.page, 'dark');
  await automatic.page.reload();
  await themeIs(automatic.page, 'dark');
  await automatic.page.evaluate(() => {
    document.cookie = 'protocolo-theme=valor-invalido; Path=/';
    localStorage.setItem('protocolo-theme', 'dark'); // preferência antiga não define mais o tema
  });
  await automatic.page.reload();
  await themeIs(automatic.page, 'light');
  assert.deepEqual(automatic.requests, [], 'Trocar tema na demo chamou a API.');
  await automatic.context.close();
  const temporaryTheme = await contextFor(null, { storageBlocked: true, cookiesBlocked: true });
  await temporaryTheme.page.goto(`${demoBase}/`);
  await temporaryTheme.page.getByRole('heading', { name: 'Explore nossos blends' }).waitFor();
  await temporaryTheme.page.getByRole('button', { name: 'Ativar modo escuro', exact: true }).click();
  await themeIs(temporaryTheme.page, 'dark');
  await temporaryTheme.page.reload();
  await themeIs(temporaryTheme.page, 'light');
  assert.deepEqual(temporaryTheme.requests, []);
  await temporaryTheme.context.close();
  console.log('PASS: claro por padrão, preferência em cookie, sincronização entre abas da loja/painel e preferência da demo, contraste verificado e cookies bloqueados.');

  const demo = await contextFor();
  await demo.page.goto(`${demoBase}/`);
  await demo.page.getByRole('heading', { name: 'Explore nossos blends' }).waitFor();
  const demoPages = demo.page.getByRole('navigation', { name: 'Páginas para testar' });
  assert.equal(await demoPages.getByRole('button', { name: 'Catálogo', exact: true }).count(), 0);
  assert.equal(await demoPages.getByRole('button', { name: 'Início', exact: true }).getAttribute('aria-current'), 'page');
  await demo.page.getByRole('navigation', { name: 'Categorias do catálogo', exact: true }).getByRole('link', { name: 'Aromas florais', exact: true }).waitFor();
  const floralShelf = demo.page.getByRole('region', { name: 'Aromas florais', exact: true });
  const citrusShelf = demo.page.getByRole('region', { name: 'Aromas cítricos', exact: true });
  await floralShelf.getByRole('heading', { name: 'Blend Floral', exact: true }).waitFor();
  await citrusShelf.getByRole('heading', { name: 'Blend Floral', exact: true }).waitFor();
  const catalogSearch = demo.page.getByRole('textbox', { name: 'Buscar produtos fictícios', exact: true });
  await catalogSearch.fill('Blend Floral');
  const searchResults = demo.page.getByRole('region', { name: 'Resultados da busca', exact: true });
  assert.equal(await searchResults.getByRole('heading', { name: 'Blend Floral', exact: true }).count(), 1);
  await catalogSearch.fill('produto inexistente');
  await demo.page.getByText('Nenhum produto encontrado. Tente outro nome ou ingrediente.', { exact: true }).waitFor();
  await demo.page.getByRole('button', { name: 'Limpar busca', exact: true }).click();
  await floralShelf.waitFor();
  await demo.page.screenshot({ path: `${artifacts}/demo-desktop.png`, fullPage: true });
  for (const width of [390, 1440]) {
    await demo.page.setViewportSize({ width, height: 1000 });
    for (const view of ['inicio', 'catalogo', 'carrinho', 'checkout', 'conta', 'pedidos', 'admin']) {
      await demo.page.goto(`${demoBase}/?view=${view}&persona=admin`);
      await demo.page.getByRole('navigation', { name: 'Páginas para testar' }).waitFor();
      await noOverflow(demo.page);
      if (view === 'inicio' || view === 'catalogo') {
        await demo.page.getByRole('region', { name: 'Aromas florais', exact: true }).waitFor();
        assert.equal(await demoPages.getByRole('button', { name: 'Início', exact: true }).getAttribute('aria-current'), 'page');
        await demo.page.screenshot({ path: `${artifacts}/demo-catalog-${width}.png`, fullPage: true });
      }
    }
  }
  await demo.page.goto(`${demoBase}/?view=admin&persona=admin`);
  await demo.page.getByRole('heading', { name: 'Público, origem e queixas' }).waitFor();
  assert.equal(await demo.page.getByRole('heading', { name: 'Adicionar produto à categoria', exact: true }).count(), 0);
  const floralCategory = demo.page.getByRole('article', { name: 'Categoria Aromas florais', exact: true });
  const citrusCategory = demo.page.getByRole('article', { name: 'Categoria Aromas cítricos', exact: true });
  await floralCategory.getByRole('button', { name: 'Remover Blend Floral de Aromas florais', exact: true }).waitFor();
  await citrusCategory.getByRole('button', { name: 'Remover Blend Floral de Aromas cítricos', exact: true }).waitFor();
  await citrusCategory.getByRole('button', { name: 'Adicionar produto à categoria', exact: true }).click();
  await citrusCategory.getByRole('checkbox', { name: /^Blend Jardim/ }).check();
  await citrusCategory.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(await citrusCategory.getByRole('button', { name: 'Remover Blend Jardim de Aromas cítricos', exact: true }).count(), 0);
  await citrusCategory.getByRole('button', { name: 'Adicionar produto à categoria', exact: true }).click();
  await citrusCategory.getByRole('checkbox', { name: /^Blend Jardim/ }).check();
  await citrusCategory.getByRole('button', { name: 'Adicionar selecionados', exact: true }).click();
  await citrusCategory.getByRole('button', { name: 'Remover Blend Jardim de Aromas cítricos', exact: true }).waitFor();
  await floralCategory.getByRole('button', { name: 'Remover Blend Jardim de Aromas florais', exact: true }).waitFor();
  const categoryName = demo.page.getByRole('textbox', { name: 'Nome da categoria', exact: true });
  await categoryName.fill('Aromas florais');
  await demo.page.getByRole('button', { name: 'Adicionar categoria', exact: true }).click();
  await demo.page.getByRole('alert').filter({ hasText: 'Já existe uma categoria' }).waitFor();
  await categoryName.fill('Novidades de demonstração');
  await demo.page.getByRole('button', { name: 'Adicionar categoria', exact: true }).click();
  const newCategory = demo.page.getByRole('article', { name: 'Categoria Novidades de demonstração', exact: true });
  await newCategory.getByRole('button', { name: 'Adicionar produto à categoria', exact: true }).click();
  await newCategory.getByRole('checkbox', { name: /^Blend Floral/ }).check();
  await newCategory.getByRole('button', { name: 'Adicionar selecionados', exact: true }).click();
  await newCategory.getByRole('button', { name: 'Editar categoria Novidades de demonstração', exact: true }).click();
  await categoryName.fill('Novidades renomeadas');
  await demo.page.getByRole('button', { name: 'Salvar categoria', exact: true }).click();
  const renamedCategory = demo.page.getByRole('article', { name: 'Categoria Novidades renomeadas', exact: true });
  await renamedCategory.getByRole('button', { name: 'Remover Blend Floral de Novidades renomeadas', exact: true }).waitFor();
  await demoPages.getByRole('button', { name: 'Início', exact: true }).click();
  await demo.page.getByRole('region', { name: 'Novidades renomeadas', exact: true }).getByRole('heading', { name: 'Blend Floral', exact: true }).waitFor();
  await floralShelf.getByRole('heading', { name: 'Blend Floral', exact: true }).waitFor();
  await citrusShelf.getByRole('heading', { name: 'Blend Jardim', exact: true }).waitFor();
  await demoPages.getByRole('button', { name: 'Admin simulado', exact: true }).click();
  await renamedCategory.getByRole('button', { name: 'Editar categoria Novidades renomeadas', exact: true }).click();
  await categoryName.fill('Nome cancelado');
  await demo.page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(await renamedCategory.count(), 1);
  demo.page.once('dialog', (dialog) => dialog.dismiss());
  await renamedCategory.getByRole('button', { name: 'Excluir categoria Novidades renomeadas', exact: true }).click();
  assert.equal(await renamedCategory.count(), 1);
  demo.page.once('dialog', (dialog) => dialog.accept());
  await renamedCategory.getByRole('button', { name: 'Excluir categoria Novidades renomeadas', exact: true }).click();
  await renamedCategory.waitFor({ state: 'hidden' });
  await floralCategory.getByRole('button', { name: 'Remover Blend Floral de Aromas florais', exact: true }).waitFor();
  await citrusCategory.getByRole('button', { name: 'Remover Blend Floral de Aromas cítricos', exact: true }).waitFor();
  await demoPages.getByRole('button', { name: 'Início', exact: true }).click();
  assert.equal(await demo.page.getByRole('region', { name: 'Novidades renomeadas', exact: true }).count(), 0);
  await floralShelf.getByRole('heading', { name: 'Blend Floral', exact: true }).waitFor();
  await demoPages.getByRole('button', { name: 'Admin simulado', exact: true }).click();

  await demo.page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(demo.page);
  await demo.page.screenshot({ path: `${artifacts}/demo-categories-manager-mobile.png`, fullPage: true });
  await demo.page.setViewportSize({ width: 1440, height: 1000 });
  await demo.page.screenshot({ path: `${artifacts}/admin-audience-demo.png`, fullPage: true });
  await demo.page.getByLabel('Nome da queixa', { exact: true }).fill('Ansiedade de demonstração');
  await demo.page.getByRole('button', { name: 'Criar queixa', exact: true }).click();
  await demo.page.getByRole('button', { name: 'Editar queixa Ansiedade de demonstração', exact: true }).waitFor();
  await demo.page.getByRole('button', { name: 'Testar formulário do cliente', exact: true }).click();
  const questionnaire = demo.page.getByRole('dialog', { name: 'Questionário do cliente', exact: true });
  const principal = questionnaire.getByRole('combobox', { name: 'Queixa principal', exact: true });
  await principal.getByRole('option', { name: 'Ansiedade de demonstração', exact: true }).waitFor({ state: 'attached' });
  assert.equal(await principal.evaluate((select) => select.multiple), false);
  assert.equal(await principal.inputValue(), '');
  await principal.selectOption({ label: 'Ansiedade de demonstração' });
  await questionnaire.getByRole('checkbox', { name: /Concordo com o uso/ }).check();
  await demo.page.screenshot({ path: `${artifacts}/demo-client-complaint.png`, fullPage: true });
  await questionnaire.getByRole('button', { name: 'Salvar preferências', exact: true }).click();
  await questionnaire.waitFor({ state: 'hidden' });
  await demo.page.getByRole('status').filter({ hasText: 'Queixa principal fictícia: Ansiedade de demonstração' }).waitFor();
  await demo.page.getByRole('button', { name: 'Editar Blend Floral', exact: true }).click();
  const demoForm = demo.page.getByRole('dialog', { name: 'Editar blend', exact: true });
  await demoForm.locator('summary').filter({ hasText: 'Selecionar queixas do público-alvo' }).click();
  await demoForm.getByRole('checkbox', { name: 'Ansiedade de demonstração', exact: true }).check();
  await demoForm.getByPlaceholder('Ex: Aroma Sono Reparador 10ml').fill('Blend Floral Atualizado');
  await demoForm.getByLabel('Links das fotos do produto').fill('https://example.invalid/primeira.png\nhttps://example.invalid/segunda.png');
  await demoForm.getByRole('button', { name: 'Usar foto 2 como capa', exact: true }).click();
  assert.equal(await demoForm.getByLabel('Links das fotos do produto').inputValue(), 'https://example.invalid/segunda.png\nhttps://example.invalid/primeira.png');
  await demoForm.getByRole('button', { name: 'Remover foto 2', exact: true }).click();
  await demoForm.getByPlaceholder('Nome do ingrediente', { exact: true }).fill('Ingrediente novo da demonstração');
  await demoForm.getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await demoForm.getByRole('option', { name: 'Ingrediente novo da demonstração', exact: true }).first().waitFor({ state: 'attached' });
  await demo.page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(demo.page);
  await demo.page.screenshot({ path: `${artifacts}/demo-edit-product-mobile.png`, fullPage: true });
  await demoForm.getByRole('button', { name: 'Salvar no Catálogo', exact: true }).click();
  await demoForm.waitFor({ state: 'hidden' });
  await demo.page.getByRole('button', { name: 'Editar Blend Floral Atualizado', exact: true }).click();
  await demoForm.getByRole('option', { name: 'Ingrediente novo da demonstração', exact: true }).first().waitFor({ state: 'attached' });
  assert.equal(await demoForm.getByLabel('Links das fotos do produto').inputValue(), 'https://example.invalid/segunda.png');
  assert.equal(await demoForm.locator('option:checked').filter({ hasText: 'Ingrediente novo da demonstração' }).count(), 1);
  await demoForm.getByRole('button', { name: 'Fechar formulário do blend', exact: true }).click();
  demo.page.once('dialog', (dialog) => dialog.dismiss());
  await demo.page.getByRole('button', { name: 'Excluir Blend Floral Atualizado', exact: true }).click();
  assert.equal(await demo.page.getByRole('button', { name: 'Editar Blend Floral Atualizado', exact: true }).count(), 1);
  demo.page.once('dialog', (dialog) => dialog.accept());
  await demo.page.getByRole('button', { name: 'Excluir Blend Floral Atualizado', exact: true }).click();
  await demo.page.getByRole('button', { name: 'Editar Blend Floral Atualizado', exact: true }).waitFor({ state: 'hidden' });
  await demo.page.getByRole('button', { name: 'Adicionar blend', exact: true }).click();
  const createForm = demo.page.getByRole('dialog', { name: 'Cadastrar blend', exact: true });
  await createForm.getByPlaceholder('Ex: Aroma Sono Reparador 10ml').fill('Blend recém-criado');
  await createForm.getByPlaceholder('229.90').fill('29.90');
  await createForm.getByRole('button', { name: 'Salvar no Catálogo', exact: true }).click();
  await demo.page.getByRole('button', { name: 'Editar Blend recém-criado', exact: true }).waitFor();
  await demoPages.getByRole('button', { name: 'Início', exact: true }).click();
  await demo.page.getByRole('region', { name: 'Outros produtos', exact: true }).getByRole('heading', { name: 'Blend recém-criado', exact: true }).waitFor();

  await demo.page.setViewportSize({ width: 390, height: 844 });
  await demo.page.goto(`${demoBase}/?view=checkout`);
  await demo.page.getByRole('button', { name: 'Simular resultado do pagamento' }).click();
  await demo.page.getByRole('status').filter({ hasText: 'Nenhuma transação' }).waitFor();
  await demo.page.screenshot({ path: `${artifacts}/demo-checkout-mobile.png`, fullPage: true });
  await demo.page.getByRole('radio', { name: /^Retirada em loja/ }).check();
  const pickupName = demo.page.getByRole('textbox', { name: 'Nome de quem vai retirar', exact: true });
  assert.equal(await pickupName.inputValue(), 'Cliente Demonstração');
  await pickupName.fill('   ');
  await demo.page.getByRole('button', { name: 'Simular resultado do pagamento', exact: true }).click();
  await demo.page.getByRole('alert').filter({ hasText: 'Informe o nome de quem vai retirar.' }).waitFor();
  assert.equal(await demo.page.getByRole('status').filter({ hasText: 'Nenhuma transação' }).count(), 0);
  await pickupName.fill('Pessoa Fictícia da Retirada');
  assert.equal(await demo.page.getByRole('region', { name: 'Endereço de entrega', exact: true }).count(), 0);
  assert.equal(await demo.page.getByRole('textbox', { name: 'CEP', exact: true }).count(), 0);
  const summary = demo.page.getByRole('region', { name: 'Resumo da compra', exact: true });
  assert.match(await summary.getByText('Total fictício', { exact: true }).locator('..').textContent(), /49,90/);
  await demo.page.getByRole('radio', { name: /^Cartão de crédito/ }).check();
  assert.equal(await demo.page.locator('input[autocomplete^="cc-"]').count(), 0);
  await demo.page.getByRole('button', { name: 'Simular resultado do pagamento' }).click();
  await demo.page.getByRole('status').filter({ hasText: 'Cartão de crédito' }).waitFor();
  await demo.page.getByRole('status').filter({ hasText: 'Pessoa Fictícia da Retirada' }).waitFor();
  assert.match(await summary.textContent(), /Pessoa Fictícia da Retirada/);
  await noOverflow(demo.page);
  await demo.page.screenshot({ path: `${artifacts}/demo-pickup-card-mobile.png`, fullPage: true });
  await pickupName.fill('Outro Nome Fictício');
  await demo.page.getByRole('status').filter({ hasText: 'Cartão de crédito' }).waitFor({ state: 'hidden' });
  await demo.page.getByRole('radio', { name: /^Pix/ }).check();
  await demo.page.getByRole('status').filter({ hasText: 'Cartão de crédito' }).waitFor({ state: 'hidden' });
  await demo.page.getByRole('button', { name: 'Simular resultado do pagamento' }).click();
  await demo.page.getByRole('status').filter({ hasText: 'Pix' }).waitFor();
  await demo.page.setViewportSize({ width: 1440, height: 1000 });
  await noOverflow(demo.page);
  await demo.page.screenshot({ path: `${artifacts}/demo-pickup-pix-desktop.png`, fullPage: true });
  await demo.page.getByRole('radio', { name: /^Receber em casa/ }).check();
  assert.equal(await pickupName.count(), 0);
  await demo.page.getByRole('region', { name: 'Endereço de entrega', exact: true }).waitFor();
  await demo.page.getByRole('radio', { name: /Entrega expressa/ }).check();
  assert.match(await summary.getByText('Total fictício', { exact: true }).locator('..').textContent(), /77,40/);
  await demo.page.getByRole('radio', { name: /^Retirada em loja/ }).check();
  assert.equal(await pickupName.inputValue(), 'Outro Nome Fictício');
  assert.match(await summary.getByText('Total fictício', { exact: true }).locator('..').textContent(), /49,90/);

  await demo.page.getByLabel('Cenário de demonstração').selectOption('pagamento-recusado');
  await demo.page.getByRole('radio', { name: /^Retirada em loja/ }).check();
  await demo.page.getByRole('radio', { name: /^Cartão de crédito/ }).check();
  await demo.page.getByRole('button', { name: 'Simular resultado do pagamento' }).click();
  await demo.page.getByRole('status').filter({ hasText: 'recusado' }).waitFor();
  for (const scenario of ['vazio', 'sem-estoque']) {
    await demo.page.goto(`${demoBase}/?view=checkout&scenario=${scenario}`);
    await demo.page.getByText('Para visualizar o checkout, adicione um produto à sacola.', { exact: false }).waitFor();
    assert.equal(await demo.page.getByRole('button', { name: 'Simular resultado do pagamento' }).count(), 0);
  }
  await demo.page.goto(`${demoBase}/?view=admin&persona=admin`);
  const delivery = demo.page.getByRole('article', { name: 'Gerenciar pedido DEMO-1001', exact: true });
  const pickupOrder = demo.page.getByRole('article', { name: 'Gerenciar pedido DEMO-1003', exact: true });
  await pickupOrder.getByText('Nome para retirada: Cliente Demonstração', { exact: true }).waitFor();
  await delivery.getByText('1× Blend Floral', { exact: true }).waitFor();
  assert.equal(await demo.page.getByRole('article', { name: 'Gerenciar pedido DEMO-1004', exact: true }).count(), 0);
  assert.equal(await delivery.getByRole('button', { name: 'Corrigir etapa', exact: true }).count(), 0);
  assert.equal(await delivery.locator('textarea').count(), 0);
  assert.deepEqual(await delivery.getByLabel('Status do pedido DEMO-1001', { exact: true }).locator('option').evaluateAll((options) => options.map((option) => option.value)), ['confirmed', 'preparing', 'shipped', 'delivered']);
  assert.deepEqual(await pickupOrder.getByLabel('Status do pedido DEMO-1003', { exact: true }).locator('option').evaluateAll((options) => options.map((option) => option.value)), ['confirmed', 'preparing', 'ready_for_pickup', 'collected']);
  const statusDialogs = [];
  const recordDialog = async (dialog) => { statusDialogs.push(dialog.message()); await dialog.dismiss(); };
  demo.page.on('dialog', recordDialog);
  const setDemoStatus = async (card, orderNumber, value, label, tracking) => {
    await card.getByLabel(`Status do pedido ${orderNumber}`, { exact: true }).selectOption(value);
    if (tracking !== undefined) await card.getByLabel(`Código de rastreio do pedido ${orderNumber}`, { exact: true }).fill(tracking);
    await card.getByRole('button', { name: 'Salvar status', exact: true }).click();
    await card.getByRole('group', { name: 'Andamento do pedido', exact: true }).getByText(label, { exact: true }).waitFor();
  };
  await setDemoStatus(delivery, 'DEMO-1001', 'delivered', 'Entregue');
  assert.equal(await delivery.getByRole('button', { name: 'Salvar status', exact: true }).count(), 1);
  const demoNavigation = demo.page.getByRole('navigation', { name: 'Páginas para testar' });
  await demoNavigation.getByRole('button', { name: 'Pedidos', exact: true }).click();
  const customerDelivery = demo.page.getByRole('article', { name: 'Pedido DEMO-1001', exact: true });
  await customerDelivery.getByRole('group', { name: 'Andamento do pedido', exact: true }).getByText('Entregue', { exact: true }).waitFor();
  assert.equal(await customerDelivery.getByRole('list', { name: 'Etapas do pedido', exact: true }).count(), 0);
  assert.equal(await customerDelivery.getByText('Em preparação', { exact: true }).count(), 0);
  assert.equal(await demo.page.getByRole('article', { name: 'Pedido DEMO-1004', exact: true }).count(), 0);
  await noOverflow(demo.page);
  await demo.page.screenshot({ path: `${artifacts}/demo-orders-customer-desktop.png`, fullPage: true });
  await demoNavigation.getByRole('button', { name: 'Admin simulado', exact: true }).click();
  await setDemoStatus(delivery, 'DEMO-1001', 'confirmed', 'Aguardando preparo');
  await setDemoStatus(delivery, 'DEMO-1001', 'shipped', 'A caminho');
  await setDemoStatus(delivery, 'DEMO-1001', 'shipped', 'A caminho', 'DEMO-RASTREIO-1001');
  await delivery.getByText('Rastreio: DEMO-RASTREIO-1001', { exact: true }).waitFor();
  await setDemoStatus(delivery, 'DEMO-1001', 'preparing', 'Em preparação');
  await delivery.getByText('Histórico desta simulação', { exact: true }).click();
  await delivery.getByText('Rastreio anterior: DEMO-RASTREIO-1001', { exact: true }).waitFor();
  await delivery.screenshot({ path: `${artifacts}/demo-direct-order-status-desktop.png` });
  await demoNavigation.getByRole('button', { name: 'Pedidos', exact: true }).click();
  await customerDelivery.getByRole('group', { name: 'Andamento do pedido', exact: true }).getByText('Em preparação', { exact: true }).waitFor();
  assert.equal(await customerDelivery.getByText('DEMO-RASTREIO-1001', { exact: true }).count(), 0);
  assert.equal(await customerDelivery.getByText('Histórico desta simulação', { exact: true }).count(), 0);
  await demoNavigation.getByRole('button', { name: 'Admin simulado', exact: true }).click();
  await setDemoStatus(delivery, 'DEMO-1001', 'delivered', 'Entregue');
  await setDemoStatus(pickupOrder, 'DEMO-1003', 'collected', 'Retirado');
  await setDemoStatus(pickupOrder, 'DEMO-1003', 'ready_for_pickup', 'Pronto para retirada');
  assert.equal(await pickupOrder.getByLabel(/Código de rastreio/).count(), 0);
  await demo.page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(demo.page);
  await pickupOrder.screenshot({ path: `${artifacts}/demo-order-pickup-admin-mobile.png` });
  await demoNavigation.getByRole('button', { name: 'Pedidos', exact: true }).click();
  const customerPickup = demo.page.getByRole('article', { name: 'Pedido DEMO-1003', exact: true });
  await customerPickup.getByRole('group', { name: 'Andamento do pedido', exact: true }).getByText('Pronto para retirada', { exact: true }).waitFor();
  await customerPickup.getByText('Nome para retirada: Cliente Demonstração', { exact: true }).waitFor();
  await noOverflow(demo.page);
  await demo.page.screenshot({ path: `${artifacts}/demo-orders-customer-mobile.png`, fullPage: true });
  await demoNavigation.getByRole('button', { name: 'Admin simulado', exact: true }).click();
  await setDemoStatus(pickupOrder, 'DEMO-1003', 'collected', 'Retirado');
  await demo.page.getByLabel('Etapa de preparo e entrega').selectOption('collected');
  await demo.page.getByRole('button', { name: 'Filtrar pedidos', exact: true }).click();
  await demo.page.getByText('1 pedidos encontrados', { exact: true }).waitFor();
  assert.equal(await delivery.count(), 0);
  await demo.page.getByLabel('Etapa de preparo e entrega').selectOption('preparing');
  await demo.page.getByRole('button', { name: 'Filtrar pedidos', exact: true }).click();
  await demo.page.getByText('Nenhum pedido encontrado com estes filtros.', { exact: true }).waitFor();
  await demoNavigation.getByRole('button', { name: 'Pedidos', exact: true }).click();
  await customerDelivery.getByRole('group', { name: 'Andamento do pedido', exact: true }).getByText('Entregue', { exact: true }).waitFor();
  await customerPickup.getByRole('group', { name: 'Andamento do pedido', exact: true }).getByText('Retirado', { exact: true }).waitFor();
  await demo.page.getByLabel('Cenário de demonstração').selectOption('pagamento-recusado');
  await demo.page.getByText('Você ainda não tem pedidos.', { exact: true }).waitFor();
  await demo.page.getByLabel('Cenário de demonstração').selectOption('vazio');
  await demo.page.getByText('Você ainda não tem pedidos.', { exact: true }).waitFor();
  assert.deepEqual(statusDialogs, [], 'Alterar status na demo abriu uma confirmação desnecessária.');
  demo.page.off('dialog', recordDialog);
  assert.deepEqual(demo.requests, [], 'A demonstração tentou acessar API ou sessão real.');
  await demo.context.close();
  console.log('PASS: demonstração desktop/celular, navegação, pagamento simulado e isolamento de API.');

  const technical = await contextFor('technical');
  await technical.page.goto(`${base}/admin`);
  await technical.page.getByRole('heading', { name: 'Administração técnica' }).waitFor();
  await technical.page.getByText('Banco de dados: Disponível').waitFor();
  assert.deepEqual(technical.requests.filter((path) => path.includes('/admin/') && !path.includes('/admin/auth/')), ['/api/v1/admin/system-status']);
  await technical.page.screenshot({ path: `${artifacts}/admin-technical.png`, fullPage: true });
  await technical.context.close();
  console.log('PASS: painel técnico não consulta operações comerciais.');

  const owner = await contextFor('owner');
  await owner.page.goto(`${base}/admin`);
  await owner.page.getByRole('button', { name: 'Adicionar Blend', exact: true }).click();
  await owner.page.locator('summary').filter({ hasText: 'Selecionar queixas do público-alvo' }).click();
  await owner.page.getByRole('checkbox', { name: 'Alvo A', exact: true }).check();
  await owner.page.getByRole('checkbox', { name: 'Alvo B', exact: true }).check();
  const form = owner.page.locator('form').filter({ has: owner.page.getByRole('button', { name: 'Salvar no Catálogo' }) });
  assert.equal(await form.getByText(/categoria/i).count(), 0, 'O formulário de blend contém categoria.');
  await form.getByPlaceholder('Ex: Aroma Sono Reparador 10ml').fill('Blend do teste visual');
  await form.getByPlaceholder('229.90').fill('49.90');
  await form.getByPlaceholder('https://exemplo.com/imagem-do-produto.jpg').fill('https://example.invalid/primeira.png\nhttps://example.invalid/segunda.png');
  await owner.page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(owner.page);
  await owner.page.screenshot({ path: `${artifacts}/blend-multiple-complaints-mobile.png`, fullPage: true });
  await owner.page.setViewportSize({ width: 1440, height: 1000 });
  await owner.page.screenshot({ path: `${artifacts}/blend-multiple-complaints.png`, fullPage: true });
  await owner.page.getByRole('button', { name: 'Salvar no Catálogo' }).click();
  await owner.page.getByRole('button', { name: 'Salvar no Catálogo' }).waitFor({ state: 'hidden' });
  assert.deepEqual(owner.writes.at(-1).payload.symptom_ids, [1, 2]);
  assert.equal(owner.writes.at(-1).payload.images.length, 2);
  assert.equal(Object.hasOwn(owner.writes.at(-1).payload, 'category_id'), false);
  await owner.context.close();
  console.log('PASS: proprietário salva múltiplas queixas e imagens; formulário sem categoria.');

  const commerce = await contextFor('owner', { commerce: true, colorScheme: 'dark' });
  await commerce.page.goto(`${base}/admin`);
  await commerce.page.getByRole('heading', { name: 'Público, origem e queixas' }).waitFor();
  await commerce.page.getByRole('button', { name: 'Ativar modo escuro', exact: true }).click();
  await themeIs(commerce.page, 'dark');
  await readable(commerce.page.getByRole('textbox', { name: 'Buscar pedidos', exact: true }));
  const categoryB = commerce.page.locator('article').filter({ has: commerce.page.getByRole('button', { name: 'Editar categoria Categoria B', exact: true }) });
  await categoryB.getByRole('button', { name: 'Adicionar produto à categoria' }).click();
  await categoryB.getByRole('checkbox', { name: /Outro blend/ }).check();
  await categoryB.getByRole('button', { name: 'Adicionar selecionados' }).click();
  await categoryB.getByRole('button', { name: 'Remover Outro blend de Categoria B' }).waitFor();
  await commerce.page.getByRole('button', { name: 'Remover Blend fictício de Categoria A', exact: true }).click();
  await commerce.page.getByRole('button', { name: 'Remover Blend fictício de Categoria A', exact: true }).waitFor({ state: 'hidden' });
  await categoryB.getByRole('button', { name: 'Remover Blend fictício de Categoria B', exact: true }).waitFor();
  await commerce.page.getByLabel('Nome do novo ingrediente').fill('Ingrediente do teste');
  await commerce.page.getByRole('button', { name: 'Criar ingrediente', exact: true }).click();
  await commerce.page.getByText('Ingrediente do teste', { exact: true }).waitFor();
  await commerce.page.getByLabel('Buscar pedidos').fill('PC-FICTICIO');
  await commerce.page.getByLabel('Etapa de preparo e entrega').selectOption('confirmed');
  await commerce.page.getByRole('button', { name: 'Filtrar pedidos', exact: true }).click();
  await commerce.page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await commerce.page.getByText('Página 2 de 2', { exact: true }).waitFor();
  assert.ok(commerce.queries.some((raw) => { const url = new URL(raw); return url.pathname.endsWith('/admin/orders') && url.searchParams.get('search') === 'PC-FICTICIO' && url.searchParams.get('fulfillment_stage') === 'confirmed' && url.searchParams.get('page') === '2'; }));
  await commerce.page.getByLabel('Etapa de preparo e entrega').selectOption('');
  await commerce.page.getByRole('button', { name: 'Filtrar pedidos', exact: true }).click();
  const apiOrder = commerce.page.getByRole('article', { name: 'Gerenciar pedido PC-FICTICIO-1', exact: true });
  await apiOrder.getByLabel('Status do pedido PC-FICTICIO-1', { exact: true }).selectOption('delivered');
  await apiOrder.getByRole('button', { name: 'Salvar status', exact: true }).click();
  await apiOrder.getByRole('group', { name: 'Andamento do pedido', exact: true }).getByText('Entregue', { exact: true }).waitFor();
  assert.equal(commerce.writes.find((write) => write.path.endsWith('/fulfillment')).payload.expected_revision, 0);
  await apiOrder.getByLabel('Status do pedido PC-FICTICIO-1', { exact: true }).selectOption('confirmed');
  await apiOrder.getByRole('button', { name: 'Salvar status', exact: true }).click();
  await apiOrder.getByRole('group', { name: 'Andamento do pedido', exact: true }).getByText('Aguardando preparo', { exact: true }).waitFor();
  await apiOrder.getByLabel('Status do pedido PC-FICTICIO-1', { exact: true }).selectOption('shipped');
  await apiOrder.getByLabel('Código de rastreio do pedido PC-FICTICIO-1', { exact: true }).fill('RASTREIO-FICTICIO');
  await apiOrder.getByRole('button', { name: 'Salvar status', exact: true }).click();
  await apiOrder.getByRole('group', { name: 'Andamento do pedido', exact: true }).getByText('A caminho', { exact: true }).waitFor();
  await apiOrder.getByText('Histórico de alterações', { exact: true }).click();
  await apiOrder.getByText('Status: Entregue → Aguardando preparo', { exact: true }).waitFor();
  assert.equal(commerce.writes.filter((write) => write.path.endsWith('/fulfillment')).at(-1).payload.expected_revision, 2);
  assert.equal(commerce.writes.some((write) => write.path.endsWith('/shipment')), false);
  for (const width of [390, 1440]) {
    await commerce.page.setViewportSize({ width, height: 1000 });
    await noOverflow(commerce.page);
    await commerce.page.screenshot({ path: `${artifacts}/admin-commerce-${width}.png`, fullPage: true });
  }
  await commerce.context.close();
  console.log('PASS: categorias cumulativas, remoção de vínculo, ingrediente, relatório, filtros/paginação e rastreio.');

  const readOnly = await contextFor('owner', { commerce: true, readOnlyOrders: true });
  await readOnly.page.goto(`${base}/admin`);
  await readOnly.page.getByRole('article', { name: 'Gerenciar pedido PC-FICTICIO-1', exact: true }).waitFor();
  assert.equal(await readOnly.page.getByRole('button', { name: 'Salvar status', exact: true }).count(), 0);
  assert.equal(await readOnly.page.getByLabel('Status do pedido PC-FICTICIO-1', { exact: true }).count(), 0);
  await readOnly.context.close();

  const conflict = await contextFor('owner', { commerce: true, fulfillmentConflict: true });
  await conflict.page.goto(`${base}/admin`);
  const conflictOrder = conflict.page.getByRole('article', { name: 'Gerenciar pedido PC-FICTICIO-1', exact: true });
  await conflictOrder.getByLabel('Status do pedido PC-FICTICIO-1', { exact: true }).selectOption('delivered');
  await conflictOrder.getByRole('button', { name: 'Salvar status', exact: true }).click();
  await conflict.page.getByRole('alert').filter({ hasText: 'O pedido foi alterado por outra operação.' }).waitFor();
  await conflictOrder.getByRole('group', { name: 'Andamento do pedido', exact: true }).getByText('Em preparação', { exact: true }).waitFor();
  assert.equal(await conflictOrder.getByLabel('Status do pedido PC-FICTICIO-1', { exact: true }).inputValue(), 'preparing');
  await conflictOrder.getByLabel('Status do pedido PC-FICTICIO-1', { exact: true }).selectOption('delivered');
  await conflictOrder.getByRole('button', { name: 'Salvar status', exact: true }).click();
  await conflictOrder.getByRole('group', { name: 'Andamento do pedido', exact: true }).getByText('Entregue', { exact: true }).waitFor();
  assert.equal(conflict.writes.filter((write) => write.path.endsWith('/fulfillment')).at(-1).payload.expected_revision, 1);
  await conflict.context.close();
  console.log('PASS: adaptador integrado usa revisão do servidor, respeita permissão e recupera conflito de edição.');

  const customer = await contextFor('customer', { ordersFail: true });
  await customer.page.goto(base);
  await customer.page.getByRole('button', { name: 'Recusar rastreamento', exact: true }).click();
  await customer.page.getByRole('button', { name: 'Pedidos', exact: true }).click();
  await customer.page.getByRole('alert').filter({ hasText: 'Não foi possível carregar seus pedidos.' }).waitFor();
  customer.recoverOrders();
  await customer.page.getByRole('button', { name: 'Atualizar pedidos', exact: true }).click();
  const realCustomerOrder = customer.page.getByRole('article', { name: 'Pedido PC-FICTICIO-1', exact: true });
  await realCustomerOrder.getByRole('group', { name: 'Andamento do pedido', exact: true }).getByText('A caminho', { exact: true }).waitFor();
  await realCustomerOrder.getByText('1× Blend fictício', { exact: true }).waitFor();
  await realCustomerOrder.getByText('RASTREIO-FICTICIO', { exact: true }).waitFor();
  for (const width of [390, 768, 1024, 1440]) {
    await customer.page.setViewportSize({ width, height: 1000 });
    await noOverflow(customer.page);
  }
  await customer.page.setViewportSize({ width: 390, height: 844 });
  await customer.page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await customer.page.locator('aside').getByRole('button', { name: 'Pedidos', exact: true }).click();
  assert.equal(await customer.page.locator('aside').count(), 0);
  await customer.page.screenshot({ path: `${artifacts}/customer-orders-api-mock-mobile.png`, fullPage: true });
  assert.equal(customer.requests.some((path) => path.includes('/admin/')), false);
  await customer.context.close();

  const noOrders = await contextFor('customer', { ordersEmpty: true });
  await noOrders.page.goto(base);
  await noOrders.page.getByRole('button', { name: 'Pedidos', exact: true }).click();
  await noOrders.page.getByText('Você ainda não tem pedidos.', { exact: true }).waitFor();
  await noOrders.context.close();
  const guest = await contextFor();
  await guest.page.goto(base);
  await guest.page.getByRole('button', { name: 'Pedidos', exact: true }).click();
  await guest.page.getByRole('button', { name: 'Entrar para ver pedidos', exact: true }).waitFor();
  assert.equal(guest.requests.includes('/api/v1/orders'), false);
  await guest.context.close();
  const unverified = await contextFor('customer', { unverified: true });
  await unverified.page.goto(base);
  await unverified.page.getByRole('button', { name: 'Pedidos', exact: true }).click();
  await unverified.page.getByText('Confirme seu email para consultar seus pedidos.', { exact: true }).waitFor();
  assert.equal(unverified.requests.includes('/api/v1/orders'), false);
  await unverified.context.close();
  const localCustomer = await contextFor('customer', { unverified: true, localTestMode: true });
  await localCustomer.page.goto(`${base}/?pagamento=retorno&modo_teste=1`);
  await localCustomer.page.getByRole('heading', { name: 'Meus pedidos', exact: true }).waitFor();
  await localCustomer.page.getByRole('article', { name: 'Pedido PC-FICTICIO-1', exact: true }).waitFor();
  await localCustomer.page.getByRole('status').filter({ hasText: 'Compra concluída no modo de teste local' }).waitFor();
  await localCustomer.context.close();
  console.log('PASS: gestão simulada refletida no cliente, aba Pedidos, consulta sem permissão de envio, erro/atualização, vazio e visitante.');

  const failure = await contextFor(null, { storageBlocked: true, catalogFails: true });
  await failure.page.goto(base);
  await failure.page.getByRole('alert').filter({ hasText: 'Não foi possível carregar o catálogo' }).waitFor();
  await failure.page.getByRole('button', { name: 'Recusar rastreamento' }).click();
  failure.recoverCatalog();
  await failure.page.getByRole('button', { name: 'Tentar carregar novamente' }).click();
  await failure.page.getByRole('alert').filter({ hasText: 'Não foi possível carregar o catálogo' }).waitFor({ state: 'hidden' });
  await failure.context.close();
  console.log('PASS: armazenamento bloqueado, recusa de cookies e recuperação da falha de catálogo.');
  assert.deepEqual(errors, [], 'Erros JavaScript no navegador.');
} finally {
  await browser.close();
}
