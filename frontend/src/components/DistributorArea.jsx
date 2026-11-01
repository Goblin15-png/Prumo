import React, { useEffect, useState } from 'react';
import { Package, CalendarDays, MessageCircle, ShoppingBag } from 'lucide-react';
import { distributorService, distributorSupportService } from '../services/distributorService';
import SupportPanel from './SupportPanel';

const input = 'mt-1 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm';
const emptyStock = { product_id: '', product_name: '', quantity: 0, minimum_quantity: 0 };
const emptyPlan = { product_id: '', product_name: '', quantity: 1, planned_date: '', notes: '' };

export default function DistributorArea({ user, service = distributorService, supportService = distributorSupportService }) {
  const [tab, setTab] = useState('inventory');
  const [data, setData] = useState({ inventory: [], plans: [], products: [] });
  const [stock, setStock] = useState(emptyStock);
  const [plan, setPlan] = useState(emptyPlan);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!user?.is_distributor) return;
    let active = true;
    setStatus('loading');
    service.workspace().then((result) => { if (active) { setData(result); setStatus('ready'); } })
      .catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [user?.id, user?.is_distributor, service, refresh]);

  if (!user?.is_distributor) return <p role="alert" className="p-8">Entre com uma conta de distribuidor para acessar esta área.</p>;

  const perform = async (operation, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setNotice(message); setRefresh((value) => value + 1); }
    catch (error) { setError(error.response?.data?.message || 'Não foi possível salvar. Confira os dados e tente novamente.'); }
    finally { setBusy(false); }
  };
  const remove = (kind, item) => {
    if (window.confirm(`Remover ${item.product_name} ${kind === 'inventory' ? 'do seu estoque' : 'do planejamento'}?`)) {
      perform(async () => { await service.remove(kind, item.id); if (kind === 'inventory' && stock.id === item.id) setStock(emptyStock); if (kind === 'plans' && plan.id === item.id) setPlan(emptyPlan); }, 'Registro removido.');
    }
  };
  const lowStock = data.inventory.filter((item) => Number(item.quantity) <= Number(item.minimum_quantity));
  const products = data.products || [];
  const selectedProduct = tab === 'inventory' ? stock.product_id : plan.product_id;
  const productAvailable = products.some((product) => String(product.id) === String(selectedProduct));
  const total = data.inventory.reduce((sum, item) => sum + Number(item.quantity), 0);

  return <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
    <div className="rounded-3xl bg-[#5E1A2B] p-6 text-white sm:p-8">
      <p className="text-xs uppercase tracking-widest text-white/70">Portal do distribuidor</p>
      <h1 className="mt-2 font-serif text-3xl font-bold">Seu negócio, bem cuidado.</h1>
      <p className="mt-2 text-sm text-white/80">Olá, {user.name?.split(' ')[0]}. Organize seu estoque, planeje reposições e converse com a loja.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[[Package, 'Unidades em estoque', total], [ShoppingBag, 'Itens para repor', lowStock.length], [CalendarDays, 'Compras planejadas', data.plans.length]].map(([Icon, label, value]) => <div key={label} className="rounded-2xl border border-line bg-surface p-5"><Icon className="mb-3 h-5 w-5 text-brand-ink" /><p className="text-sm text-ink-muted">{label}</p><strong className="mt-1 block text-2xl">{status === 'ready' ? value : '—'}</strong></div>)}
    </div>
    <nav aria-label="Área do distribuidor" className="flex gap-2 overflow-x-auto pb-1">
      {[[Package, 'inventory', 'Meu estoque'], [CalendarDays, 'plans', 'Próximas compras'], [ShoppingBag, 'lots', 'Comprar lotes'], [MessageCircle, 'support', 'Suporte']].map(([Icon, key, label]) => <button key={key} type="button" disabled={busy} aria-pressed={tab === key} onClick={() => { setTab(key); setError(''); setNotice(''); }} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${tab === key ? 'bg-brand-ink text-white' : 'border border-line bg-surface text-ink-muted'}`}><Icon className="h-4 w-4" />{label}</button>)}
    </nav>
    {error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-success-soft p-3 text-sm text-success-ink">{notice}</p>}
    {tab === 'support' ? <SupportPanel service={supportService} /> : tab === 'lots' ? <div className="rounded-3xl border border-line bg-surface p-7"><h2 className="font-serif text-xl font-bold text-brand-ink">Compras por lotes</h2><p className="mt-3 text-sm text-ink-muted">Nenhum lote disponível. A loja ainda precisa definir quantidades e preços para habilitar as compras.</p></div> : <>
      {status === 'loading' && <p role="status">Carregando seu espaço…</p>}
      {status === 'error' && <div role="alert" className="rounded-xl bg-danger-soft p-4 text-danger-ink">Não foi possível carregar seus registros. <button type="button" onClick={() => setRefresh((value) => value + 1)} className="underline">Tentar novamente</button></div>}
      {status === 'ready' && <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-serif text-xl font-bold text-brand-ink">{tab === 'inventory' ? 'Meu estoque' : 'Próximas compras'}</h2>
          <p className="text-sm text-ink-muted">{tab === 'inventory' ? 'Controle manual das suas unidades. Não altera o estoque da loja.' : 'Planejamento pessoal em unidades. Não reserva produtos nem cria pedidos ou cobranças.'}</p>
          {tab === 'inventory' && lowStock.length > 0 && <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning-ink">{lowStock.length} item(ns) no mínimo ou abaixo dele.</p>}
          {!data[tab].length && <p className="py-8 text-center text-sm text-ink-muted">{tab === 'inventory' ? 'Seu estoque está vazio. Adicione seu primeiro blend.' : 'Você ainda não planejou nenhuma compra.'}</p>}
          {data[tab].map((item) => <article key={item.id} className="rounded-2xl border border-line p-4">
            <div className="flex flex-wrap justify-between gap-2"><h3 className="break-words font-semibold">{item.product_name}</h3><span className="text-sm font-bold text-brand-ink">{item.quantity} unidades</span></div>
            {tab === 'inventory' ? <p className="mt-1 text-xs text-ink-muted">Estoque mínimo: {item.minimum_quantity} · {Number(item.quantity) <= Number(item.minimum_quantity) ? 'Repor estoque' : 'Estoque acima do mínimo'}</p> : <><p className="mt-1 text-xs text-ink-muted">Data planejada: {item.planned_date.split('-').reverse().join('/')}</p>{item.notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-muted">{item.notes}</p>}</>}
            <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold"><button type="button" disabled={busy} onClick={() => tab === 'inventory' ? setStock({ ...item, product_id: item.product_id || '' }) : setPlan({ ...item, product_id: item.product_id || '', notes: item.notes || '' })} className="text-brand-ink underline">Editar</button>
              {tab === 'inventory' && <button type="button" disabled={busy} onClick={() => { setPlan({ ...emptyPlan, product_id: item.product_id || '', product_name: item.product_name, quantity: Math.max(1, Number(item.minimum_quantity) - Number(item.quantity)) }); setTab('plans'); }} className="text-brand-ink underline">Planejar reposição</button>}
              <button type="button" disabled={busy} onClick={() => remove(tab, item)} className="text-danger-ink underline">Remover</button></div>
          </article>)}
        </div>
        <form className="space-y-4 rounded-3xl border border-line bg-surface p-5 sm:p-6" onSubmit={(event) => {
          event.preventDefault(); perform(async () => { await service.save(tab, tab === 'inventory' ? stock : plan); if (tab === 'inventory') setStock(emptyStock); else setPlan(emptyPlan); }, 'Registro salvo.');
        }}>
          <h3 className="font-semibold">{(tab === 'inventory' ? stock.id : plan.id) ? 'Editar registro' : tab === 'inventory' ? 'Adicionar ao estoque' : 'Planejar compra'}</h3>
          <fieldset disabled={busy} className="space-y-4">
            <label className="block text-sm">Blend<select className={input} required value={selectedProduct || ''} onChange={(event) => tab === 'inventory' ? setStock({ ...stock, product_id: event.target.value }) : setPlan({ ...plan, product_id: event.target.value })}>
              <option value="" disabled>Selecione um blend</option>
              {selectedProduct && !productAvailable && <option value={selectedProduct} disabled>Blend indisponível — selecione outro</option>}
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select></label>
            {!products.length && <p role="status" className="text-sm text-ink-muted">Nenhum blend ativo cadastrado pela loja. Aguarde a disponibilização do catálogo.</p>}
            {(tab === 'inventory' ? stock.id : plan.id) && !productAvailable && <p className="text-sm text-warning-ink">Selecione um blend ativo para vincular este registro. As informações anteriores foram preservadas.</p>}
            <label className="block text-sm">Quantidade em unidades<input className={input} type="number" min={tab === 'inventory' ? 0 : 1} max={1000000} step={1} required value={tab === 'inventory' ? stock.quantity : plan.quantity} onChange={(event) => tab === 'inventory' ? setStock({ ...stock, quantity: event.target.value }) : setPlan({ ...plan, quantity: event.target.value })} /></label>
            {tab === 'inventory' ? <label className="block text-sm">Estoque mínimo<input className={input} type="number" min={0} max={1000000} step={1} required value={stock.minimum_quantity} onChange={(event) => setStock({ ...stock, minimum_quantity: event.target.value })} /></label> : <>
              <label className="block text-sm">Data planejada<input className={input} type="date" required value={plan.planned_date} onChange={(event) => setPlan({ ...plan, planned_date: event.target.value })} /></label>
              <label className="block text-sm">Observações<textarea className={input} maxLength={1000} rows={3} value={plan.notes} onChange={(event) => setPlan({ ...plan, notes: event.target.value })} /></label>
            </>}
            <button className="w-full rounded-xl bg-brand-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !productAvailable}>{busy ? 'Salvando…' : 'Salvar registro'}</button>
            {(tab === 'inventory' ? stock.id : plan.id) && <button type="button" onClick={() => tab === 'inventory' ? setStock(emptyStock) : setPlan(emptyPlan)} className="w-full text-sm text-ink-muted">Cancelar edição</button>}
          </fieldset>
        </form>
      </div>}
    </>}
  </section>;
}
