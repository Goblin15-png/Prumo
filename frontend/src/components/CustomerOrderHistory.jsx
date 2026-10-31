import React, { useEffect, useState } from 'react';
import OrderProgress from './OrderProgress';
import { orderCurrency } from './orderPresentation';

export default function CustomerOrderHistory({ service, returnNotice = '' }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    service.get('/orders')
      .then(({ data }) => { if (active) setOrders(data.data || []); })
      .catch(() => { if (active) { setOrders([]); setError('Não foi possível carregar seus pedidos.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [service, refresh]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold text-brand-ink">Meus pedidos</h2>
          <p className="mt-1 text-xs text-ink-soft">Os pedidos aparecem após a confirmação do pagamento. Acompanhe a preparação, entrega ou retirada por aqui.</p>
        </div>
        <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)} className="rounded-lg border border-line-strong px-3 py-2 text-xs font-semibold disabled:opacity-50">{loading ? 'Atualizando…' : 'Atualizar pedidos'}</button>
      </div>

      {returnNotice && <p role="status" className="rounded-xl border border-info-line bg-info-soft p-3 text-sm text-info-ink">{returnNotice}</p>}
      {error && <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>}
      {loading && <p className="text-sm text-ink-soft">Carregando pedidos…</p>}
      {!loading && !error && orders.length === 0 && <p className="rounded-xl bg-surface-muted p-4 text-sm text-ink-soft">Você ainda não tem pedidos.</p>}

      <div className="space-y-3">
        {orders.map((order) => (
          <article key={order.order_number} aria-label={`Pedido ${order.order_number}`} className="min-w-0 break-words rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-ink-strong">Pedido {order.order_number}</h3>
                <p className="mt-1 text-xs text-ink-soft">{new Date(order.created_at).toLocaleDateString('pt-BR')} · {order.shipping_method}</p>
              </div>
            </div>

            <OrderProgress order={order} />

            {order.fulfillment_method === 'pickup' && <p className="mt-3 text-xs text-ink-muted">Nome para retirada: <strong>{order.pickup_contact_name || 'Não informado'}</strong></p>}

            <ul className="mt-3 space-y-1 text-xs text-ink-muted">
              {order.items.map((item, index) => <li key={`${item.product_name}-${index}`} className="flex flex-wrap justify-between gap-2"><span>{item.quantity}× {item.product_name}</span>{item.subtotal != null && <span>{orderCurrency(item.subtotal)}</span>}</li>)}
            </ul>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line-muted pt-3">
              <span className="text-sm font-bold text-brand-ink">Total: {orderCurrency(order.total_price)}</span>
              {order.tracking_code && <span className="text-xs text-ink-muted">Rastreio: <strong>{order.tracking_code}</strong></span>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
