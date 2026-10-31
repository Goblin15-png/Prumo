import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, CreditCard, Minus, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import DemoCatalog from './DemoCatalog';
import DemoCheckout from './DemoCheckout';
import DemoCategoryManager from './DemoCategoryManager';
import DemoProductManager from './DemoProductManager';
import AdminAudienceReport from '../../frontend/src/components/AdminAudienceReport';
import AdminOrderManager from '../../frontend/src/components/AdminOrderManager';
import CustomerOrderHistory from '../../frontend/src/components/CustomerOrderHistory';
import { createDemoOrderService, ordersForDemoScenario } from './demoOrderService';
import ProductCard from '../../frontend/src/components/ProductCard';
import ProductModal from '../../frontend/src/components/ProductModal';
import ThemeToggle from '../../frontend/src/components/ThemeToggle';
import {
  applyScenario, cartTotal, currency, demoAddress, demoAdmin, demoCategories, demoCustomer,
  demoAudienceMetrics, demoProducts, resolveDemoParams, updateCart,
} from './demoModel';

const menuItems = [
  ['inicio', 'Início'], ['favoritos', 'Favoritos'], ['carrinho', 'Sacola'],
  ['checkout', 'Checkout'], ['conta', 'Minha conta'], ['pedidos', 'Pedidos'], ['admin', 'Admin simulado'],
];
const scenarioNames = {
  normal: 'Loja com produtos', vazio: 'Catálogo vazio', 'sem-estoque': 'Sem estoque',
  'pagamento-recusado': 'Pagamento recusado', pago: 'Pagamento aprovado',
};
const buttonClass = 'rounded-xl bg-[#5E1A2B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4A1422] disabled:cursor-not-allowed disabled:opacity-40';
const fieldClass = 'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-brand-ink';

function Panel({ title, children, actions }) {
  return <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-sm">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl font-bold text-brand-ink">{title}</h2>{actions}</div>
    {children}
  </section>;
}
function EmptyState({ children }) {
  return <div className="rounded-xl border border-dashed border-line-strong bg-surface-muted p-8 text-center text-sm text-ink-muted">{children}</div>;
}

