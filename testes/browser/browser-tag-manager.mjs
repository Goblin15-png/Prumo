// Build real com API e SDKs interceptados localmente. Nenhum evento vai à Meta ou ao Google.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
const origin = 'https://tag-manager.test';
const containerId = 'GTM-5HTKMSRK';
const cookieName = 'meta-pixel-consent';
const googleCookieName = 'google-tag-manager-consent';
const consentKeys = ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage'];
const mimeTypes = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};
const prompt = (page) => page.locator('section[aria-label="Preferências de cookies"]');
const openPreferences = (page) => page.getByRole('button', { name: 'Preferências de cookies', exact: true }).click();
const choose = async (page, accepted) => {
  await prompt(page).getByRole('button', { name: accepted ? 'Aceitar' : 'Recusar rastreamento', exact: true }).click();
  await prompt(page).waitFor({ state: 'hidden' });
};
const dataLayer = (page) => page.evaluate(() => (window.dataLayer || []).map((entry) => (
  typeof entry?.length === 'number' ? Array.from(entry) : entry
)));
const waitForConsent = (page, state) => page.waitForFunction(({ keys, state }) => {
  const commands = (window.dataLayer || []).filter((entry) => entry[0] === 'consent');
  const latest = commands.at(-1)?.[2];
  return latest && keys.every((key) => latest[key] === state);
}, { keys: consentKeys, state });
const waitForContainer = (page) => page.waitForFunction(() => window.__gtmLoads === 1);

