// Somente memória. Este módulo não importa o cliente HTTP nem cria pedidos reais.
import { demoAdmin, demoOrders } from './demoModel.js';
import { orderStage, orderStages } from '../../frontend/src/components/orderPresentation.js';

const isPaid = (order) => ['paid', 'shipped'].includes(order.status);

export function ordersForDemoScenario(scenario) {
  const orders = structuredClone(demoOrders).filter(isPaid);
  if (scenario === 'vazio' || scenario === 'pagamento-recusado') return [];
  if (scenario === 'pago') return [{ ...orders[0], id: 1005, order_number: 'DEMO-APROVADO', created_at: '2026-10-06T11:00:00Z' }, ...orders];
  return orders;
}

export function demoOrderStatuses(order) {
  return isPaid(order) && !order.inventory_issue ? orderStages(order) : [];
}

export function createDemoOrderService(getOrders, commitOrders) {
  const fail = (message) => { throw Object.assign(new Error(message), { response: { data: { message } } }); };
  const currentOrder = (order) => {
    const current = getOrders().find((item) => item.id === order.id);
    if (!current) fail('Pedido fictício não encontrado.');
    if (orderStage(current) !== orderStage(order) || (current.fulfillment_revision || 0) !== (order.fulfillment_revision || 0)) fail('O pedido mudou. Atualize a lista antes de continuar.');
    return current;
  };
  const commitChange = (current, nextStage, trackingCode) => {
    if (orderStage(current) === nextStage && (current.tracking_code || null) === trackingCode) return current;
    const updated = {
      ...current, tracking_code: trackingCode, fulfillment_status: nextStage,
      fulfillment_revision: (current.fulfillment_revision || 0) + 1,
      fulfillment_history: [...(current.fulfillment_history || []), {
        from: orderStage(current), to: nextStage,
        actor: demoAdmin.name, at: new Date().toISOString(), action: 'status_change',
        previous_tracking_code: current.tracking_code || null,
      }],
    };
    commitOrders(getOrders().map((item) => item.id === current.id ? updated : item));
    return updated;
  };
  return {
    async get(path, { params = {} } = {}) {
      if (!['/orders', '/admin/orders'].includes(path)) fail('Consulta indisponível na demonstração.');
      let orders = structuredClone(getOrders()).filter(isPaid).sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (path === '/orders') return { data: { data: orders } };
      const search = (params.search || '').trim().toLocaleLowerCase('pt-BR');
      orders = orders.filter((order) => (!params.status || order.status === params.status)
        && (!params.fulfillment_stage || orderStage(order) === params.fulfillment_stage)
        && (!search || [order.order_number, order.user.name, order.user.email].some((value) => value.toLocaleLowerCase('pt-BR').includes(search))));
      const page = Math.max(1, Number(params.page) || 1);
      return { data: { data: orders.slice((page - 1) * 25, page * 25), meta: { current_page: page, last_page: Math.max(1, Math.ceil(orders.length / 25)), total: orders.length } } };
    },
    workflow: {
      simulated: true,
      statuses: demoOrderStatuses,
      async update(order, nextStage, trackingCode) {
        const current = currentOrder(order);
        if (!demoOrderStatuses(current).includes(nextStage)) fail('Status indisponível para este pedido.');
        const tracking = String(trackingCode || '').trim();
        if (tracking.length > 100) fail('Use até 100 caracteres no rastreio fictício.');
        const shipping = current.fulfillment_method !== 'pickup' && ['shipped', 'delivered'].includes(nextStage);
        return commitChange(current, nextStage, shipping ? tracking || null : null);
      },
    },
  };
}