export default function DemoStudio({ standalone = false }) {
  const [route, setRoute] = useState(() => resolveDemoParams(window.location.search));
  const [products, setProducts] = useState(demoProducts);
  const [categories, setCategories] = useState(demoCategories);
  const [cart, setCart] = useState(() => ['vazio', 'sem-estoque'].includes(route.scenario) ? [] : [{ ...demoProducts[0], quantity: 1 }]);
  const [orders, setOrders] = useState(() => ordersForDemoScenario(route.scenario));
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const orderService = useMemo(() => createDemoOrderService(() => ordersRef.current, (next) => {
    ordersRef.current = next;
    setOrders(next);
  }), []);
  const [favorites, setFavorites] = useState([101, 105]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [search, setSearch] = useState('');

  const { view, persona, scenario } = route;
  const visibleProducts = useMemo(() => applyScenario(products.filter((product) => product.is_active !== false), scenario), [products, scenario]);
  const user = persona === 'admin' ? demoAdmin : persona === 'cliente' ? demoCustomer : null;

  const setParams = (next) => {
    const merged = { ...route, ...next };
    const qs = new URLSearchParams({ view: merged.view, persona: merged.persona, scenario: merged.scenario });
    window.history.pushState({}, '', `/?${qs}`);
    setRoute(merged);
  };

  useEffect(() => {
    const onBack = () => setRoute(resolveDemoParams(window.location.search));
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, []);

  const changeScenario = (nextScenario) => {
    setParams({ scenario: nextScenario });
    setCart(nextScenario === 'vazio' || nextScenario === 'sem-estoque' ? [] : [{ ...demoProducts[0], quantity: 1 }]);
    setProducts(demoProducts);
    setCategories(demoCategories);
    setOrders(ordersForDemoScenario(nextScenario));
    setSelectedProduct(null);
    setSearch('');
  };
  const addToCart = (product, quantity = 1) => {
    setCart((items) => updateCart(items, product, quantity));
    setParams({ view: 'carrinho' });
  };
  const toggleFavorite = (id) => setFavorites((items) => items.includes(id) ? items.filter((x) => x !== id) : [...items, id]);

  return <div className="min-h-screen bg-canvas font-sans text-ink">
    <header className="bg-[#5E1A2B] px-4 py-4 text-white sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div><p className="font-serif text-2xl font-bold tracking-wide">PRUMA ESSENTIAL</p><p className="text-xs text-stone-200">Laboratório visual · dados inteiramente fictícios</p></div>
        <div className="flex items-center gap-3"><span className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold">Somente Vite local · Sem APIs reais</span><ThemeToggle /></div>
      </div>
    </header>

    <div className="border-b border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning-ink sm:px-8">
      <div className="mx-auto max-w-7xl"><strong>Demonstração isolada:</strong> nada aqui autentica pessoas, grava pedidos, calcula fretes reais ou realiza cobranças. O painel administrativo desta página também é simulado.</div>
    </div>

    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-8">
      <Panel title="Controles de teste" actions={!standalone && <a className="text-xs font-semibold text-brand-ink underline" href="/">Voltar para a loja real</a>}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs font-semibold text-ink-muted">Perfil simulado
            <select aria-label="Perfil simulado" className={`${fieldClass} mt-1`} value={persona} onChange={(e) => setParams({ persona: e.target.value })}>
              <option value="visitante">Visitante (sem conta)</option><option value="cliente">Cliente fictício</option><option value="admin">Administrador fictício</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-ink-muted">Cenário
            <select aria-label="Cenário de demonstração" className={`${fieldClass} mt-1`} value={scenario} onChange={(e) => changeScenario(e.target.value)}>
              {Object.entries(scenarioNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <div className="self-end text-xs text-ink-soft">Link direto: <code className="break-all">/?view={view}&amp;scenario={scenario}</code></div>
        </div>
      </Panel>

      <nav aria-label="Páginas para testar" className="flex flex-wrap gap-2">
        {menuItems.map(([key, name]) => <button key={key} type="button" onClick={() => { setSearch(''); setParams({ view: key }); }} aria-current={view === key ? 'page' : undefined} className={`rounded-full border px-3 py-2 text-xs font-semibold ${view === key ? 'border-brand-ink bg-[#5E1A2B] text-white' : 'border-line bg-surface text-ink-muted hover:border-brand-ink'}`}>{name}{key === 'carrinho' ? ` (${cart.reduce((sum, item) => sum + item.quantity, 0)})` : ''}</button>)}
      </nav>

      {view === 'inicio' && <DemoCatalog products={visibleProducts} categories={categories} favorites={favorites} onToggleFavorite={toggleFavorite} onQuickView={setSelectedProduct} search={search} onSearchChange={setSearch} />}

      {view === 'favoritos' && <Panel title="Meus favoritos">
        {visibleProducts.filter((product) => favorites.includes(product.id)).length === 0 ? <EmptyState>Você ainda não tem produtos favoritos neste cenário.</EmptyState> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {visibleProducts.filter((product) => favorites.includes(product.id)).map((product) => <ProductCard key={product.id} product={product} onQuickView={setSelectedProduct} isFavorite onToggleFavorite={toggleFavorite} />)}
        </div>}
      </Panel>}

      {view === 'carrinho' && <Panel title="Sua sacola · simulação" actions={<button className="text-sm font-semibold text-brand-ink underline" onClick={() => setParams({ view: 'inicio' })}>Adicionar produtos</button>}>
        {!cart.length ? <EmptyState>A sacola está vazia. Escolha um produto do catálogo para testar.</EmptyState> : <div className="space-y-4">
          {cart.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line-muted pb-3"><div><h3 className="font-semibold">{item.name}</h3><p className="text-xs text-ink-soft">{currency(item.price)} por unidade</p></div><div className="flex items-center gap-3"><button aria-label={`Remover uma unidade de ${item.name}`} onClick={() => setCart((items) => updateCart(items, item, -1))}><Minus size={16}/></button><span className="text-sm font-semibold">{item.quantity}</span><button aria-label={`Adicionar uma unidade de ${item.name}`} disabled={item.quantity >= item.stock} onClick={() => setCart((items) => updateCart(items, item, 1))} className="disabled:opacity-30"><Plus size={16}/></button><button aria-label={`Excluir ${item.name}`} className="text-danger-ink" onClick={() => setCart((items) => items.filter((p) => p.id !== item.id))}><Trash2 size={16}/></button></div></div>)}
          <div className="flex justify-between font-bold"><span>Subtotal</span><span>{currency(cartTotal(cart))}</span></div><button className={buttonClass} onClick={() => setParams({ view: 'checkout' })}>Visualizar checkout simulado</button>
        </div>}
      </Panel>}

      {view === 'checkout' && <Panel title="Checkout de demonstração" actions={<CreditCard size={20} className="text-brand-ink" />}>
        <DemoCheckout key={scenario} cart={cart} scenario={scenario} />
      </Panel>}

      {view === 'conta' && <Panel title="Minha conta · simulação" actions={<UserRound className="text-brand-ink" size={20}/>}>{user ? <div className="grid gap-4 text-sm sm:grid-cols-2"><p><span className="block text-xs text-ink-soft">Nome</span><strong>{user.name}</strong></p><p><span className="block text-xs text-ink-soft">E-mail</span><strong>{user.email}</strong></p><p><span className="block text-xs text-ink-soft">Perfil de visualização</span><strong>{user.role === 'admin' ? 'Admin fictício' : 'Cliente fictício'}</strong></p><p><span className="block text-xs text-ink-soft">Endereço</span><strong>{demoAddress.street}, {demoAddress.number} (fictício)</strong></p><button className={buttonClass} onClick={() => setParams({ view: 'pedidos' })}>Visualizar pedidos fictícios</button></div> : <EmptyState>Visitante sem conta. Selecione “Cliente fictício” nos controles para visualizar esta página sem criar cadastro.</EmptyState>}</Panel>}

      {view === 'pedidos' && <Panel title="Pedidos · simulação" actions={<ClipboardList size={20} className="text-brand-ink"/>}>
        <p className="mb-4 text-xs text-ink-soft">As etapas alteradas no administrador fictício aparecem aqui ao navegar para Pedidos. Tudo permanece apenas nesta sessão.</p>
        <CustomerOrderHistory key={scenario} service={orderService} />
      </Panel>}

      {view === 'admin' && <div className="space-y-5"><Panel title="Painel administrativo · apenas simulação" actions={<ShieldCheck size={20} className="text-brand-ink"/>}><p className="text-sm text-ink-muted">Isto não autentica um administrador nem abre o painel real. Serve para testar visualmente a organização de produtos, categorias e ações antes de conectar ao Laravel.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-surface-muted p-4"><p className="text-xs text-ink-soft">Produtos fictícios</p><strong className="text-2xl">{products.length}</strong></div><div className="rounded-xl bg-surface-muted p-4"><p className="text-xs text-ink-soft">Categorias fictícias</p><strong className="text-2xl">{categories.length}</strong></div><div className="rounded-xl bg-surface-muted p-4"><p className="text-xs text-ink-soft">Pedidos fictícios</p><strong className="text-2xl">{orders.length}</strong></div></div><a href="#admin-pedidos" className={`${buttonClass} mt-4 inline-block`}>Gerenciar pedidos</a></Panel>
          <DemoProductManager key={scenario} products={products} onProductsChanged={setProducts} onProductRemoved={(id) => { setCart((items) => items.filter((item) => item.id !== id)); setFavorites((ids) => ids.filter((item) => item !== id)); }} />
          <DemoCategoryManager key={scenario} products={products} categories={categories} onProductsChanged={setProducts} onCategoriesChanged={setCategories} />
          <AdminOrderManager key={`orders-${scenario}`} service={orderService} workflow={orderService.workflow} canUpdateFulfillment />
          <AdminAudienceReport metrics={demoAudienceMetrics} />
        </div>}

      <footer className="border-t border-line py-5 text-center text-xs text-ink-soft">Protótipo local, sem autenticação, frete ou pagamento real · alterações desaparecem ao recarregar</footer>
    </div>
    <ProductModal product={selectedProduct} isOpen={Boolean(selectedProduct)} onClose={() => setSelectedProduct(null)} onAddToCart={addToCart}/>
  </div>;
}