let browser;
let passed = 0;
try {
  browser = await chromium.launch({ headless: true });
  const createContext = async (consent, metaOnly = false, javaScriptEnabled = true) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled });
    context.setDefaultTimeout(10000);
    const errors = [];
    const googleRequests = [];
    context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
    if (consent) await context.addCookies(
      (metaOnly ? [cookieName] : [cookieName, googleCookieName]).map((name) => ({
        name, value: consent, url: origin,
        secure: true, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 31536000,
      })),
    );
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'www.googletagmanager.com') {
        googleRequests.push(url.href);
        assert.equal(url.pathname, '/gtm.js');
        assert.equal(url.searchParams.get('id'), containerId);
        return route.fulfill({ contentType: 'text/javascript', body: `
window.__gtmLoads = (window.__gtmLoads || 0) + 1;
window.__gtmInitialQueue = window.dataLayer.map(entry => typeof entry?.length === 'number' ? Array.from(entry) : entry);
` });
      }
      if (url.href === 'https://connect.facebook.net/en_US/fbevents.js') {
        return route.fulfill({ contentType: 'text/javascript', body: 'window.fbq.callMethod = function () {}; window.fbq.queue = [];' });
      }
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/api/v1/tracking/google-tag-manager-noscript') {
        return route.fulfill({ status: 204 });
      }
      if (url.pathname.startsWith('/api/v1/')) {
        const data = {
          '/api/v1/products': { data: [] }, '/api/v1/categories': [],
          '/api/v1/me': { user: null }, '/api/v1/runtime-config': { local_test_mode: false },
          '/api/v1/admin/auth/me': { user: null },
        }[url.pathname];
        return route.fulfill({ status: data ? 200 : 404, json: data || {} });
      }
      try {
        const candidate = resolve(dist, `.${decodeURIComponent(url.pathname)}`);
        assert.ok(candidate === resolve(dist) || candidate.startsWith(`${resolve(dist)}${sep}`));
        const file = extname(candidate) ? candidate : resolve(dist, 'index.html');
        return route.fulfill({ contentType: mimeTypes[extname(file)] || 'application/octet-stream', body: await readFile(file) });
      } catch { return route.fulfill({ status: 404, body: '' }); }
    });
    return { context, errors, googleRequests };
  };

  const scenario = async (name, run, consent, metaOnly = false) => {
    const setup = await createContext(consent, metaOnly);
    try {
      await run(setup);
      assert.deepEqual(setup.errors, [], 'Não deve haver erro JavaScript.');
      passed++;
      console.log(`PASS ${name}`);
    } finally { await setup.context.close(); }
  };

  await scenario('bootstrap no HEAD com CSP prévia; primeira visita nega consentimento e não carrega GTM', async ({ context, googleRequests }) => {
    const html = await readFile(resolve(dist, 'index.html'), 'utf8');
    assert.match(html, /<noscript><iframe src="\/api\/v1\/tracking\/google-tag-manager-noscript"/);
    assert.ok(!html.includes('<noscript><iframe src="https://www.googletagmanager.com/ns.html'));
    const page = await context.newPage();
    await page.goto(origin);
    await prompt(page).waitFor();
    assert.match(await prompt(page).innerText(), /Meta/);
    assert.match(await prompt(page).innerText(), /Google/);
    const head = await page.evaluate(() => {
      const bootstrap = document.querySelector('script[src="/google-tag-manager.js"]');
      const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return {
        inHead: bootstrap?.parentElement === document.head,
        policyBefore: Boolean(policy && bootstrap && (policy.compareDocumentPosition(bootstrap) & Node.DOCUMENT_POSITION_FOLLOWING)),
        policy: policy?.content,
      };
    });
    assert.equal(head.inHead, true);
    assert.equal(head.policyBefore, true, 'A política precisa valer antes do bootstrap de rastreamento.');
    const scriptPolicy = head.policy.split(';').find((directive) => directive.trim().startsWith('script-src '));
    assert.ok(scriptPolicy.includes('https://www.googletagmanager.com'));
    assert.ok(!scriptPolicy.includes("'unsafe-inline'"));
    assert.ok(!scriptPolicy.includes("'unsafe-eval'"));
    const queue = await dataLayer(page);
    assert.deepEqual(queue[0].slice(0, 2), ['consent', 'default']);
    consentKeys.forEach((key) => assert.equal(queue[0][2][key], 'denied'));
    assert.equal(queue.some((entry) => entry.event === 'gtm.js'), false);
    assert.equal(googleRequests.length, 0);
    await choose(page, false);
    await page.reload();
    await page.getByRole('button', { name: 'Preferências de cookies', exact: true }).waitFor();
    assert.equal(await prompt(page).count(), 0);
    assert.equal(googleRequests.length, 0);
  });

  const noScript = await createContext(undefined, false, false);
  try {
    const page = await noScript.context.newPage();
    const iframeRequest = page.waitForRequest('**/api/v1/tracking/google-tag-manager-noscript');
    await page.goto(origin);
    const request = await iframeRequest;
    assert.equal(request.headers().referer, `${origin}/`);
    assert.equal(noScript.googleRequests.length, 0);
    assert.deepEqual(noScript.errors, []);
    passed++;
    console.log('PASS sem JavaScript, iframe consulta somente a rota local de consentimento');
  } finally { await noScript.context.close(); }

  await scenario('aceite concede antes de iniciar GTM; carregamento único e revogação/reativação', async ({ context, googleRequests }) => {
    const page = await context.newPage();
    await page.goto(origin);
    await choose(page, true);
    await waitForContainer(page);
    await waitForConsent(page, 'granted');
    assert.equal(googleRequests.length, 1);
    const initialQueue = await page.evaluate(() => window.__gtmInitialQueue);
    const grantIndex = initialQueue.findIndex((entry) => entry[0] === 'consent' && entry[1] === 'update' && entry[2].analytics_storage === 'granted');
    const startIndex = initialQueue.findIndex((entry) => entry.event === 'gtm.js');
    assert.ok(grantIndex > 0 && grantIndex < startIndex, 'Consentimento deve ser concedido antes do evento de inicialização.');
    assert.equal(initialQueue[startIndex]['gtm.start'] > 0, true);
    assert.equal((await context.cookies(origin)).find((cookie) => cookie.name === cookieName)?.value, 'accepted');
    assert.equal((await context.cookies(origin)).find((cookie) => cookie.name === googleCookieName)?.value, 'accepted');
    await openPreferences(page);
    await choose(page, false);
    await waitForConsent(page, 'denied');
    assert.equal((await context.cookies(origin)).find((cookie) => cookie.name === cookieName)?.value, 'rejected');
    assert.equal((await context.cookies(origin)).find((cookie) => cookie.name === googleCookieName)?.value, 'rejected');
    await openPreferences(page);
    await choose(page, true);
    await waitForConsent(page, 'granted');
    await page.evaluate(() => { window.protocoloTagManager.setConsent(true); window.protocoloTagManager.setConsent(true); });
    assert.equal(googleRequests.length, 1);
    assert.equal((await dataLayer(page)).filter((entry) => entry.event === 'gtm.js').length, 1);
    assert.equal(await page.locator('script[src^="https://www.googletagmanager.com/gtm.js"]').count(), 1);
  });

  for (const consent of ['accepted', 'rejected', 'invalid']) {
    await scenario(`nova sessão com cookie ${consent} respeita a preferência`, async ({ context, googleRequests }) => {
      const page = await context.newPage();
      await page.goto(origin);
      await page.getByRole('button', { name: 'Preferências de cookies', exact: true }).waitFor();
      if (consent === 'accepted') {
        await waitForContainer(page);
        await waitForConsent(page, 'granted');
        assert.equal(googleRequests.length, 1);
      } else {
        await waitForConsent(page, 'denied');
        assert.equal(googleRequests.length, 0);
      }
      assert.equal(await prompt(page).count(), consent === 'invalid' ? 1 : 0);
    }, consent);
  }

  await scenario('aceite antigo da Meta pede nova escolha antes de carregar Google', async ({ context, googleRequests }) => {
    const page = await context.newPage();
    await page.goto(origin);
    await prompt(page).waitFor();
    assert.equal(googleRequests.length, 0);
    assert.equal((await dataLayer(page)).some((entry) => entry.event === 'gtm.js'), false);
    await choose(page, true);
    await waitForContainer(page);
    assert.equal(googleRequests.length, 1);
  }, 'accepted', true);

  await scenario('revogação em outra aba atualiza o consentimento Google sem novo carregamento', async ({ context, googleRequests }) => {
    const first = await context.newPage();
    await first.goto(origin);
    await waitForContainer(first);
    const second = await context.newPage();
    await second.goto(origin);
    await waitForContainer(second);
    await openPreferences(second);
    await choose(second, false);
    await waitForConsent(first, 'denied');
    await waitForConsent(second, 'denied');
    assert.equal(googleRequests.length, 2);
    await first.reload();
    await first.getByRole('button', { name: 'Preferências de cookies', exact: true }).waitFor();
    assert.equal(googleRequests.length, 2, 'Cookie revogado deve impedir carregar GTM na próxima visita.');
  }, 'accepted');

  for (const path of ['/admin', '/admin/pedidos', '/reset-password', '/reset-password/recuperar']) {
    await scenario(`rota ${path} não carrega GTM mesmo com cookie aceito`, async ({ context, googleRequests }) => {
      const page = await context.newPage();
      await page.goto(`${origin}${path}`);
      await page.waitForFunction(() => document.querySelector('#root')?.textContent.length > 30);
      await page.evaluate(() => window.protocoloTagManager?.setConsent(true));
      assert.equal(googleRequests.length, 0);
      assert.equal((await dataLayer(page)).some((entry) => entry.event === 'gtm.js'), false);
      assert.equal(await page.locator('script[src^="https://www.googletagmanager.com/gtm.js"]').count(), 0);
    }, 'accepted');
  }

  await scenario('CSP permite container autorizado e continua bloqueando scripts inline', async ({ context, googleRequests }) => {
    const page = await context.newPage();
    await page.goto(origin);
    await waitForContainer(page);
    assert.equal(googleRequests.length, 1, 'GTM deve executar sob a CSP efetiva.');
    await page.evaluate(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => window.__cspViolations.push({
        directive: event.effectiveDirective, blocked: event.blockedURI,
      }));
      const script = document.createElement('script');
      script.textContent = 'window.__blockedInlineRan = true;';
      document.head.appendChild(script);
    });
    await page.waitForFunction(() => window.__cspViolations.some((event) => event.directive === 'script-src-elem' && event.blocked === 'inline'));
    assert.equal(await page.evaluate(() => window.__blockedInlineRan === true), false);
  }, 'accepted');

  console.log(`${passed} cenários de GTM passaram; nenhuma conexão real com Meta ou Google.`);
} finally { await browser?.close(); }
