import test from 'node:test';
import assert from 'node:assert/strict';
import { demoCategories, demoProducts, resolveDemoParams } from './demoModel.js';
import { groupDemoCatalog } from './demoCatalogModel.js';
import { createDemoCategoryService } from './demoCategoryService.js';

test('início e links antigos do catálogo abrem a mesma vitrine', () => {
  assert.equal(resolveDemoParams('?view=catalogo').view, 'inicio');
  assert.equal(resolveDemoParams('?view=inicio').view, 'inicio');
});

test('a vitrine respeita múltiplas categorias e não duplica produtos dentro de cada categoria', () => {
  const sections = groupDemoCatalog(demoProducts, demoCategories);
  assert.deepEqual(sections.map((section) => section.title), ['Aromas florais', 'Aromas herbais', 'Aromas cítricos']);
  assert.deepEqual(sections[0].products.map((product) => product.id), [101, 102]);
  assert.deepEqual(sections[2].products.map((product) => product.id), [101, 105, 106]);
  assert.equal(sections.every((section) => new Set(section.products.map((product) => product.id)).size === section.products.length), true);
});

test('ordenação e remoções no administrador se refletem na vitrine sem remover os outros vínculos', async () => {
  let state = { products: structuredClone(demoProducts), categories: structuredClone(demoCategories) };
  const service = createDemoCategoryService(() => state, (categories) => { state = { ...state, categories }; }, (products) => { state = { ...state, products }; });
  await service.put('/admin/categories/order', { category_ids: [13, 11, 12] });
  await service.put('/admin/categories/11/products/order', { product_ids: [102, 101] });
  let sections = groupDemoCatalog(state.products, state.categories);
  assert.deepEqual(sections.map((section) => section.title), ['Aromas cítricos', 'Aromas florais', 'Aromas herbais']);
  assert.deepEqual(sections[1].products.map((product) => product.id), [102, 101]);
  assert.deepEqual(sections[0].products.map((product) => product.id), [101, 105, 106]);
  await service.delete('/admin/categories/13/products/101');
  sections = groupDemoCatalog(state.products, state.categories);
  assert.equal(sections[0].products.some((product) => product.id === 101), false);
  assert.equal(sections[1].products.some((product) => product.id === 101), true);
  await service.delete('/admin/categories/11');
  sections = groupDemoCatalog(state.products, state.categories);
  assert.deepEqual(sections.find((section) => section.title === 'Outros produtos').products.map((product) => product.id), [101, 102]);
  assert.deepEqual(demoCategories.map((category) => category.id), [11, 12, 13]);
  assert.equal(demoProducts[0].category_positions, undefined);
});

test('produtos sem categoria continuam visíveis e categorias vazias ou inativas não geram seções', () => {
  const product = { ...demoProducts[0], category_ids: [] };
  const grouped = groupDemoCatalog([product, { ...demoProducts[1], is_active: false }], demoCategories);
  assert.deepEqual(grouped.map((section) => section.title), ['Outros produtos']);
  assert.equal(grouped[0].products[0].id, 101);
  assert.deepEqual(groupDemoCatalog([], demoCategories), []);
  assert.deepEqual(groupDemoCatalog([product], []).map((section) => section.title), ['Todos os produtos']);
  assert.deepEqual(groupDemoCatalog(demoProducts, demoCategories.map((category) => ({ ...category, active: false }))).map((section) => section.title), ['Todos os produtos']);
});
