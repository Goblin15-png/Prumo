import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { handleRequest } from '../../cloudflare/worker.mjs';
const site = 'https://pruma.example.invalid';
const origin = 'https://api.example.invalid';
const env = {LARAVEL_ORIGIN:origin,ASSETS:{fetch:() => new Response('ASSET-FICTICIO')}};
const api = (path='/api/v1/runtime-config',options) => new Request(site+path,options);

test('página, painel e arquivos estáticos continuam no binding de assets',async () => {
  for (const path of ['/','/admin','/reset-password','/assets/app.js','/apiary']) {
    let fetched = false;
    const response = await handleRequest(new Request(site+path),env,() => {fetched=true;throw new Error('Não deve consultar API.');});
    assert.equal(await response.text(),'ASSET-FICTICIO');
    assert.equal(fetched,false);
  }
});
test('sem origin configurado, API e CSRF retornam JSON 503 sem consultar rede nem assets',async () => {
  for (const path of ['/api/v1/runtime-config','/api/v1/register','/sanctum/csrf-cookie']) {
    const response = await handleRequest(api(path),{},() => assert.fail('Sem configuração não deve consultar rede.'));
    assert.equal(response.status,503);
    assert.match(response.headers.get('content-type'),/application\/json/);
    assert.match(response.headers.get('cache-control'),/no-store/);
    assert.equal((await response.json()).code,'API_NOT_CONFIGURED');
  }
});
test('recusa origin inseguro, com credenciais, caminho ou loop para a loja',async () => {
  for (const value of ['http://api.example.invalid','https://user:secret@api.example.invalid','https://api.example.invalid/api','https://api.example.invalid?target=evil','https://api.example.invalid#private','https://127.0.0.1','https://localhost','https://backend.internal','https://api.example.invalid:8443',site,'bad-url']) {
    const response = await handleRequest(api(),{...env,LARAVEL_ORIGIN:value},() => assert.fail('Não deve consultar origin inválido.'));
    assert.equal(response.status,503,value);
  }
});
test('reserva namespaces de API e recusa caminhos fora do contrato sem fallback HTML',async () => {
  for (const path of ['/api','/api/v2/products','/sanctum','/sanctum/other']) {
    const response = await handleRequest(api(path),env,() => assert.fail('Rota fora do contrato.'));
    assert.equal(response.status,404,path);
    assert.equal((await response.json()).code,'API_ROUTE_NOT_FOUND');
  }
  for (const path of ['/api/v1/%2f..%2f.env','/api/v1/%252fsecret','/api/v1/%5csecret','/api/v1/%00','/api/v1/%XX']) {
    const response = await handleRequest(api(path),env,() => assert.fail('Caminho inválido.'));
    assert.equal(response.status,400,path);
  }
});
test('encaminha caminho e query para origin fixo, sem permitir destino vindo do cliente',async () => {
  let called;
  const response = await handleRequest(api('/api/v1/products?search=blend%20A&target=https%3A%2F%2Fevil.invalid'),env,async (request) => {
    called = request;
    return Response.json({data:[]});
  });
  assert.equal(response.status,200);
  assert.equal(new URL(called.url).origin,origin);
  assert.equal(new URL(called.url).search,'?search=blend%20A&target=https%3A%2F%2Fevil.invalid');
  assert.equal(called.cache,'no-store');
  assert.equal(called.redirect,'manual');
});
test('cadastro preserva corpo, cookies, Origin/Referer e CSRF, sem repetir POST',async () => {
  const body = JSON.stringify({name:'Pessoa fictícia',email:'buyer@example.invalid',password:'senha-exclusiva-do-teste',password_confirmation:'senha-exclusiva-do-teste'});
  let count = 0;
  const response = await handleRequest(api('/api/v1/register',{
    method:'POST',body,headers:{'Content-Type':'application/json','Cookie':'pruma_session=fake; XSRF-TOKEN=fake-csrf','X-XSRF-TOKEN':'fake-csrf','Origin':site,'Referer':site+'/','X-Forwarded-For':'forged','X-Forwarded-Host':'evil.invalid','Forwarded':'host=evil.invalid','X-Real-IP':'forged','Host':'evil.invalid'},
  }),env,async (request) => {
    count++;
    assert.equal(request.method,'POST');
    assert.equal(await request.text(),body);
    assert.equal(request.headers.get('cookie'),'pruma_session=fake; XSRF-TOKEN=fake-csrf');
    assert.equal(request.headers.get('x-xsrf-token'),'fake-csrf');
    assert.equal(request.headers.get('origin'),site);
    assert.equal(request.headers.get('referer'),site+'/');
    assert.equal(request.headers.get('accept'),'application/json');
    assert.equal(request.headers.get('x-forwarded-proto'),'https');
    for (const name of ['host','forwarded','x-forwarded-for','x-forwarded-host','x-real-ip']) assert.equal(request.headers.has(name),false,name);
    return Response.json({user:{id:1}}, {status:201});
  });
  assert.equal(count,1);
  assert.equal(response.status,201);
  assert.deepEqual(await response.json(),{user:{id:1}});
});
test('webhook preserva assinatura, ID, query e corpo sem chamar serviços financeiros',async () => {
  let calls = 0;
  const body = '{"type":"order","data":{"id":"ORD-FICTICIA"}}';
  const response = await handleRequest(api('/api/v1/payments/mercado-pago/webhook?data.id=ORD-FICTICIA',{
    method:'POST',body,headers:{'Content-Type':'application/json','X-Signature':'ts=123,v1=fake-hash','X-Request-Id':'fake-event-id'},
  }),env,async (request) => {
    calls++;
    assert.equal(request.headers.get('x-signature'),'ts=123,v1=fake-hash');
    assert.equal(request.headers.get('x-request-id'),'fake-event-id');
    assert.equal(new URL(request.url).search,'?data.id=ORD-FICTICIA');
    assert.equal(await request.text(),body);
    return Response.json({received:true});
  });
  assert.equal(response.status,200);
  assert.equal(calls,1);
});
test('só usa IP fornecido pela plataforma quando há contexto CF',async () => {
  const request = api('/api/v1/me',{headers:{'CF-Connecting-IP':'192.0.2.4','X-Forwarded-For':'forged'}});
  Object.defineProperty(request,'cf',{value:{colo:'TEST'}});
  await handleRequest(request,env,async (forwarded) => {
    assert.equal(forwarded.headers.get('x-forwarded-for'),'192.0.2.4');
    return Response.json({});
  });
});
test('mantém os cookies separados da loja, painel e CSRF, incluindo Expires com vírgula',async () => {
  const cookies = [
    'pruma_session=customer; Path=/; HttpOnly; Secure; SameSite=Lax',
    'pruma_session_admin_v1=admin; Path=/; HttpOnly; Secure; SameSite=Lax',
    'ADMIN-XSRF-TOKEN=csrf; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Path=/; Secure; SameSite=Lax',
  ];
  const headers = new Headers();
  cookies.forEach((cookie) => headers.append('Set-Cookie',cookie));
  const response = await handleRequest(api('/sanctum/csrf-cookie'),env,async () => new Response(null,{status:204,headers}));
  assert.equal(response.status,204);
  assert.deepEqual(response.headers.getSetCookie(),cookies);
  assert.match(response.headers.get('cache-control'),/private, no-store/);
});
test('não segue redirect com cookies/credenciais; reescreve Location interno para a loja',async () => {
  let count = 0;
  const response = await handleRequest(api('/api/v1/email/verify/1/example?expires=123&signature=fake'),env,async (request) => {
    count++;
    assert.equal(request.redirect,'manual');
    return new Response(null,{status:302,headers:{Location:origin+'/reset-password#token=fake'}});
  });
  assert.equal(count,1);
  assert.equal(response.status,302);
  assert.equal(response.headers.get('location'),site+'/reset-password#token=fake');
  const tracking = await handleRequest(api('/api/v1/tracking/google-tag-manager-noscript'),env,async () => new Response(null,{status:302,headers:{Location:'https://www.googletagmanager.com/ns.html?id=GTM-TEST'}}));
  assert.equal(tracking.headers.get('location'),'https://www.googletagmanager.com/ns.html?id=GTM-TEST');
});
test('preserva recusas e validações Laravel, sem convertê-las em sucesso',async () => {
  for (const status of [401,403,419,422,429,503]) {
    const response = await handleRequest(api('/api/v1/register'),env,async () => Response.json({message:'Erro fictício',errors:{email:['Exemplo']}},{status}));
    assert.equal(response.status,status);
    assert.deepEqual(await response.json(),{message:'Erro fictício',errors:{email:['Exemplo']}});
  }
});
test('HTML de origin errado é erro JSON e detalhes de rede não são expostos',async () => {
  const wrong = await handleRequest(api(),env,async () => new Response('<html>APP_KEY=nao-expor</html>',{headers:{'content-type':'text/html'}}));
  assert.equal(wrong.status,502);
  assert.equal((await wrong.json()).code,'API_RESPONSE_INVALID');
  let calls = 0;
  const failed = await handleRequest(api('/api/v1/checkout/transparent',{method:'POST',body:'{}'}),env,async () => {
    calls++;
    throw new Error('password=nao-expor');
  });
  assert.equal(failed.status,503);
  assert.equal(calls,1,'Não repetir POST de pagamento após falha.');
  assert.equal((await failed.text()).includes('nao-expor'),false);
});
test('a assinatura fetch do Worker aceita ExecutionContext sem tratá-lo como fetcher',async () => {
  const response = await worker.fetch(api(),{}, {waitUntil:() => {}});
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'API_NOT_CONFIGURED');
});
