// Interface real com API fictícia. Sem email, contas ou pagamentos reais.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
const server = createServer(async (request,response) => {
  try {
    const path = resolve(dist, '.'+new URL(request.url,'http://localhost').pathname);
    assert.ok(path === resolve(dist) || path.startsWith(dist));
    const file = extname(path) ? path : resolve(dist,'index.html');
    response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0,'127.0.0.1',done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  const user = {id:42,name:'Cliente fictício',email:'buyer@example.invalid',role:'customer',email_verified_at:null};
  let confirms = 0;
  let resends = 0;
  await page.route('**/*',async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/sanctum/csrf-cookie') return route.fulfill({status:204});
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let body = {};
    let status = 200;
    if (url.pathname.endsWith('/me')) body = {user};
    else if (url.pathname.endsWith('/runtime-config')) body = {local_test_mode:false};
    else if (url.pathname.endsWith('/products')) body = {data:[]};
    else if (url.pathname.endsWith('/categories')) body = [];
    else if (url.pathname.endsWith('/verification-notification')) {
      resends++; body = {message:'Código fictício reenviado.'}; status = 202;
    } else if (url.pathname.endsWith('/confirm-code')) {
      confirms++;
      if (route.request().postDataJSON().code !== '123456') {
        status = 422; body = {errors:{code:['Código inválido ou expirado.']}};
      } else body = {user:{...user,email_verified_at:'2026-11-01T12:00:00Z'}};
    }
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base);
  const form = page.getByRole('region',{name:'Confirmação de email'});
  await form.waitFor();
  await form.getByRole('button',{name:'Reenviar código'}).click();
  await page.getByText('Código fictício reenviado.').waitFor();
  const input = form.getByRole('textbox',{name:'Código de confirmação'});
  await input.fill('123');
  assert.equal(await form.getByRole('button',{name:'Confirmar email',exact:true}).isDisabled(),true);
  await input.fill('654321');
  await form.getByRole('button',{name:'Confirmar email',exact:true}).click();
  await form.getByRole('alert').filter({hasText:'Código inválido'}).waitFor();
  await input.fill('123456');
  await form.getByRole('button',{name:'Confirmar email',exact:true}).click();
  await form.waitFor({state:'detached'});
  await page.getByText('Email confirmado. Você já pode continuar sua compra.').waitFor();
  assert.equal(confirms,2);
  assert.equal(resends,1);
  console.log('PASS: reenvio, validação, erro e confirmação atualizam a interface com API fictícia.');
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
