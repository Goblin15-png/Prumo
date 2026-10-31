// Laboratório B2B: somente build demo e dados fictícios, sem cadastro ou API real.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const demoDist = fileURLToPath(new URL('../dist/',import.meta.url));
const productionAssets = fileURLToPath(new URL('../../frontend/dist/assets/',import.meta.url));
for (const name of await readdir(productionAssets)) {
  if (!name.endsWith('.js')) continue;
  const contents = await readFile(resolve(productionAssets,name),'utf8');
  assert.equal(contents.includes('B2B-DEMO-'),false,'O build de produção não deve incluir o módulo fictício.');
}
const server = createServer(async (request,response) => {
  try {
    const path = resolve(demoDist,`.${new URL(request.url,'http://localhost').pathname}`);
    assert.ok(path === resolve(demoDist) || path.startsWith(demoDist));
    const file = extname(path) ? path : resolve(demoDist,'index.html');
    response.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0,'127.0.0.1',done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({headless:true});
  for (const width of [1440,390]) {
    const context = await browser.newContext({viewport:{width,height:900}});
    try {
      const apiRequests = [];
      const errors = [];
      await context.route('**/*',async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/sanctum/')) {apiRequests.push(url.href);return route.abort();}
        return url.origin === base ? route.continue() : route.abort();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(6000);
      page.on('pageerror',(error) => errors.push(error.message));
      await page.goto(`${base}/?view=distribuidores&persona=visitante`);
      const portal = page.getByRole('region',{name:'Portal de distribuidores simulado',exact:true});
      await portal.getByRole('heading',{name:'Distribuidores · demonstração',exact:true}).waitFor();
      const registration = portal.getByRole('form',{name:'Cadastro simulado de empresa',exact:true});
      assert.equal(await registration.getByLabel('Senha (somente ilustração)',{exact:true}).getAttribute('readonly'),'');
      await registration.getByLabel('Nome da empresa',{exact:true}).fill('Distribuidora QA fictícia');
      await registration.getByLabel('CNPJ de exemplo',{exact:true}).fill('12.ABC.345/01DE-36');
      await registration.getByRole('button',{name:'Cadastrar empresa fictícia',exact:true}).click();
      await portal.getByRole('alert').filter({hasText:'dígitos verificadores'}).waitFor();
      await registration.getByLabel('CNPJ de exemplo',{exact:true}).fill('12.ABC.345/01DE-35');
      await registration.getByRole('button',{name:'Cadastrar empresa fictícia',exact:true}).click();
      await portal.getByText('Aguarde a análise do lojista fictício para solicitar produtos.',{exact:true}).waitFor();
      assert.equal(await portal.getByRole('form',{name:'Solicitação simulada de produtos',exact:true}).count(),0);
      await portal.getByRole('button',{name:'Simular cadastro',exact:true}).click();
      await registration.getByLabel('Nome da empresa',{exact:true}).fill('Duplicada fictícia');
      await registration.getByLabel('CNPJ de exemplo',{exact:true}).fill('12.abc.345/01de-35');
      await registration.getByRole('button',{name:'Cadastrar empresa fictícia',exact:true}).click();
      await portal.getByRole('alert').filter({hasText:'já consta'}).waitFor();
      await portal.getByRole('button',{name:'Simular lojista',exact:true}).click();
      const company = portal.getByRole('article',{name:'Empresa Distribuidora QA fictícia',exact:true});
      await company.getByRole('button',{name:'Aprovar empresa fictícia',exact:true}).click();
      await company.getByText('Aprovada na simulação',{exact:true}).waitFor();
      await portal.getByRole('button',{name:'Simular distribuidor',exact:true}).click();
      const requestForm = portal.getByRole('form',{name:'Solicitação simulada de produtos',exact:true});
      await requestForm.getByRole('button',{name:'Enviar solicitação fictícia',exact:true}).click();
      await portal.getByRole('alert').filter({hasText:'Selecione ao menos um blend'}).waitFor();
      await requestForm.getByLabel('Quantidade de Blend Floral',{exact:true}).fill('3');
      await requestForm.getByRole('button',{name:'Enviar solicitação fictícia',exact:true}).click();
      await portal.getByRole('article',{name:'Solicitação B2B-DEMO-1',exact:true}).waitFor();
      await portal.getByLabel('Empresa em visualização simulada',{exact:true}).selectOption('1');
      assert.equal(await portal.getByRole('article',{name:'Solicitação B2B-DEMO-1',exact:true}).count(),0);
      await portal.getByLabel('Empresa em visualização simulada',{exact:true}).selectOption('3');
      await portal.getByRole('article',{name:'Solicitação B2B-DEMO-1',exact:true}).waitFor();
      await portal.getByRole('button',{name:'Simular lojista',exact:true}).click();
      const incoming = portal.getByRole('article',{name:'Solicitação B2B-DEMO-1',exact:true});
      await incoming.getByLabel('Situação de B2B-DEMO-1',{exact:true}).selectOption('answered');
      await incoming.getByLabel('Retorno para B2B-DEMO-1',{exact:true}).fill('Retorno fictício: solicitação em análise comercial, sem cobrança.');
      await incoming.getByRole('button',{name:'Salvar retorno simulado',exact:true}).click();
      await incoming.getByText('Retorno simulado: Retorno fictício: solicitação em análise comercial, sem cobrança.',{exact:true}).waitFor();
      const rejected = portal.getByRole('article',{name:'Empresa Distribuidora Horizonte · fictícia',exact:true});
      await rejected.getByRole('button',{name:'Rejeitar empresa fictícia',exact:true}).click();
      await portal.getByRole('button',{name:'Simular distribuidor',exact:true}).click();
      await portal.getByLabel('Empresa em visualização simulada',{exact:true}).selectOption('2');
      await portal.getByText('Nesta proposta, o cadastro rejeitado não pode enviar solicitações.',{exact:true}).waitFor();
      assert.equal(await portal.getByRole('form',{name:'Solicitação simulada de produtos',exact:true}).count(),0);
      await page.getByRole('button',{name:'Início',exact:true}).click();
      await page.getByRole('button',{name:'Distribuidores B2B',exact:true}).click();
      await portal.getByLabel('Empresa em visualização simulada',{exact:true}).selectOption('3');
      await portal.getByText('Retorno simulado: Retorno fictício: solicitação em análise comercial, sem cobrança.',{exact:true}).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
      assert.deepEqual(await page.evaluate(() => Object.entries(sessionStorage)),[]);
      assert.equal(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)).includes('Distribuidora QA')),false);
      await page.reload();
      await portal.getByLabel('Empresa em visualização simulada',{exact:true}).waitFor();
      assert.equal(await portal.getByLabel('Empresa em visualização simulada',{exact:true}).locator('option').count(),2,'Recarregar deve descartar as empresas cadastradas na prévia.');
      assert.deepEqual(apiRequests,[]);
      assert.deepEqual(errors,[]);
      console.log(`PASS B2B ${width}px: cadastro, duplicação, aprovação/rejeição, solicitação, histórico, retorno e isolamento sem API.`);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
