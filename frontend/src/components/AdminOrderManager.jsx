import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Truck } from 'lucide-react';
import OrderProgress from './OrderProgress';
import { orderCurrency, orderStage, orderStageLabels, paymentStatusLabels } from './orderPresentation';

const paymentMethods = { pix: 'Pix', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', mercado_pago: 'Mercado Pago' };
const providerPaymentLabels = { approved: 'Confirmado', pending: 'Pendente', in_process: 'Em análise', rejected: 'Recusado', cancelled: 'Cancelado', refunded: 'Estornado', charged_back: 'Contestado' };
const refreshIntervalMs = 15_000;

export default function AdminOrderManager({ service, canShip = false, canUpdateFulfillment = false, workflow = null }) {
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [activeFilters, setActiveFilters] = useState({ search: '', status: '' });
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [savingOrder, setSavingOrder] = useState(null);
  const [trackingByOrder, setTrackingByOrder] = useState({});
  const [stageByOrder, setStageByOrder] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const requestState = useRef({ sequence: 0, inFlight: false, authenticationFailed: false });
  const live = useRef(null);
  const hasDrafts = Object.keys(stageByOrder).length > 0 || Object.keys(trackingByOrder).length > 0;

  const loadOrders = async (page = 1, applied = activeFilters, { background = false } = {}) => {
    if (background && (requestState.current.inFlight || requestState.current.authenticationFailed || live.current?.paused)) return;
    const sequence = ++requestState.current.sequence;
    requestState.current.inFlight = true;
    if (!background) {
      setLoading(true);
      setError('');
    }
    try {
      let requestedPage = page;
      while (true) {
        const { data } = await service.get('/admin/orders', { params: { ...applied, page: requestedPage } });
        // An older request must not replace a newer filter, page or unsaved edit.
        if (sequence !== requestState.current.sequence || (background && live.current?.paused)) return;
        const lastPage = Math.max(1, data.meta?.last_page || 1);
        if (requestedPage > lastPage) {
          requestedPage = lastPage;
          continue;
        }
        requestState.current.authenticationFailed = false;
        setError('');
        setActiveFilters(applied);
        setPagination(data.meta || { current_page: 1, last_page: 1, total: data.data?.length || 0 });
        setOrders(data.data || []);
        break;
      }
    } catch (requestError) {
      if (sequence !== requestState.current.sequence || (background && live.current?.paused)) return;
      const authenticationFailed = [401, 403].includes(requestError.response?.status);
      requestState.current.authenticationFailed = authenticationFailed;
      setError(authenticationFailed
        ? 'Seu acesso aos pedidos expirou ou não está disponível. Entre novamente no painel.'
        : 'Não foi possível carregar os pedidos.');
    } finally {
      if (sequence === requestState.current.sequence) {
        requestState.current.inFlight = false;
        if (!background) setLoading(false);
      }
    }
  };

  live.current = { loadOrders, page: pagination.current_page, filters: activeFilters, paused: savingOrder !== null || hasDrafts };

  useEffect(() => {
    live.current.loadOrders();
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const current = live.current;
      current.loadOrders(current.page, current.filters, { background: true });
    };
    const interval = window.setInterval(refresh, refreshIntervalMs);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      requestState.current.sequence += 1;
      requestState.current.inFlight = false;
    };
  }, [service]);

  const editDraft = (setter, order, value, original) => {
    // Pause immediately, including when an automatic request is already in flight.
    live.current.paused = true;
    setter((current) => {
      const next = { ...current };
      if (value === original) delete next[order.id];
      else next[order.id] = value;
      return next;
    });
  };

  const saveTracking = async (order) => {
    if (order.status === 'paid' && !window.confirm(`Pedido ${order.order_number}: salvar o rastreio também marca o pedido como A caminho. Confirma que ele já saiu para entrega?`)) return;
    setSaved('');
    setError('');
    setSavingOrder(order.id);
    try {
      await service.patch(`/admin/orders/${order.id}/shipment`, { tracking_code: trackingByOrder[order.id] ?? order.tracking_code ?? '' });
      setSaved(`Rastreio do pedido ${order.order_number} salvo.`);
      setTrackingByOrder((current) => { const next = { ...current }; delete next[order.id]; return next; });
      await loadOrders(pagination.current_page);
    } catch (requestError) {
      setError(requestError.response?.data?.errors?.tracking_code?.[0]
        || requestError.response?.data?.errors?.order?.[0]
        || 'Não foi possível salvar o rastreio.');
    } finally { setSavingOrder(null); }
  };

  const saveStage = async (order) => {
    const nextStage = stageByOrder[order.id] ?? orderStage(order);
    if (!nextStage) return;
    setSaved('');
    setError('');
    setSavingOrder(order.id);
    try {
      await workflow.update(order, nextStage, trackingByOrder[order.id] ?? order.tracking_code ?? '');
      setSaved(`Pedido ${order.order_number}: ${orderStageLabels[nextStage]}.${workflow.simulated ? ' Status salvo apenas na demonstração.' : ' Status salvo.'}`);
      setStageByOrder((current) => { const next = { ...current }; delete next[order.id]; return next; });
      setTrackingByOrder((current) => { const next = { ...current }; delete next[order.id]; return next; });
      await loadOrders(pagination.current_page);
    } catch (requestError) {
      if (requestError.response?.status === 409) {
        setStageByOrder((current) => { const next = { ...current }; delete next[order.id]; return next; });
        setTrackingByOrder((current) => { const next = { ...current }; delete next[order.id]; return next; });
        await loadOrders(pagination.current_page);
      }
      setError(requestError.response?.data?.errors?.order?.[0]
        || requestError.response?.data?.errors?.fulfillment_status?.[0]
        || requestError.response?.data?.errors?.tracking_code?.[0]
        || requestError.response?.data?.message || 'Não foi possível atualizar o status do pedido.');
    } finally { setSavingOrder(null); }
  };


  return (
    <section id="admin-pedidos" className="scroll-mt-6 space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold text-brand-ink">Pedidos e entregas</h2>
          <p className="mt-1 text-xs text-ink-soft">Veja os itens e quantidades para preparar a encomenda e acompanhe o status de entrega ou retirada.</p>
          <p className="mt-1 text-xs text-ink-soft">{hasDrafts || savingOrder !== null ? 'Atualização automática pausada enquanto você edita um pedido.' : 'Atualização automática a cada 15 segundos enquanto esta aba estiver aberta.'}</p>
          {workflow?.simulated && <p className="mt-1 text-xs font-semibold text-warning-ink">Demonstração: alterações em memória, sem pedidos ou notificações reais.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {hasDrafts && <button type="button" disabled={loading || savingOrder !== null} onClick={() => {
            setStageByOrder({});
            setTrackingByOrder({});
            setSaved('');
            loadOrders(pagination.current_page);
          }} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-secondary disabled:opacity-50">Descartar alterações</button>}
          <button type="button" onClick={() => loadOrders(pagination.current_page)} disabled={loading || savingOrder !== null} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-secondary disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); loadOrders(1, filters); }}>
        <input aria-label="Buscar pedidos" maxLength={120} value={filters.search} onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))} placeholder="Número do pedido, nome ou email" className="min-w-0 flex-1 rounded-lg border border-line-strong px-3 py-2 text-sm" />
        {!workflow && <select aria-label="Situação do pedido" value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))} className="min-w-0 rounded-lg border border-line-strong px-3 py-2 text-sm"><option value="">Todos os pedidos pagos</option>{Object.entries(paymentStatusLabels).filter(([value]) => ['paid', 'shipped'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
        {workflow && <select aria-label="Etapa de preparo e entrega" value={filters.fulfillment_stage || ''} onChange={(e) => setFilters((current) => ({ ...current, fulfillment_stage: e.target.value }))} className="min-w-0 rounded-lg border border-line-strong px-3 py-2 text-sm"><option value="">Todos os status</option>{Object.entries(orderStageLabels).filter(([value]) => !['awaiting_payment', 'cancelled'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
        <button type="submit" disabled={loading} className="rounded-lg bg-[#5E1A2B] px-4 py-2 text-sm text-white disabled:opacity-50">Filtrar pedidos</button>
      </form>
      <p className="text-xs text-ink-soft">{pagination.total} pedidos encontrados</p>
      {error && <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>}
      {saved && <p role="status" className="rounded-lg border border-success-line bg-success-soft p-3 text-sm text-success-ink">{saved}</p>}
      {loading && <p className="text-sm text-ink-soft">Carregando pedidos…</p>}
      {!loading && !error && orders.length === 0 && <p className="rounded-xl bg-surface-muted p-4 text-sm text-ink-soft">Nenhum pedido encontrado com estes filtros.</p>}

      <div className="space-y-3">
        {orders.map((order) => (
          <article key={order.id} aria-label={`Gerenciar pedido ${order.order_number}`} className="min-w-0 break-words rounded-2xl border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-ink-strong">{order.order_number}</h3>
                <p className="mt-1 text-xs text-ink-muted">{order.user?.name} · {order.user?.email}</p>
                <p className="text-xs text-ink-soft">{new Date(order.created_at).toLocaleString('pt-BR')}</p>
              </div>
              <div className="text-right text-xs">
                <span className="block font-semibold text-ink">{workflow && order.status === 'shipped' ? 'Pago' : paymentStatusLabels[order.status] || order.status}</span>
                <span className="text-ink-soft">Pagamento: {providerPaymentLabels[order.payment_status] || order.payment_status || '—'}{order.payment_method ? ` · ${paymentMethods[order.payment_method] || order.payment_method}` : ''}</span>
                <span className="block font-bold text-brand-ink">{orderCurrency(order.total_price)}</span>
              </div>
            </div>

            <OrderProgress order={order} />

            {order.inventory_issue && <p className="mt-3 rounded-lg border border-danger-line bg-danger-soft p-2 text-xs font-semibold text-danger-ink">Pagamento confirmado sem estoque reservado. Revise antes de separar o pedido.</p>}

            <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <p className="mb-1 font-bold text-ink-secondary">Itens</p>
                <ul className="space-y-1 text-ink-muted">{order.items.map((item, index) => <li key={`${item.product_name}-${index}`}><strong>{item.quantity}× {item.product_name}</strong>{item.unit_price != null && <span className="block">{orderCurrency(item.unit_price)} por unidade · {orderCurrency(item.subtotal)}</span>}</li>)}</ul>
              </div>
              <div>
                <p className="mb-1 font-bold text-ink-secondary">{order.shipping_method || 'Entrega'}</p>
                {order.fulfillment_method === 'pickup' ? <>
                  <p className="text-ink-muted">Nome para retirada: <strong>{order.pickup_contact_name || 'Não informado'}</strong></p>
                  <p className="text-ink-muted">Retirada em loja. Endereço e horários ainda precisam ser definidos.</p>
                </> : <>
                <p className="text-ink-muted">{order.shipping_address?.recipient_name} · {order.shipping_address?.phone}</p>
                <p className="text-ink-muted">{order.shipping_address?.street}, {order.shipping_address?.number}{order.shipping_address?.complement ? ` · ${order.shipping_address.complement}` : ''}</p>
                <p className="text-ink-muted">{order.shipping_address?.neighborhood} · {order.shipping_address?.city}/{order.shipping_address?.state} · CEP {order.shipping_address?.postal_code}</p>
                </>}
              </div>
            </div>

            {workflow && canUpdateFulfillment && workflow.statuses(order).length > 0 && <div className="mt-4 space-y-3 border-t border-line-muted pt-3">
              <label className="block text-xs font-semibold text-ink-secondary">Status do pedido
                <select aria-label={`Status do pedido ${order.order_number}`} value={stageByOrder[order.id] ?? orderStage(order)} onChange={(event) => editDraft(setStageByOrder, order, event.target.value, orderStage(order))} className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm">
                  {workflow.statuses(order).map((stage) => <option key={stage} value={stage}>{orderStageLabels[stage]}</option>)}
                </select>
              </label>
              {order.fulfillment_method !== 'pickup' && ['shipped', 'delivered'].includes(stageByOrder[order.id] ?? orderStage(order)) && <label className="block text-xs font-semibold text-ink-secondary">Código de rastreio{workflow.simulated ? ' fictício' : ''} (se houver)
                <input aria-label={`Código de rastreio do pedido ${order.order_number}`} maxLength={100} value={trackingByOrder[order.id] ?? order.tracking_code ?? ''} onChange={(event) => editDraft(setTrackingByOrder, order, event.target.value, order.tracking_code ?? '')} className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm" />
              </label>}
              <button type="button" onClick={() => saveStage(order)} disabled={savingOrder !== null || loading} className="rounded-lg bg-[#5E1A2B] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{savingOrder === order.id ? 'Salvando…' : 'Salvar status'}</button>
            </div>}
            {workflow && order.fulfillment_history?.length > 0 && <details className="mt-3 rounded-xl bg-surface-muted p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-ink-secondary">{workflow.simulated ? 'Histórico desta simulação' : 'Histórico de alterações'}</summary>
              <ol className="mt-3 space-y-3">{order.fulfillment_history.map((entry, index) => <li key={index} className="border-t border-line pt-2">
                <p className="font-semibold">Status: {orderStageLabels[entry.from]} → {orderStageLabels[entry.to]}</p>
                <p className="text-ink-soft">{entry.actor} · {new Date(entry.at).toLocaleString('pt-BR')}</p>
                {entry.previous_tracking_code && <p className="break-all text-ink-soft">Rastreio anterior: {entry.previous_tracking_code}</p>}
              </li>)}</ol>
            </details>}
            {order.tracking_code && <p className="mt-3 break-all text-xs text-ink-muted">Rastreio: <strong>{order.tracking_code}</strong></p>}

            {!workflow && canShip && ['paid', 'shipped'].includes(order.status) && (
              <div className="mt-4 flex flex-col gap-2 border-t border-line-muted pt-3 sm:flex-row">
                <input
                  aria-label={`Código de rastreio do pedido ${order.order_number}`}
                  value={trackingByOrder[order.id] ?? order.tracking_code ?? ''}
                  onChange={(event) => editDraft(setTrackingByOrder, order, event.target.value, order.tracking_code ?? '')}
                  maxLength={100}
                  placeholder="Código de rastreio"
                  className="min-w-0 flex-1 rounded-lg border border-line-strong px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-ink"
                />
                {order.status === 'paid' && <span className="text-xs text-ink-soft">Salvar o rastreio também marca este pedido como A caminho.</span>}
                <button type="button" onClick={() => saveTracking(order)} disabled={savingOrder !== null} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#5E1A2B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4A1422]">
                  <Truck className="h-3.5 w-3.5" /> {savingOrder === order.id ? 'Salvando…' : 'Salvar rastreio'}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {pagination.last_page > 1 && <nav aria-label="Paginação dos pedidos" className="flex items-center justify-between gap-3 text-xs">
        <button type="button" disabled={loading || pagination.current_page <= 1} onClick={() => loadOrders(pagination.current_page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Anterior</button>
        <span>Página {pagination.current_page} de {pagination.last_page}</span>
        <button type="button" disabled={loading || pagination.current_page >= pagination.last_page} onClick={() => loadOrders(pagination.current_page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Próxima</button>
      </nav>}
    </section>
  );
}
