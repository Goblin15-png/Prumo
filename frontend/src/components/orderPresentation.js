export const paymentStatusLabels = {
  pending: 'Aguardando pagamento', paid: 'Pago', shipped: 'Pago · enviado', cancelled: 'Cancelado',
};

export const orderStageLabels = {
  awaiting_payment: 'Aguardando pagamento', confirmed: 'Aguardando preparo',
  preparing: 'Em preparação', shipped: 'A caminho', delivered: 'Entregue',
  ready_for_pickup: 'Pronto para retirada', collected: 'Retirado', cancelled: 'Cancelado',
};

export function orderStage(order) {
  if (order.status === 'cancelled') return 'cancelled';
  if (order.status === 'pending') return 'awaiting_payment';
  if (!['paid', 'shipped'].includes(order.status)) return null;
  // Usa a etapa operacional persistida e mantém compatibilidade com pedidos antigos.
  const stages = orderStages(order);
  if (stages.includes(order.fulfillment_status)) return order.fulfillment_status;
  return order.status === 'shipped' ? 'shipped' : 'confirmed';
}

export function orderStages(order) {
  return order.fulfillment_method === 'pickup'
    ? ['confirmed', 'preparing', 'ready_for_pickup', 'collected']
    : ['confirmed', 'preparing', 'shipped', 'delivered'];
}

export const orderCurrency = (value) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
