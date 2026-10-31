// Chromium → prévia Laravel local → ViaCEP real. Não intercepta respostas nem cria pedidos.
// O CEP 01001-000 é o exemplo público da documentação do ViaCEP, sem dados de cliente.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:4180';
assert.match(base, /^http:\/\/127\.0\.0\.1:[0-9]+$/, 'Use somente a prévia local em banco temporário.');
const artifacts = process.env.SMOKE_ARTIFACTS || '/tmp/protocolar-checkout';
await mkdir(artifacts, { recursive: true });

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const configResponse = await context.request.get(`${base}/api/v1/runtime-config`);
  assert.equal(configResponse.status(), 200, 'A configuração da prévia deve responder.');
  const config = await configResponse.json();
  assert.equal(config.local_test_mode, true, 'Catálogo, frete e pagamentos devem permanecer em teste local.');
  assert.equal(config.postal_code?.provider, 'viacep');
  assert.equal(config.postal_code?.simulated, false, 'Esta verificação exige consulta real ao ViaCEP.');

  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const pageErrors = [];
  const paymentRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.includes('/checkout/')) paymentRequests.push(request.url());
  });
  await page.goto(base);
  await page.getByRole('button', { name: 'Recusar rastreamento', exact: true }).click();
  await page.getByRole('heading', { name: 'Blend de teste integrado', exact: true }).first().click();
  await page.getByRole('button', { name: 'Adicionar à Sacola', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar para o checkout', exact: true }).click();
  await page.getByRole('heading', { name: 'Finalizar compra', exact: true }).waitFor();
  await page.getByText(/ViaCEP/).first().waitFor();
  const visibleText = await page.locator('body').innerText();
  assert.match(visibleText, /(?:dados|catálogo)[^\n]*(?:fictíci|simulad)/i, 'A interface deve identificar os dados fictícios da prévia.');
  assert.match(visibleText, /frete[^\n]*simulad/i, 'A interface deve identificar o frete simulado.');
  assert.match(visibleText, /pagamento[^\n]*simulad|simulad[^\n]*pagamento/i, 'A interface deve identificar o pagamento simulado.');

  await page.getByLabel('Número', { exact: true }).fill('123');
  await page.getByLabel('Complemento (opcional)', { exact: true }).fill('Complemento fictício para teste');
  const lookupResponse = page.waitForResponse((response) => response.url() === `${base}/api/v1/postal-codes/01001000`);
  await page.getByLabel('CEP', { exact: true }).fill('01001000');
  const response = await lookupResponse;
  assert.equal(response.status(), 200, 'O Laravel deve consultar o ViaCEP com sucesso.');
  const address = await response.json();
  assert.equal(address.postal_code, '01001000');
  assert.equal(address.city, 'São Paulo');
  assert.equal(address.state, 'SP');
  assert.ok(address.street?.trim(), 'O endereço público consultado deve ter logradouro.');
  await page.getByText(/Endereço localizado/).waitFor();
  assert.equal(await page.getByLabel('CEP', { exact: true }).inputValue(), '01001-000');
  assert.equal(await page.getByLabel('Cidade', { exact: true }).inputValue(), 'São Paulo');
  assert.equal(await page.getByLabel('Estado (UF)', { exact: true }).inputValue(), 'SP');
  assert.equal(await page.getByLabel('Rua', { exact: true }).inputValue(), address.street);
  assert.equal(await page.getByLabel('Bairro', { exact: true }).inputValue(), address.neighborhood);
  assert.equal(await page.getByLabel('Número', { exact: true }).inputValue(), '123');
  assert.equal(await page.getByLabel('Complemento (opcional)', { exact: true }).inputValue(), 'Complemento fictício para teste');
  assert.equal(new URL(page.url()).origin, base);
  assert.deepEqual(paymentRequests, [], 'Consultar o endereço não deve criar pedido ou cobrança.');
  assert.deepEqual(pageErrors, [], 'O checkout não deve gerar erros JavaScript.');
  await page.screenshot({ path: join(artifacts, 'checkout-cep-real.png'), fullPage: true });
  console.log('PASS CEP real: navegador → Laravel → ViaCEP; rua, bairro, São Paulo/SP preenchidos, número/complemento preservados, sem login ou pagamento.');
  await context.close();
} finally {
  await browser?.close();
}
