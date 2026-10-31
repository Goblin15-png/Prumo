// Build real da loja com API/SDK fictícios: todas as requisições são atendidas
// localmente ou bloqueadas. Não envia eventos nem dados para a Meta.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
const cookieName = 'meta-pixel-consent';
const oneYear = 365 * 24 * 60 * 60;
const sdkUrl = 'https://connect.facebook.net/en_US/fbevents.js';
const mimeTypes = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

const prompt = (page) => page.locator('section[aria-label="Preferências de cookies"]');
const calls = (page) => page.evaluate(() => window.__pixelCalls || []);
const pageViews = async (page) => (await calls(page)).filter(([type, event]) => type === 'track' && event === 'PageView');
const waitForCall = (page, type, event) => page.waitForFunction(
  ({ type, event }) => (window.__pixelCalls || []).some((call) => call[0] === type && call[1] === event),
  { type, event },
);
const choose = async (page, accepted) => {
  await prompt(page).getByRole('button', { name: accepted ? 'Aceitar' : 'Recusar rastreamento', exact: true }).click();
  await prompt(page).waitFor({ state: 'hidden' });
};
const openPreferences = (page) => page.getByRole('button', { name: 'Preferências de cookies', exact: true }).click();

let browser;
let passed = 0;
try {
  browser = await chromium.launch({ headless: true });

  const createContext = async ({ origin = 'https://pixel-consent.test', storageState, javaScriptEnabled = true } = {}) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState, javaScriptEnabled });
    context.setDefaultTimeout(10000);
    const errors = [];
    let sdkRequests = 0;
    context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.href === sdkUrl) {
        sdkRequests++;
        return route.fulfill({
          contentType: 'text/javascript',
          body: `window.__pixelCalls = (window.fbq?.queue || []).map(args => Array.from(args));
window.fbq.callMethod = function () { window.__pixelCalls.push(Array.from(arguments)); };
window.fbq.queue = [];`,
        });
      }
      if (url.origin !== origin) return route.abort();
      if (['/api/v1/tracking/meta-pixel-noscript', '/api/v1/tracking/google-tag-manager-noscript'].includes(url.pathname)) {
        return route.fulfill({ status: 204 });
      }
      if (url.pathname.startsWith('/api/v1/')) {
        const data = {
          '/api/v1/products': { data: [] },
          '/api/v1/categories': [],
          '/api/v1/me': { user: null },
          '/api/v1/runtime-config': { local_test_mode: false },
        }[url.pathname];
        return route.fulfill({ status: data ? 200 : 404, json: data || {} });
      }
      if (url.pathname === '/consent-fixture.html') {
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Fixture local de consentimento</title>' });
      }
      try {
        const pathname = decodeURIComponent(url.pathname);
        const candidate = resolve(dist, `.${pathname}`);
        assert.ok(candidate === resolve(dist) || candidate.startsWith(`${resolve(dist)}${sep}`));
        const file = extname(candidate) ? candidate : resolve(dist, 'index.html');
        return route.fulfill({ contentType: mimeTypes[extname(file)] || 'application/octet-stream', body: await readFile(file) });
      } catch {
        return route.fulfill({ status: 404, body: '' });
      }
    });
    return { context, origin, errors, sdkRequests: () => sdkRequests };
  };

  const verifyCookie = async (context, origin, value) => {
    const cookie = (await context.cookies(origin)).find((candidate) => candidate.name === cookieName);
    assert.ok(cookie, 'A preferência deve estar armazenada em cookie.');
    assert.equal(cookie.value, value);
    assert.equal(cookie.path, '/');
    assert.equal(cookie.sameSite, 'Lax');
    assert.equal(cookie.secure, origin.startsWith('https:'));
    const remaining = cookie.expires - Date.now() / 1000;
    assert.ok(remaining > oneYear - 120 && remaining <= oneYear + 5, 'Cookie deve durar um ano.');
  };

  const scenario = async (name, run, options) => {
    const setup = await createContext(options);
    try {
      await run(setup);
      assert.deepEqual(setup.errors, [], 'O fluxo não deve causar erros JavaScript.');
      passed++;
      console.log(`PASS ${name}`);
    } finally {
      await setup.context.close();
    }
  };

  await scenario('sem JavaScript, imagem consulta a rota local antes de qualquer envio à Meta', async ({ context, origin, sdkRequests }) => {
    const requests = [];
    context.on('request', (request) => requests.push(request.url()));
    const page = await context.newPage();
    const response = page.waitForResponse(`${origin}/api/v1/tracking/meta-pixel-noscript`);
    await page.goto(origin);
    assert.equal((await response).status(), 204);
    assert.equal(sdkRequests(), 0);
    assert.equal(requests.some((url) => new URL(url).hostname.endsWith('facebook.com')), false);
    const image = page.locator('noscript img');
    assert.equal(await image.getAttribute('src'), '/api/v1/tracking/meta-pixel-noscript');
    assert.equal(await image.getAttribute('width'), '1');
    assert.equal(await image.getAttribute('height'), '1');
  }, { javaScriptEnabled: false });

  await scenario('sem escolha não carrega Pixel; recusa persiste em recarga e nova sessão', async ({ context, origin, sdkRequests }) => {
    const page = await context.newPage();
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(origin);
    await prompt(page).waitFor();
    assert.equal(sdkRequests(), 0);
    assert.deepEqual(await calls(page), []);
    assert.equal(requests.some((url) => url.endsWith('/tracking/meta-pixel-noscript')), false, 'Com JavaScript habilitado, o fallback não deve disparar.');
    await choose(page, false);
    await verifyCookie(context, origin, 'rejected');
    await page.reload();
    await page.getByRole('button', { name: 'Preferências de cookies', exact: true }).waitFor();
    assert.equal(await prompt(page).count(), 0);
    assert.equal(sdkRequests(), 0);

    // Copiar somente cookies para outro contexto representa uma sessão nova,
    // sem depender de localStorage/sessionStorage nem de estado React em memória.
    const newSession = await createContext({ origin, storageState: { cookies: await context.cookies(), origins: [] } });
    try {
      const nextPage = await newSession.context.newPage();
      await nextPage.goto(origin);
      await nextPage.getByRole('button', { name: 'Preferências de cookies', exact: true }).waitFor();
      assert.equal(await prompt(nextPage).count(), 0);
      assert.equal(newSession.sdkRequests(), 0);
      assert.deepEqual(newSession.errors, []);
    } finally { await newSession.context.close(); }
  });

  await scenario('aceite persiste; revogação interrompe eventos e aceite pode ser reativado', async ({ context, origin, sdkRequests }) => {
    const page = await context.newPage();
    await page.goto(origin);
    await choose(page, true);
    await verifyCookie(context, origin, 'accepted');
    await waitForCall(page, 'track', 'PageView');
    assert.equal(sdkRequests(), 1);
    assert.equal((await pageViews(page)).length, 1);
    await page.reload();
    await waitForCall(page, 'track', 'PageView');
    assert.equal(await prompt(page).count(), 0);
    assert.equal(sdkRequests(), 2);
    assert.equal((await pageViews(page)).length, 1);
    await openPreferences(page);
    await choose(page, false);
    await waitForCall(page, 'consent', 'revoke');
    await verifyCookie(context, origin, 'rejected');
    assert.equal((await pageViews(page)).length, 1);
    await openPreferences(page);
    await choose(page, true);
    await waitForCall(page, 'consent', 'grant');
    await page.waitForFunction(() => window.__pixelCalls.filter(([type, event]) => type === 'track' && event === 'PageView').length === 2);
    assert.equal(sdkRequests(), 2, 'Reativar a preferência não deve carregar outro SDK.');
  });

  for (const legacy of ['accepted', 'rejected']) {
    await scenario(`migra escolha antiga ${legacy} de localStorage para cookie`, async ({ context, origin, sdkRequests }) => {
      const page = await context.newPage();
      await page.goto(`${origin}/consent-fixture.html`);
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: cookieName, value: legacy });
      await page.goto(origin);
      await page.getByRole('button', { name: 'Preferências de cookies', exact: true }).waitFor();
      await verifyCookie(context, origin, legacy);
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), cookieName), null);
      assert.equal(await prompt(page).count(), legacy === 'accepted' ? 1 : 0);
      if (legacy === 'accepted') await waitForCall(page, 'track', 'PageView');
      assert.equal(sdkRequests(), legacy === 'accepted' ? 1 : 0);
    });
  }

  await scenario('cookie atual prevalece sobre aceite antigo e cookies inválidos não autorizam', async ({ context, origin, sdkRequests }) => {
    const page = await context.newPage();
    await page.goto(`${origin}/consent-fixture.html`);
    await page.evaluate((key) => {
      localStorage.setItem(key, 'accepted');
      document.cookie = `${key}=rejected; Path=/; SameSite=Lax; Secure; Max-Age=31536000`;
    }, cookieName);
    await page.goto(origin);
    await page.getByRole('button', { name: 'Preferências de cookies', exact: true }).waitFor();
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), cookieName), null);
    assert.equal(await prompt(page).count(), 0);
    assert.equal(sdkRequests(), 0);
    await context.addCookies([{ name: cookieName, value: 'invalid', url: origin }]);
    await page.reload();
    await prompt(page).waitFor();
    assert.equal(sdkRequests(), 0);
  });

  await scenario('mudança entre abas atualiza o consentimento e revoga o Pixel já carregado', async ({ context, origin }) => {
    const first = await context.newPage();
    await first.goto(origin);
    await choose(first, true);
    await waitForCall(first, 'track', 'PageView');
    const second = await context.newPage();
    await second.goto(origin);
    await waitForCall(second, 'track', 'PageView');
    await openPreferences(second);
    await choose(second, false);
    await waitForCall(first, 'consent', 'revoke');
    assert.equal((await pageViews(first)).length, 1);
    await openPreferences(second);
    await choose(second, true);
    await waitForCall(first, 'consent', 'grant');
    await first.waitForFunction(() => window.__pixelCalls.filter(([type, event]) => type === 'track' && event === 'PageView').length === 2);
  });

  await scenario('ao voltar à aba detecta preferência alterada sem BroadcastChannel', async ({ context, origin }) => {
    await context.addInitScript(() => { Object.defineProperty(window, 'BroadcastChannel', { value: undefined, configurable: true }); });
    const page = await context.newPage();
    await page.goto(origin);
    await choose(page, true);
    await waitForCall(page, 'track', 'PageView');
    await context.addCookies([{ name: cookieName, value: 'rejected', url: origin }]);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await waitForCall(page, 'consent', 'revoke');
    assert.equal((await pageViews(page)).length, 1);
  });

  for (const blockedMode of ['silencioso', 'exceção']) {
    await scenario(`cookies bloqueados (${blockedMode}): escolha só na visita e sem quebra da interface`, async ({ context, origin, sdkRequests }) => {
      await context.addInitScript((mode) => {
        Object.defineProperty(Document.prototype, 'cookie', {
          configurable: true,
          get() { if (mode === 'exceção') throw new DOMException('Cookies indisponíveis', 'SecurityError'); return ''; },
          set() { if (mode === 'exceção') throw new DOMException('Cookies indisponíveis', 'SecurityError'); },
        });
      }, blockedMode);
      const page = await context.newPage();
      await page.goto(origin);
      await choose(page, true);
      await waitForCall(page, 'track', 'PageView');
      assert.equal((await context.cookies()).some((cookie) => cookie.name === cookieName), false);
      await page.reload();
      await prompt(page).waitFor();
      assert.equal(sdkRequests(), 1, 'Sem cookie salvo, uma visita nova não pode autorizar o Pixel automaticamente.');
      await choose(page, false);
      await page.reload();
      await prompt(page).waitFor();
      assert.equal(sdkRequests(), 1);
    });
  }

  await scenario('recusa vale na visita mesmo quando o navegador não permite substituir cookie antigo', async ({ context, origin }) => {
    await context.addCookies([{ name: cookieName, value: 'accepted', url: origin }]);
    await context.addInitScript(() => {
      const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
      Object.defineProperty(Document.prototype, 'cookie', { ...descriptor, set() {} });
    });
    const page = await context.newPage();
    await page.goto(origin);
    await waitForCall(page, 'track', 'PageView');
    await openPreferences(page);
    await choose(page, false);
    await waitForCall(page, 'consent', 'revoke');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(100);
    assert.equal((await pageViews(page)).length, 1, 'Retornar à aba não deve restaurar o aceite que não pôde ser substituído.');
    assert.equal((await calls(page)).at(-1)[1], 'revoke');
  });

  await scenario('HTTP local persiste preferência sem exigir Secure', async ({ context, origin }) => {
    const page = await context.newPage();
    await page.goto(origin);
    await choose(page, false);
    await verifyCookie(context, origin, 'rejected');
  }, { origin: 'http://pixel-consent.test' });

  console.log(`${passed} cenários de consentimento passaram; nenhuma conexão real com a Meta.`);
} finally {
  await browser?.close();
}
