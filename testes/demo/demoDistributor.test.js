import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoDistributorWorkspace } from './demoDistributorService.js';

test('estoque e planejamento permanecem separados e são descartáveis', async () => {
  const { service } = createDemoDistributorWorkspace({ empty: true });
  const { item } = await service.save('inventory', { product_id: 101, quantity: 3, minimum_quantity: 5 });
  await service.save('plans', { product_id: 103, quantity: 24, planned_date: '2026-11-15' });
  await service.save('inventory', { ...item, quantity: 8 });
  let result = await service.workspace();
  assert.equal(result.inventory[0].quantity, 8);
  assert.equal(result.plans[0].quantity, 24);
  result.inventory[0].quantity = 999;
  assert.equal((await service.workspace()).inventory[0].quantity, 8);
  await service.remove('inventory', item.id);
  assert.equal((await service.workspace()).inventory.length, 0);
  assert.equal((await service.workspace()).plans.length, 1);
  assert.equal((await createDemoDistributorWorkspace({ empty: true }).service.workspace()).plans.length, 0);
});

test('chamado atravessa distribuidor e admin; encerramento bloqueia mensagens', async () => {
  const { distributorSupport: customer, adminSupport: admin } = createDemoDistributorWorkspace({ empty: true });
  const { id } = await customer.create({ subject: 'Reposição', body: 'Dúvida fictícia' });
  assert.equal((await admin.list('open')).data[0].id, id);
  await admin.reply(id, 'Resposta fictícia');
  assert.equal((await customer.show(id)).messages[1].from_admin, true);
  await admin.status(id, 'closed');
  assert.equal((await customer.list('open')).data.length, 0);
  await assert.rejects(customer.reply(id, 'Nova mensagem'));
  await assert.rejects(customer.status(id, 'open'));
  await admin.status(id, 'open');
  await customer.reply(id, 'Obrigada');
  assert.equal((await admin.show(id)).messages.length, 3);
});

test('falha simulada não produz sucesso', async () => {
  const { service, distributorSupport } = createDemoDistributorWorkspace({ error: true });
  await assert.rejects(service.workspace());
  await assert.rejects(distributorSupport.create({ subject: 'Teste', body: 'Teste' }));
});


test('dropdown acompanha os blends cadastrados e rejeita itens ausentes ou inativos', async () => {
  let products = [{ id: 21, name: 'Blend criado no painel', is_active: true }];
  const { service } = createDemoDistributorWorkspace({ empty: true, getProducts: () => products });
  assert.deepEqual((await service.workspace()).products, [{ id: 21, name: 'Blend criado no painel' }]);
  const result = await service.save('inventory', { product_id: 21, product_name: 'Nome adulterado', quantity: 2, minimum_quantity: 1 });
  assert.equal(result.item.product_name, 'Blend criado no painel');
  products = [{ id: 22, name: 'Novo blend' }, { id: 21, name: 'Blend anterior', is_active: false }];
  assert.deepEqual((await service.workspace()).products, [{ id: 22, name: 'Novo blend' }]);
  await assert.rejects(service.save('plans', { product_id: 21, quantity: 1 }));
  await assert.rejects(service.save('inventory', { product_id: 999, quantity: 1 }));
  products = [];
  assert.deepEqual((await service.workspace()).products, []);
  assert.equal((await service.workspace()).inventory.length, 1);
});
