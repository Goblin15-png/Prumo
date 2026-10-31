import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScenario, cartTotal, demoProducts, resolveDemoParams, searchDemoProducts, updateCart } from './demoModel.js';

test('cenário vazio não modifica os produtos de referência', () => {
  assert.equal(applyScenario(demoProducts, 'vazio').length, 0);
  assert.equal(demoProducts.length, 6);
});
test('cenário sem estoque bloqueia quantidades mas não altera os dados base', () => {
  const scenario = applyScenario(demoProducts, 'sem-estoque');
  assert.equal(scenario.every((product) => product.stock === 0), true);
  assert.equal(updateCart([], scenario[0], 1).length, 0);
  assert.equal(demoProducts[0].stock, 15);
});
test('carrinho respeita o estoque e permite remover', () => {
  const item = demoProducts[0];
  const cart = updateCart([], item, 100);
  assert.equal(cart[0].quantity, 15);
  assert.equal(cartTotal(cart), item.price * 15);
  assert.deepEqual(updateCart(cart, item, -15), []);
});
test('pesquisa inclui nomes e ingredientes', () => {
  assert.deepEqual(searchDemoProducts(demoProducts, 'alecrim').map((p) => p.id), [103]);
  assert.deepEqual(searchDemoProducts(demoProducts, 'Inexistente'), []);
});
test('parâmetros inválidos voltam a valores permitidos', () => {
  assert.deepEqual(resolveDemoParams('?view=admin&persona=visitante&scenario=pago'), { view: 'admin', persona: 'visitante', scenario: 'pago' });
  assert.deepEqual(resolveDemoParams('?view=segredo&persona=foo&scenario=erro'), { view: 'inicio', persona: 'cliente', scenario: 'normal' });
});
