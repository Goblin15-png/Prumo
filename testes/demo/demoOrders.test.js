import test from 'node:test';
import assert from 'node:assert/strict';
import { demoOrders } from './demoModel.js';
import { createDemoOrderService, demoOrderStatuses, ordersForDemoScenario } from './demoOrderService.js';
import { orderStage } from '../../frontend/src/components/orderPresentation.js';

function setup(seed = demoOrders) {
  let orders = structuredClone(seed);
  const service = createDemoOrderService(() => orders, (next) => { orders = next; });
  return { service, order: (id) => structuredClone(orders.find((item) => item.id === id)) };
}

test('andamento preserva os estados confirmados pelo backend e não infere pagamento', () => {
  assert.equal(orderStage({ status: 'paid' }), 'confirmed');
  assert.equal(orderStage({ status: 'shipped' }), 'shipped');
  assert.equal(orderStage({ status: 'pending', fulfillment_status: 'delivered' }), 'awaiting_payment');
  assert.equal(orderStage({ status: 'cancelled', fulfillment_status: 'shipped' }), 'cancelled');
  assert.equal(orderStage({ status: 'unknown' }), null);
});

test('qualquer status operacional pode ser selecionado diretamente sem motivo nem alterar pagamento', async () => {
  const { service, order } = setup();
  assert.deepEqual(demoOrderStatuses(order(1001)), ['confirmed', 'preparing', 'shipped', 'delivered']);
  await service.workflow.update(order(1001), 'delivered');
  assert.equal(orderStage(order(1001)), 'delivered');
  assert.equal(order(1001).fulfillment_history.length, 1);
  assert.equal(order(1001).fulfillment_history[0].from, 'confirmed');
  assert.equal(order(1001).fulfillment_history[0].to, 'delivered');
  await service.workflow.update(order(1001), 'confirmed');
  assert.equal(orderStage(order(1001)), 'confirmed');
  assert.equal(order(1001).payment_status, 'approved');
  assert.equal(order(1001).status, 'paid');
  assert.ok(order(1001).fulfillment_history[1].actor);
  assert.ok(order(1001).fulfillment_history[1].at);
  assert.equal(Object.hasOwn(order(1001).fulfillment_history[1], 'reason'), false);
  assert.equal(demoOrders[0].fulfillment_status, 'confirmed');
  assert.equal(demoOrders[0].fulfillment_history, undefined);
});

test('rastreio opcional na demo, retorno limpa o código e preserva histórico e revisão', async () => {
  const { service, order } = setup();
  await service.workflow.update(order(1001), 'shipped');
  assert.equal(order(1001).tracking_code, null);
  await assert.rejects(service.workflow.update(order(1001), 'shipped', 'a'.repeat(101)));
  await service.workflow.update(order(1001), 'shipped', ' RASTREIO-FICTICIO ');
  assert.equal(order(1001).tracking_code, 'RASTREIO-FICTICIO');
  const stale = order(1001);
  await service.workflow.update(order(1001), 'preparing');
  assert.equal(order(1001).tracking_code, null);
  assert.equal(order(1001).fulfillment_history.at(-1).previous_tracking_code, 'RASTREIO-FICTICIO');
  await service.workflow.update(order(1001), 'shipped');
  await assert.rejects(service.workflow.update(stale, 'delivered'), /O pedido mudou/);
  const revision = order(1001).fulfillment_revision;
  await service.workflow.update(order(1001), 'shipped');
  assert.equal(order(1001).fulfillment_revision, revision);
});

test('retirada permite definir ou voltar diretamente e rejeita estados de entrega e financeiros', async () => {
  const { service, order } = setup();
  assert.deepEqual(demoOrderStatuses(order(1003)), ['confirmed', 'preparing', 'ready_for_pickup', 'collected']);
  await service.workflow.update(order(1003), 'collected');
  await service.workflow.update(order(1003), 'preparing');
  assert.equal(orderStage(order(1003)), 'preparing');
  await service.workflow.update(order(1003), 'ready_for_pickup');
  await service.workflow.update(order(1003), 'confirmed');
  await assert.rejects(service.workflow.update(order(1003), 'shipped', 'FICTICIO'));
  await assert.rejects(service.workflow.update(order(1003), 'paid'));
  assert.equal(order(1003).payment_status, 'approved');
  assert.equal(order(1003).shipping_address, null);
});

test('pendentes ou cancelados ficam fora das consultas e não podem ser gerenciados', async () => {
  const { service, order } = setup([...demoOrders, { ...demoOrders[0], id: 2000, status: 'cancelled' }]);
  assert.deepEqual(demoOrderStatuses(order(1004)), []);
  assert.deepEqual(demoOrderStatuses(order(2000)), []);
  assert.deepEqual(demoOrderStatuses({ ...order(1001), inventory_issue: true }), []);
  await assert.rejects(service.workflow.update(order(1004), 'preparing'));
  await assert.rejects(service.workflow.update(order(2000), 'preparing'));
  assert.equal((await service.get('/orders')).data.data.length, 3);
  assert.equal((await service.get('/admin/orders')).data.meta.total, 3);
  assert.equal(order(1004).status, 'pending');
  assert.equal(ordersForDemoScenario('normal').length, 3);
  assert.deepEqual(ordersForDemoScenario('pagamento-recusado'), []);
  assert.deepEqual(ordersForDemoScenario('vazio'), []);
});

test('status salvo aparece para o cliente e nos filtros da loja', async () => {
  const { service, order } = setup();
  await service.workflow.update(order(1001), 'delivered');
  assert.equal((await service.get('/orders')).data.data.find((item) => item.id === 1001).fulfillment_status, 'delivered');
  const filtered = await service.get('/admin/orders', { params: { search: 'demo-1001', fulfillment_stage: 'delivered' } });
  assert.equal(filtered.data.meta.total, 1);
  assert.equal(filtered.data.data[0].id, 1001);
  const empty = await service.get('/admin/orders', { params: { fulfillment_stage: 'collected' } });
  assert.deepEqual(empty.data.data, []);
  assert.equal(empty.data.meta.last_page, 1);
});
