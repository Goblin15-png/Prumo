import React from 'react';
import { orderStage, orderStageLabels } from './orderPresentation';

const descriptions = {
  awaiting_payment: 'A preparação começa após a confirmação do pagamento.',
  confirmed: 'Pagamento confirmado. Aguarde o início da preparação pela loja.',
  preparing: 'A loja está preparando os produtos do seu pedido.',
  shipped: 'Seu pedido foi enviado e está a caminho do endereço de entrega.',
  delivered: 'A loja marcou este pedido como entregue.',
  ready_for_pickup: 'A loja informou que seu pedido está pronto para retirada.',
  collected: 'A loja marcou este pedido como retirado.',
  cancelled: 'Este pedido foi cancelado.',
};

export default function OrderProgress({ order }) {
  const stage = orderStage(order);
  return <div role="group" aria-label="Andamento do pedido" className="mt-4 space-y-2 rounded-xl bg-surface-muted p-3 text-xs">
    <p className="font-semibold text-brand-ink">{orderStageLabels[stage] || 'Andamento indisponível'}</p>
    <p className="text-ink-muted">{descriptions[stage] || 'Atualize os pedidos para consultar o andamento.'}</p>
  </div>;
}
