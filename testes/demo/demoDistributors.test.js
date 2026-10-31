import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDistributorsDemo, normalizeDemoCnpj, isValidDemoCnpj, registerDemoCompany,
  reviewDemoCompany, submitDemoDistributorRequest, updateDemoDistributorRequest, demoRequestsForCompany,
} from './demoDistributorsModel.js';
import { resolveDemoParams } from './demoModel.js';
const products = [{id:10,name:'Blend fictício',stock:3,is_active:true,price:99},{id:11,name:'Oculto',stock:4,is_active:false},{id:12,name:'Sem estoque',stock:0,is_active:true}];
const line = [{product_id:10,quantity:2}];

test('CNPJ aceita exemplo oficial alfanumérico e formato numérico sem descartar letras', () => {
  assert.equal(isValidDemoCnpj('12.ABC.345/01DE-35'),true); // Exemplo do manual técnico Receita/Serpro.
  assert.equal(isValidDemoCnpj('11.222.333/0001-81'),true);
  assert.equal(normalizeDemoCnpj(' 12.abc.345/01de-35 '),'12ABC34501DE35');
  assert.equal(isValidDemoCnpj('12.abc.345/01de-35'),true);
});
test('CNPJ recusa dígitos alterados, sequências repetidas e caracteres não suportados', () => {
  for (const value of ['12ABC34501DE36','11222333000180','00000000000000','11111111111111','12#ABC34501DE35','12ÁBC34501DE35',null,'']) assert.equal(isValidDemoCnpj(value),false,String(value));
});
test('cadastro simulado fica pendente, normaliza e impede duplicação sem guardar senha', () => {
  const initial = createDistributorsDemo();
  const state = registerDemoCompany(initial,{name:' Empresa de teste ',cnpj:'12.abc.345/01de-35',password:'NAO-PERSISTIR'});
  const company = state.companies.at(-1);
  assert.equal(company.name,'Empresa de teste');
  assert.equal(company.status,'pending');
  assert.equal(company.cnpj,'12ABC34501DE35');
  assert.equal(initial.companies.length,2);
  assert.equal(JSON.stringify(state).includes('NAO-PERSISTIR'),false);
  assert.throws(() => registerDemoCompany(state,{name:'Outra empresa',cnpj:'12ABC34501DE35'}),/já consta/);
  assert.throws(() => registerDemoCompany(state,{name:' ',cnpj:'11222333000181'}),/nome/);
});
test('somente persona admin pode analisar uma empresa pendente no modelo simulado', () => {
  const state = createDistributorsDemo();
  assert.throws(() => reviewDemoCompany(state,'distribuidor',2,'approved'),/administrador/);
  assert.throws(() => reviewDemoCompany(state,'admin',1,'approved'),/pendente/);
  assert.throws(() => reviewDemoCompany(state,'admin',2,'other'),/aprovar/);
  const approved = reviewDemoCompany(state,'admin',2,'approved');
  assert.equal(approved.companies[1].status,'approved');
  assert.equal(state.companies[1].status,'pending');
});
test('contas pendentes e rejeitadas não podem enviar solicitações', () => {
  const state = createDistributorsDemo();
  assert.throws(() => submitDemoDistributorRequest(state,'distribuidor',2,line,products),/aprovado/);
  const rejected = reviewDemoCompany(state,'admin',2,'rejected');
  assert.throws(() => submitDemoDistributorRequest(rejected,'distribuidor',2,line,products),/aprovado/);
  for (const persona of ['visitante','cliente','admin']) assert.throws(() => submitDemoDistributorRequest(state,persona,1,line,products),/aprovado/);
  assert.equal(state.requests.length,0);
});
test('solicitações validam produto, disponibilidade, duplicação e quantidades inteiras', () => {
  const state = createDistributorsDemo();
  for (const lines of [[],[{product_id:999,quantity:1}],[{product_id:11,quantity:1}],[{product_id:12,quantity:1}],[...line,...line],...[-1,0,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1].map((quantity) => [{product_id:10,quantity}])]) {
    assert.throws(() => submitDemoDistributorRequest(state,'distribuidor',1,lines,products));
  }
  assert.equal(state.requests.length,0);
});
test('solicitação usa snapshot do produto e não cria preço, cobrança ou reserva de estoque', () => {
  const state = createDistributorsDemo();
  const before = structuredClone(products);
  const next = submitDemoDistributorRequest(state,'distribuidor',1,line,products);
  assert.deepEqual(next.requests[0].items,[{product_id:10,product_name:'Blend fictício',quantity:2}]);
  assert.equal(next.requests[0].status,'received');
  assert.equal(next.requests[0].number,'B2B-DEMO-1');
  assert.deepEqual(products,before);
  assert.equal(state.requests.length,0);
  assert.equal(Object.hasOwn(next.requests[0],'total'),false);
});
test('histórico filtra empresa e retorno proposto exige administrador e mensagem', () => {
  let state = reviewDemoCompany(createDistributorsDemo(),'admin',2,'approved');
  state = submitDemoDistributorRequest(state,'distribuidor',1,line,products);
  state = submitDemoDistributorRequest(state,'distribuidor',2,line,products);
  assert.equal(demoRequestsForCompany(state,1).length,1);
  assert.equal(demoRequestsForCompany(state,1)[0].company_id,1);
  assert.throws(() => updateDemoDistributorRequest(state,'distribuidor',1,'answered','Retorno'),/administrador/);
  assert.throws(() => updateDemoDistributorRequest(state,'admin',1,'answered',' '),/mensagem/);
  assert.throws(() => updateDemoDistributorRequest(state,'admin',999,'reviewing',''),/encontrada/);
  const next = updateDemoDistributorRequest(state,'admin',1,'answered','Retorno de exemplo');
  assert.equal(demoRequestsForCompany(next,1)[0].response,'Retorno de exemplo');
  assert.equal(demoRequestsForCompany(next,2)[0].status,'received');
});
test('novo link de laboratório resolve a visualização de distribuidores sem alterar links existentes', () => {
  assert.equal(resolveDemoParams('?view=distribuidores&persona=distribuidor').view,'distribuidores');
  assert.equal(resolveDemoParams('?view=distribuidores&persona=distribuidor').persona,'distribuidor');
  assert.equal(resolveDemoParams('?view=catalogo').view,'inicio');
});
