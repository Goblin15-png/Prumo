import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRuntime, assessCsrf, checkPublic } from './check-public.mjs';

test('runtime exige JSON com contrato real e modo simulado desativado', () => {
  assert.equal(assessRuntime(Response.json({}),{local_test_mode:false}),null);
  assert.match(assessRuntime(new Response('<html>'),undefined),/HTML/);
  assert.match(assessRuntime(Response.json({}),{}),/contrato/);
  assert.match(assessRuntime(Response.json({}),{local_test_mode:true}),/simulado/);
  assert.match(assessRuntime(Response.json({}, {status:503}),{}),/503/);
});
const cookies = ['XSRF-TOKEN=fake; Path=/; Secure; SameSite=Lax','session=fake; Path=/; Secure; HttpOnly; SameSite=Lax'];
const csrf = (values=cookies) => { const headers = new Headers(); values.forEach(value => headers.append('Set-Cookie',value)); return new Response(null,{status:204,headers}); };
test('CSRF verifica cookies sem expor valores', () => {
  assert.equal(assessCsrf(csrf()),null);
  assert.match(assessCsrf(csrf([])),/ausentes/);
  assert.match(assessCsrf(csrf(cookies.map(value => value+'; Domain=api.example.invalid'))),/Domain/);
  assert.match(assessCsrf(csrf(cookies.map(value => value.replace('; Secure','')))),/Secure/);
  assert.match(assessCsrf(csrf([cookies[0]+'; HttpOnly',cookies[1]])),/legível/);
});
test('diagnóstico usa apenas GET, não segue redirects nem reutiliza cookies', async () => {
  const calls = [];
  const results = await checkPublic('https://api.example.invalid','https://shop.example.invalid',async (url,options) => {
    calls.push(String(url));
    assert.equal(options.method,'GET');
    assert.equal(options.redirect,'manual');
    assert.equal(options.headers.Cookie,undefined);
    return url.pathname.includes('runtime') ? Response.json({local_test_mode:false}) : csrf();
  });
  assert.equal(calls.length,2);
  assert.equal(results.every(result => result.ok),true);
  assert.equal(JSON.stringify(results).includes('fake'),false);
});
test('falha de rede não revela detalhes e não interrompe outras verificações', async () => {
  const results = await checkPublic('https://api.example.invalid','https://shop.example.invalid',async () => {throw new Error('password=secret');});
  assert.equal(results.length,2);
  assert.equal(results.every(result => !result.ok),true);
  assert.equal(JSON.stringify(results).includes('secret'),false);
});
