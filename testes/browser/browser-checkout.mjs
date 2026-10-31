// Build real da loja; API e SDK interceptados exclusivamente neste teste. Nenhuma cobrança.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(dist, `.${pathname}`);
    assert.ok(path === resolve(dist) || path.startsWith(dist));
    const file = extname(path) ? path : resolve(dist, 'index.html');
    response.setHeader('Content-Type', ({ '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.png':'image/png' })[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolveReady, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveReady); });
const base = `http://127.0.0.1:${server.address().port}`;
const artifacts = process.env.SMOKE_ARTIFACTS || '/tmp/protocolar-checkout';
await mkdir(artifacts, { recursive: true });
const addressByPostalCode = {
  '00000000': {street:'Rua Postal Fictícia',neighborhood:'Bairro Postal Modelo',city:'Cidade Postal Fictícia',state:'PA'},
  '11111111': {street:'Rua da Primeira Consulta',neighborhood:'Bairro da Primeira Consulta',city:'Cidade da Primeira Consulta',state:'SP'},
  '22222222': {street:'Rua da Consulta Antiga',neighborhood:'Bairro da Consulta Antiga',city:'Cidade da Consulta Antiga',state:'AM'},
  '33333333': {street:'Rua da Consulta Recente',neighborhood:'Bairro da Consulta Recente',city:'Cidade da Consulta Recente',state:'SC'},
};
const addressLabels = {street:'Rua',neighborhood:'Bairro',city:'Cidade',state:'Estado (UF)'};
const privateAddressFields = {'Nome de quem recebe':'Pessoa Fictícia','Telefone para entrega':'00000000000','Número':'10','Complemento (opcional)':'Apartamento de teste'};
const deferred = () => {
  let resolvePromise;
  const promise = new Promise((done) => { resolvePromise = done; });
  return {promise,resolve:resolvePromise};
};
const waitForLookup = async (promise) => {
  let timeout;
  try {
    await Promise.race([promise,new Promise((_,reject) => { timeout = setTimeout(() => reject(new Error('A consulta de CEP não chegou ao estado esperado.')),10000); })]);
  } finally { clearTimeout(timeout); }
};
const addressSnapshot = async (page) => Object.fromEntries(await Promise.all(Object.entries(addressLabels).map(async ([key,label]) => [key,await page.getByLabel(label,{exact:true}).inputValue()])));
const assertPrivateAddress = async (page) => {
  for (const [label,value] of Object.entries(privateAddressFields)) assert.equal(await page.getByLabel(label,{exact:true}).inputValue(),value,`${label} deve ser preservado.`);
};
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const scenario of ['pix-delivery', 'card-pickup', 'retry', 'declined', 'postal-code-race', 'postal-code-unavailable']) {
    const context = await browser.newContext({ viewport: scenario === 'card-pickup' ? { width:390, height:844 } : { width:1440, height:1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = []; const writes = []; let posted = 0; let confirmed = false; let sdkUnmounts = 0;
    const postalRequests = [];
    const pendingLookups = Object.fromEntries(['11111111','22222222','33333333'].map((code) => [code,{started:deferred(),release:deferred(),settled:deferred()}]));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.exposeFunction('recordUnmount', () => sdkUnmounts++);
    await context.route('**/*', async (route) => {
      const request = route.request(); const url = new URL(request.url());
      if (url.href === 'https://sdk.mercadopago.com/js/v2') return route.fulfill({ contentType:'text/javascript', body:`window.MercadoPago = class { bricks() { return { create: async (type,id,settings) => { const button = document.createElement('button'); button.textContent = 'Pagar com cartão de teste'; button.onclick = () => settings.callbacks.onSubmit({payment_method_id:'master',token:'card-token-fixture-123456',installments:1,payer:{identification:{type:'CPF',number:'12345678909'}}},{paymentTypeId:'credit_card'}); document.getElementById(id).appendChild(button); settings.callbacks.onReady(); return {unmount:async()=>{window.recordUnmount();document.getElementById(id)?.replaceChildren();}}; } }; } };` });
      if (url.pathname.startsWith('/api/v1/') || url.pathname === '/sanctum/csrf-cookie') {
        const endpoint = url.pathname.replace('/api/v1','');
        if (endpoint.startsWith('/postal-codes/')) {
          const postalCode = endpoint.split('/').at(-1);
          postalRequests.push(postalCode);
          if (scenario === 'postal-code-unavailable') return route.fulfill({status:503,json:{message:'Consulta de CEP indisponível. Preencha o endereço manualmente.'}});
          const pending = scenario === 'postal-code-race' ? pendingLookups[postalCode] : null;
          if (pending) { pending.started.resolve(); await pending.release.promise; }
          try {
            // Campos estranhos ao contrato não podem substituir dados pessoais/de entrega.
            await route.fulfill({json:{postal_code:postalCode,...addressByPostalCode[postalCode],recipient_name:'NÃO USAR',phone:'99999999999',number:'999',complement:'NÃO USAR'}});
          } finally { pending?.settled.resolve(); }
          return;
        }
        const product = {id:1,name:'Blend de teste',price:50,stock:5,images:[],ingredients:[],symptoms:[],is_active:true};
        const result = {order_number:'PC-CHECKOUT-TEST',status:confirmed?'paid':'pending',payment_status:confirmed?'approved':'pending',total_price:scenario==='pix-delivery'?'62.90':'50.00',payment_method:scenario==='card-pickup'?'credit_card':'pix',pix_qr_code:'PIX-FICTICIO-SEM-VALOR',fulfillment_method:scenario==='card-pickup'?'pickup':'delivery'};
        if (request.method() === 'POST' && endpoint === '/checkout/transparent') {
          writes.push(request.postDataJSON()); posted++;
          if (scenario === 'retry' && posted === 1) return route.fulfill({status:503,json:{message:'Timeout de teste. Consulte novamente.'}});
          if (scenario === 'declined') return route.fulfill({json:{...result,status:'cancelled',payment_status:'failed'}});
          if (scenario === 'card-pickup') confirmed = true;
          return route.fulfill({json:{...result,status:confirmed?'paid':'pending',payment_status:confirmed?'approved':'pending'}});
        }
        if (endpoint.startsWith('/checkout/attempt/')) { confirmed = true; return route.fulfill({json:{...result,status:'paid',payment_status:'approved'}}); }
        const data = {
          '/products':{data:[product]},'/categories':[], '/me':{user:{id:1,name:'Cliente Teste',email:'buyer@example.invalid',role:'customer',email_verified_at:'2026-01-01'}},
          '/runtime-config':{local_test_mode:false,checkout:{enabled:true,public_key:'TEST-fixture',environment:'sandbox',pickup_enabled:true,pickup_instructions:'Local fictício de teste. Aguarde a confirmação de retirada.'}},
          '/shipping/calculate':{data:[{id:1,name:'Entrega teste',company:'Transportadora fictícia',price:12.90,delivery_time:3}]},'/orders':{data:[]},
        }[endpoint];
        return route.fulfill({json:data || {}});
      }
      return url.origin === base ? route.continue() : route.abort();
    });
    await page.goto(base);
    await page.getByRole('button',{name:'Recusar rastreamento',exact:true}).click();
    await page.getByRole('heading',{name:'Blend de teste',exact:true}).first().click();
    await page.getByRole('button',{name:'Adicionar à Sacola',exact:true}).click();
    await page.getByRole('button',{name:'Continuar para o checkout',exact:true}).click();
    await page.getByRole('heading',{name:'Finalizar compra',exact:true}).waitFor();
    assert.equal(new URL(page.url()).origin,base);
    if (scenario === 'postal-code-race') {
      for (const [label,value] of Object.entries(privateAddressFields)) await page.getByLabel(label,{exact:true}).fill(value);
      await page.getByLabel('CEP',{exact:true}).fill('00000-000');
      await page.getByText(/Endereço localizado/).waitFor();
      assert.deepEqual(await addressSnapshot(page),addressByPostalCode['00000000']);
      await page.getByLabel('Rua',{exact:true}).fill('Rua digitada antes da consulta');
      await page.getByLabel('CEP',{exact:true}).fill('11111-111');
      await waitForLookup(pendingLookups['11111111'].started.promise);
      await page.getByText(/Buscando endereço/).waitFor();
      assert.deepEqual(await addressSnapshot(page),{street:'Rua digitada antes da consulta',neighborhood:'',city:'',state:''},'Trocar CEP deve limpar apenas campos ainda preenchidos automaticamente.');
      await page.getByLabel('Rua',{exact:true}).fill('Rua digitada durante a consulta');
      pendingLookups['11111111'].release.resolve();
      await page.getByText(/Endereço localizado/).waitFor();
      assert.deepEqual(await addressSnapshot(page),{...addressByPostalCode['11111111'],street:'Rua digitada durante a consulta'},'A consulta não pode sobrescrever uma edição feita enquanto aguardava.');
      await assertPrivateAddress(page);

      await page.getByLabel('CEP',{exact:true}).fill('22222-222');
      await waitForLookup(pendingLookups['22222222'].started.promise);
      await page.getByLabel('CEP',{exact:true}).fill('33333-333');
      await waitForLookup(pendingLookups['33333333'].started.promise);
      await page.getByLabel('Cidade',{exact:true}).fill('Cidade digitada durante a consulta');
      pendingLookups['33333333'].release.resolve();
      await page.getByText(/Endereço localizado/).waitFor();
      const recentAddress = await addressSnapshot(page);
      assert.equal(recentAddress.state,'SC');
      assert.equal(recentAddress.neighborhood,'Bairro da Consulta Recente');
      assert.equal(recentAddress.city,'Cidade digitada durante a consulta');
      pendingLookups['22222222'].release.resolve();
      await waitForLookup(pendingLookups['22222222'].settled.promise);
      await page.waitForTimeout(150);
      assert.deepEqual(await addressSnapshot(page),recentAddress,'Uma resposta do CEP antigo não pode sobrescrever o endereço do CEP atual.');
      await assertPrivateAddress(page);
      assert.deepEqual(postalRequests,['00000000','11111111','22222222','33333333']);
      assert.equal(posted,0);
    } else if (scenario === 'card-pickup') {
      await page.getByRole('radio',{name:'Retirada em loja',exact:true}).check();
      await page.getByLabel('Nome de quem vai retirar',{exact:true}).fill('Pessoa Fictícia');
      assert.equal(await page.getByLabel('CEP',{exact:true}).count(),0);
      await page.getByRole('radio',{name:'Cartão de crédito',exact:true}).check();
      await page.getByRole('button',{name:'Pagar com cartão de teste',exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
      await page.screenshot({path:`${artifacts}/checkout-card-mobile.png`,fullPage:true});
      await page.getByRole('button',{name:'Pagar com cartão de teste',exact:true}).click();
      await page.getByRole('heading',{name:'Pagamento confirmado',exact:true}).waitFor();
      assert.equal(writes[0].fulfillment_method,'pickup');
      assert.equal(writes[0].pickup_contact_name,'Pessoa Fictícia');
      assert.equal(writes[0].shipping_address,undefined);
      assert.equal(writes[0].payment.token,'card-token-fixture-123456');
      assert.ok(sdkUnmounts > 0);
      assert.deepEqual(postalRequests,[],'Retirada não deve consultar endereço.');
    } else {
      for (const [label,value] of Object.entries(privateAddressFields)) await page.getByLabel(label,{exact:true}).fill(value);
      if (scenario === 'pix-delivery') {
        await page.getByLabel('CEP',{exact:true}).fill('00000');
        await page.waitForTimeout(500);
        assert.deepEqual(postalRequests,[],'CEP incompleto não deve consultar o servidor.');
      }
      await page.getByLabel('CEP',{exact:true}).fill('00000-000');
      if (scenario === 'postal-code-unavailable') {
        await page.getByText(/Não foi possível buscar o endereço.*preencher os campos manualmente/).waitFor();
        assert.deepEqual(await addressSnapshot(page),{street:'',neighborhood:'',city:'',state:''});
        for (const [key,label] of Object.entries(addressLabels)) await page.getByLabel(label,{exact:true}).fill(addressByPostalCode['00000000'][key]);
      } else {
        await page.getByText(/Endereço localizado/).waitFor();
        assert.deepEqual(await addressSnapshot(page),addressByPostalCode['00000000']);
      }
      await assertPrivateAddress(page);
      assert.deepEqual(postalRequests,['00000000']);
      await page.getByRole('button',{name:'Calcular frete',exact:true}).click();
      await page.getByRole('radio',{name:/Entrega teste/}).check();
      await page.getByLabel('CPF',{exact:true}).fill('12345678909');
      await page.screenshot({path:`${artifacts}/checkout-${scenario}.png`,fullPage:true});
      await page.getByRole('button',{name:'Gerar Pix',exact:true}).click();
      if (scenario === 'retry') {
        await page.getByRole('alert').filter({hasText:'Timeout de teste'}).waitFor();
        await page.getByRole('button',{name:'Consultar esta tentativa novamente',exact:true}).click();
        await page.getByRole('heading',{name:'Aguardando confirmação do pagamento',exact:true}).waitFor();
        assert.deepEqual(writes[0],writes[1]);
      } else if (scenario === 'declined') {
        await page.getByRole('heading',{name:'Pagamento não concluído',exact:true}).waitFor();
        await page.getByRole('button',{name:'Revisar e tentar novamente',exact:true}).click();
        await page.getByRole('button',{name:'Gerar Pix',exact:true}).waitFor();
      } else {
        await page.getByRole('heading',{name:'Aguardando confirmação do pagamento',exact:true}).waitFor();
        assert.equal(await page.getByRole('textbox',{name:'Pix copia e cola'}).inputValue(),'PIX-FICTICIO-SEM-VALOR');
        await page.reload();
        await page.getByRole('heading',{name:'Blend de teste',exact:true}).first().click();
        await page.getByRole('button',{name:'Adicionar à Sacola',exact:true}).click();
        await page.getByRole('button',{name:'Continuar para o checkout',exact:true}).click();
        await page.getByRole('heading',{name:'Pagamento confirmado',exact:true}).waitFor();
        assert.equal(posted,1,'Recarga não pode repetir a cobrança.');
      }
      assert.equal(writes[0].payment.token,undefined);
      assert.equal(writes[0].shipping_address.street,addressByPostalCode['00000000'].street);
      assert.equal(writes[0].shipping_address.number,'10');
      assert.equal(writes[0].shipping_address.complement,'Apartamento de teste');
    }
    assert.equal(new URL(page.url()).origin,base);
    assert.deepEqual(errors,[]);
    const stored = await page.evaluate(()=>Object.entries(sessionStorage));
    assert.equal(JSON.stringify(stored).includes('card-token'),false);
    console.log(`PASS ${scenario}: checkout na loja, sem cobrança externa ou erros JavaScript.`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise((done)=>server.close(done));
}
