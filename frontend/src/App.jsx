import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import ProductCard from './components/ProductCard';
import ProductModal from './components/ProductModal';
import RegisterQuestionnaire from './components/RegisterQuestionnaire';
import OnboardingModal from './components/OnboardingModal';
import CartDrawer from './components/CartDrawer';
import CheckoutPage from './components/CheckoutPage';
import { groupCatalog } from './components/catalogPresentation';
import CustomerOrderHistory from './components/CustomerOrderHistory';
import RecommendedSection from './components/RecommendedSection';
import ProductCarousel from './components/ProductCarousel';
import MetaPixelConsent from './components/MetaPixelConsent';
import api, { ensureCsrfCookie } from './services/api';

const initialFullCatalog = [];
const initialCategories = [];

export default function App() {
  const [currentView, setCurrentView] = useState('home'); // home, recomendados, sobre, admin, minha-conta
  const [products, setProducts] = useState(initialFullCatalog);
  const [categories, setCategories] = useState(initialCategories);
  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [localTestMode, setLocalTestMode] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [favoriteIds, setFavoriteIds] = useState(() => {
    try {
      const storedIds = JSON.parse(window.localStorage.getItem('protocolo-favorites') || '[]');
      return Array.isArray(storedIds) ? storedIds : [];
    } catch {
      return [];
    }
  });
  
  // Modais
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPasswordResetRoute, setIsPasswordResetRoute] = useState(() => window.location.pathname === '/reset-password');
  const [emailVerificationNotice, setEmailVerificationNotice] = useState('');
  const [paymentReturnNotice, setPaymentReturnNotice] = useState('');
  const [emailVerificationLoading, setEmailVerificationLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchRequestId = useRef(0);

  const loadCatalog = async () => {
    setCatalogLoading(true);
    setCatalogError('');
    setCategoryError('');
    const [catalog, groups] = await Promise.allSettled([api.get('/products'), api.get('/categories')]);
    if (catalog.status === 'fulfilled') {
      const data = catalog.value.data;
      setProducts((Array.isArray(data) ? data : data.data) || []);
    } else {
      setCatalogError('Não foi possível carregar o catálogo. Tente novamente.');
    }
    if (groups.status === 'fulfilled') {
      setCategories(Array.isArray(groups.value.data) ? groups.value.data : []);
    } else {
      setCategoryError('Não foi possível carregar as categorias.');
    }
    setCatalogLoading(false);
  };

  useEffect(() => {
    if (window.location.pathname === '/reset-password') setIsAuthOpen(true);

    const query = new URLSearchParams(window.location.search);
    if (query.get('pagamento') === 'retorno') {
      setCurrentView('pedidos');
      setPaymentReturnNotice(query.get('modo_teste') === '1'
        ? 'Compra concluída no modo de teste local. Nenhuma cobrança real foi feita.'
        : 'Retorno recebido. O status abaixo é confirmado pelo servidor após consultar o Mercado Pago.');
      query.delete('pagamento');
      query.delete('modo_teste');
      query.delete('view');
      ['status', 'payment_id', 'collection_id', 'collection_status', 'merchant_order_id', 'preference_id', 'payment_type'].forEach((key) => query.delete(key));
      const remainingQuery = query.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${window.location.hash}`);
    }
    if (query.get('email_verified') === 'success') {
      setEmailVerificationNotice('Email confirmado. Você já pode continuar sua compra.');
      query.delete('email_verified');
      const remainingQuery = query.toString();
      const cleanUrl = `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', cleanUrl);
    }

    loadCatalog();
    api.get('/runtime-config')
      .then(({ data }) => setLocalTestMode(data.local_test_mode === true))
      .catch(() => setLocalTestMode(false));

    api.get('/me').then((res) => setUser(res.data.user)).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('protocolo-favorites', JSON.stringify(favoriteIds));
    } catch {
      // Favoritos continuam disponíveis durante a sessão se o navegador bloquear o armazenamento local.
    }
  }, [favoriteIds]);

  const handleResendVerification = async () => {
    setEmailVerificationLoading(true);
    try {
      await ensureCsrfCookie();
      const { data } = await api.post('/email/verification-notification');
      setEmailVerificationNotice(data.message || 'Enviamos um novo link de confirmação.');
    } catch {
      setEmailVerificationNotice('Não foi possível enviar o email agora. Tente novamente mais tarde.');
    } finally {
      setEmailVerificationLoading(false);
    }
  };

  const handleAddToCart = (product, quantity = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      const nextQuantity = Math.min(
        Number(product.stock) || 0,
        (existing?.quantity || 0) + Math.max(1, Number(quantity) || 1)
      );
      if (nextQuantity <= 0) return prev;
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: nextQuantity } : item
        );
      }
      return [...prev, { ...product, quantity: nextQuantity }];
    });
    setIsCartOpen(true);
  };

  const handleUpdateQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      handleRemoveItem(productId);
      return;
    }
    setCart((prev) => prev.flatMap((item) => {
      if (item.id !== productId) return [item];
      const availableStock = Number(item.stock) || 0;
      if (availableStock <= 0) return [];
      return [{ ...item, quantity: Math.min(availableStock, Math.max(1, Number(newQuantity) || 1)) }];
    }));
  };

  const handleRemoveItem = (productId) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const handleToggleFavorite = (productId) => {
    setFavoriteIds((prev) => prev.includes(productId)
      ? prev.filter((id) => id !== productId)
      : [...prev, productId]);
  };

  const handleSearch = async (rawQuery = searchQuery) => {
    const query = String(rawQuery || '').trim();
    const requestId = ++searchRequestId.current;
    setSearchQuery(rawQuery);
    setCurrentView('home');
    setSearchError('');

    if (!query) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }

    setSearchResults([]);
    setSearchLoading(true);
    try {
      const { data } = await api.get('/products', { params: { search: query } });
      if (requestId !== searchRequestId.current) return;
      setSearchResults(Array.isArray(data) ? data : (data?.data || []));
    } catch {
      if (requestId !== searchRequestId.current) return;
      setSearchResults([]);
      setSearchError('A busca não pôde ser concluída. Tente novamente.');
    } finally {
      if (requestId === searchRequestId.current) setSearchLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/logout');
    } catch {
      // A interface ainda limpa o estado local se a sessão já tiver expirado.
    }
    setUser(null);
    setCurrentView('home');
  };

  // Filtra recomendados priorizando a queixa do usuário
  const userHasHealthConsent = Boolean(user?.profile?.health_data_consented_at);
  const userProblem = userHasHealthConsent ? user.profile.problema_principal : null;
  const recommendedItems = [...products].sort((a, b) => {
    if (!userProblem) return 0;
    const aMatch = (a.symptom_target === userProblem || a.symptoms?.some((symptom) => symptom.name === userProblem)) ? 1 : 0;
    const bMatch = (b.symptom_target === userProblem || b.symptoms?.some((symptom) => symptom.name === userProblem)) ? 1 : 0;
    return bMatch - aMatch;
  });

  const bestSellers = [...products]
    .filter((product) => Number(product.sales_count) > 0)
    .sort((a, b) => b.sales_count - a.sales_count);
  const favoriteProducts = products.filter((product) => favoriteIds.includes(product.id));

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col font-sans">
      
      {/* NAVBAR OFICIAL */}
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        cartCount={cart.reduce((a, b) => a + b.quantity, 0)}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenFavorites={() => setCurrentView('favoritos')}
        onOpenAuth={() => setIsAuthOpen(true)}
        user={user}
        onLogout={handleLogout}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSearch={handleSearch}
      />

      {localTestMode && (
        <div role="status" className="mx-auto mt-3 w-[min(96%,80rem)] rounded-xl border border-warning-line-strong bg-warning-soft px-4 py-3 text-sm text-warning-ink">
          Modo de teste local: confirmação de email dispensada, frete simulado e pedidos finalizados sem cobrança.
        </div>
      )}

      {!localTestMode && emailVerificationNotice && (
        <div role="status" className="mx-auto mt-3 w-[min(96%,80rem)] rounded-xl border border-success-line bg-success-soft px-4 py-3 text-sm text-success-ink">
                  {emailVerificationNotice}
        </div>
      )}
      {!localTestMode && user?.role === 'customer' && !user.email_verified_at && (
        <div className="mx-auto mt-3 flex w-[min(96%,80rem)] flex-col gap-2 rounded-xl border border-warning-line-strong bg-warning-soft px-4 py-3 text-sm text-warning-ink sm:flex-row sm:items-center sm:justify-between">
          <span>Confirme o email <strong>{user.email}</strong> para liberar a compra.</span>
          <button type="button" onClick={handleResendVerification} disabled={emailVerificationLoading} className="self-start font-semibold underline disabled:opacity-60 sm:self-auto">
            {emailVerificationLoading ? 'Enviando…' : 'Reenviar confirmação'}
          </button>
        </div>
      )}

      {/* ROTEAMENTO / VISÕES DA APLICAÇÃO */}
      <main className="flex-1">
        {catalogLoading && <p role="status" className="mx-auto max-w-7xl px-4 py-4 text-sm text-ink-muted">Carregando catálogo…</p>}
        {(catalogError || categoryError) && <div role="alert" className="mx-auto max-w-7xl space-y-2 px-4 py-4 text-sm text-danger-ink">
          {catalogError && <p>{catalogError}</p>}{categoryError && <p>{categoryError}</p>}
          <button type="button" disabled={catalogLoading} onClick={loadCatalog} className="font-semibold underline disabled:opacity-50">Tentar carregar novamente</button>
        </div>}
        
        {/* TELA 1: HOME (DESIGN EXATO DA IMAGEM DE REFERÊNCIA) */}
        {currentView === 'home' && (
          <div className="w-full px-4 sm:px-8 lg:px-12 mt-6 space-y-10 pb-16">

            {(searchResults !== null || searchLoading || searchError) ? (
              <section className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-serif text-brand-ink font-bold">Resultados da busca</h1>
                    {searchQuery && <p className="text-xs text-ink-soft mt-1">Busca: <strong>{searchQuery}</strong></p>}
                  </div>
                  <button type="button" onClick={() => handleSearch('')} className="text-xs text-brand-ink font-semibold underline">
                    Limpar busca
                  </button>
                </div>
                {searchError && <p role="alert" className="text-sm text-danger-ink">{searchError}</p>}
                {searchLoading && <p role="status" className="text-sm text-ink-soft">Buscando produtos…</p>}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {(searchResults ?? []).map((prod) => (
                    <ProductCard key={prod.id} product={prod} onQuickView={setSelectedProduct} isFavorite={favoriteIds.includes(prod.id)} onToggleFavorite={handleToggleFavorite} />
                  ))}
                </div>
                {!searchLoading && !searchError && searchResults?.length === 0 && (
                  <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-muted">
                    Nenhum produto encontrado para essa busca.
                  </p>
                )}
              </section>
            ) : (
              <>
            
            {/* SECÇÃO 1: RECOMENDADOS (Com setas e cards idênticos) */}
            <RecommendedSection
              products={recommendedItems}
              userProfile={userHasHealthConsent ? user.profile : null}
              onQuickView={setSelectedProduct}
              favoriteIds={favoriteIds}
              onToggleFavorite={handleToggleFavorite}
              onOpenQuestionnaire={() => {
                if (!user) setIsAuthOpen(true);
                else setIsProfileOpen(true);
              }}
            />

            {bestSellers.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl sm:text-2xl font-bold text-ink-strong tracking-tight">Mais Vendidos</h2>
                </div>
                <ProductCarousel
                  items={bestSellers}
                  label="mais vendidos"
                  renderItem={(product) => <ProductCard product={product} onQuickView={setSelectedProduct} isFavorite={favoriteIds.includes(product.id)} onToggleFavorite={handleToggleFavorite} />}
                />
              </section>
            )}

            {/* Categorias em ordem gerenciada pelo administrador */}
            {groupCatalog(products, categories).map((section) => {
              const category = { id: section.key, name: section.title };
              const categoryProducts = section.products;

              return (
                <section key={category.id}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-ink-strong tracking-tight">{category.name}</h2>
                  </div>
                  <ProductCarousel
                    items={categoryProducts}
                    label={category.name}
                    renderItem={(product) => <ProductCard product={product} onQuickView={setSelectedProduct} isFavorite={favoriteIds.includes(product.id)} onToggleFavorite={handleToggleFavorite} />}
                  />
                </section>
              );
            })}
              </>
            )}
          </div>
        )}

        {currentView === 'checkout' && <CheckoutPage cart={cart} user={user} onOpenAuth={() => setIsAuthOpen(true)} onRequireVerification={() => { setCurrentView('minha-conta'); setEmailVerificationNotice('Confirme seu email para continuar a compra.'); }} onPaid={() => { setCart([]); loadCatalog(); }} onBack={() => setCurrentView('home')} onOrders={() => setCurrentView('pedidos')} />}

        {/* TELA 2: RECOMENDADOS (/recomendados) */}
        {currentView === 'recomendados' && (
          <div className="w-full px-4 sm:px-8 lg:px-12 py-10 space-y-6">
            <div className="bg-surface p-6 rounded-3xl border border-line">
              <span className="text-[10px] uppercase tracking-widest text-brand-ink font-bold bg-brand-ink/10 px-3 py-1 rounded-full">
                Produtos relacionados ao seu perfil
              </span>
              <h1 className="text-2xl sm:text-3xl font-serif text-brand-ink font-bold mt-2">
                Produtos relacionados
              </h1>
              <p className="text-xs text-ink-muted mt-1 max-w-xl">
                {userHasHealthConsent
                  ? `A lista prioriza os produtos cadastrados com a queixa informada: "${user.profile.problema_principal}".`
                  : 'O questionário é opcional e pode ajudar a filtrar produtos pela queixa informada:'}
              </p>

              {!userHasHealthConsent && (
                <button
                  onClick={() => {
                    if (!user) setIsAuthOpen(true);
                    else setIsProfileOpen(true);
                  }}
                  className="mt-4 bg-[#5E1A2B] text-white px-5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider shadow-sm"
                >
                  Responder questionário opcional
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {recommendedItems.map((prod) => (
                <ProductCard key={prod.id} product={prod} onQuickView={setSelectedProduct} isFavorite={favoriteIds.includes(prod.id)} onToggleFavorite={handleToggleFavorite} />
              ))}
            </div>
          </div>
        )}

        {currentView === 'favoritos' && (
          <div className="w-full px-4 sm:px-8 lg:px-12 py-10 space-y-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif text-brand-ink font-bold">Favoritos</h1>
              <p className="text-xs text-ink-soft mt-1">Seus produtos salvos neste navegador.</p>
            </div>
            {favoriteProducts.length ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {favoriteProducts.map((product) => (
                  <ProductCard key={product.id} product={product} onQuickView={setSelectedProduct} isFavorite onToggleFavorite={handleToggleFavorite} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-muted">
                Você ainda não salvou produtos. Use o coração nos cards para adicioná-los aqui.
              </p>
            )}
          </div>
        )}

        {/* TELA 4: RITUAIS & SOBRE (/sobre) */}
        {currentView === 'sobre' && (
          <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
            <div className="text-center space-y-3">
              <span className="text-[10px] uppercase tracking-widest text-brand-ink font-bold bg-brand-ink/10 px-3 py-1 rounded-full">
                Como funciona a compra
              </span>
              <h1 className="text-3xl sm:text-4xl font-serif text-brand-ink font-bold">
                Do catálogo ao pedido
              </h1>
              <p className="text-sm text-ink-muted leading-relaxed max-w-2xl mx-auto">
                Este catálogo reúne os produtos cadastrados pela loja. A descrição, a composição e a disponibilidade de cada item aparecem na página do próprio produto.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
              <div className="bg-surface p-6 rounded-2xl border border-line shadow-xs space-y-2">
                <div className="text-2xl">🔎</div>
                <h4 className="font-serif font-bold text-ink-strong">1. Consulte o produto</h4>
                <p className="text-xs text-ink-soft leading-relaxed">
                  Abra um item para ver as informações disponíveis, incluindo composição e descrição cadastradas.
                </p>
              </div>

              <div className="bg-surface p-6 rounded-2xl border border-line shadow-xs space-y-2">
                <div className="text-2xl">🛍️</div>
                <h4 className="font-serif font-bold text-ink-strong">2. Adicione à sacola</h4>
                <p className="text-xs text-ink-soft leading-relaxed">
                  Confira a quantidade disponível e revise os itens antes de continuar para o pagamento.
                </p>
              </div>

              <div className="bg-surface p-6 rounded-2xl border border-line shadow-xs space-y-2">
                <div className="text-2xl">📦</div>
                <h4 className="font-serif font-bold text-ink-strong">3. Acompanhe o pedido</h4>
                <p className="text-xs text-ink-soft leading-relaxed">
                  Depois da compra, consulte os pedidos e as atualizações disponíveis na área da sua conta.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TELA 6: MINHA CONTA (/minha-conta) */}
        {currentView === 'minha-conta' && (
          <div className="max-w-3xl mx-auto px-4 py-12">
            <div className="bg-surface p-8 rounded-3xl border border-line shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h1 className="text-2xl font-serif text-brand-ink font-bold">Minha conta</h1>
                  <p className="text-xs text-ink-soft">Dados da conta e preferências de recomendações</p>
                </div>
                <span className="text-xs font-bold bg-success-subtle text-success-ink px-3 py-1 rounded-full">
                  {user?.email_verified_at ? 'Email confirmado' : 'Email pendente'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-bold text-ink-soft block">Nome</span>
                  <span className="text-ink-strong font-semibold">{user?.name}</span>
                </div>
                <div>
                  <span className="font-bold text-ink-soft block">Email</span>
                  <span className="text-ink-strong font-semibold">{user?.email}</span>
                </div>
                <div>
                  <span className="font-bold text-ink-soft block">Queixa informada</span>
                  <span className="text-brand-ink font-bold">{user?.profile?.problema_principal || 'Questionário opcional não preenchido'}</span>
                </div>
                <div>
                  <span className="font-bold text-ink-soft block">Telefone</span>
                  <span className="text-ink-strong">{user?.profile?.numero_telefone || 'Não informado'}</span>
                </div>
              </div>

              <button
                onClick={() => setIsProfileOpen(true)}
                className="text-xs text-brand-ink font-semibold underline hover:text-brand-strong"
              >
                {userHasHealthConsent ? 'Atualizar preferências de recomendações' : 'Preencher questionário opcional'} &rarr;
              </button>

              <button type="button" onClick={() => setCurrentView('pedidos')} className="rounded-xl bg-[#5E1A2B] px-4 py-3 text-sm font-semibold text-white">Ver meus pedidos</button>
            </div>
          </div>
        )}

        {currentView === 'pedidos' && <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
          <div className="rounded-3xl border border-line bg-surface p-5 shadow-xs sm:p-8">
            {user && (user.email_verified_at || localTestMode) ? <CustomerOrderHistory key={user.id} service={api} returnNotice={paymentReturnNotice} /> : <div className="space-y-4">
              <h1 className="font-serif text-2xl font-bold text-brand-ink">Meus pedidos</h1>
              <p className="text-sm text-ink-muted">{user ? 'Confirme seu email para consultar seus pedidos.' : 'Entre na sua conta para consultar seus pedidos e acompanhar a entrega.'}</p>
              {user ? <button type="button" onClick={handleResendVerification} disabled={emailVerificationLoading} className="rounded-xl bg-[#5E1A2B] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Reenviar confirmação de email</button>
                : <button type="button" onClick={() => setIsAuthOpen(true)} className="rounded-xl bg-[#5E1A2B] px-4 py-3 text-sm font-semibold text-white">Entrar para ver pedidos</button>}
            </div>}
          </div>
        </div>}

      </main>

      {/* MODAL 1: QUESTIONÁRIO / LOGIN */}
      <RegisterQuestionnaire
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onResetComplete={() => setIsPasswordResetRoute(false)}
        onAuthSuccess={(authUser) => {
          setUser(authUser);
          setIsAuthOpen(false);
        }}
        onRegisterSuccess={(authUser) => {
          setUser(authUser);
          setIsAuthOpen(false);
          setIsProfileOpen(true);
        }}
      />

      <OnboardingModal
        service={api}
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        profile={user?.profile}
        onProfileUpdated={(profile) => setUser((current) => current ? { ...current, profile } : current)}
      />

      {/* MODAL 2: QUICK VIEW COM TABELA DE INGREDIENTES */}
      <ProductModal
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
      />

      {/* DRAWER 3: CARRINHO COM CÁLCULO DE FRETE & CHECKOUT */}
      <CartDrawer
        onCheckout={() => { setIsCartOpen(false); setCurrentView('checkout'); }}
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={() => setCart([])}
        user={user}
        localTestMode={localTestMode}
        onOpenAuth={() => setIsAuthOpen(true)}
        onRequireVerification={() => setEmailVerificationNotice('Confirme seu email e use o botão Reenviar confirmação antes de pagar.')}
      />

      <a href="/admin" className="self-center px-4 py-3 text-xs text-ink-soft underline">Acesso administrativo</a>
      {!isPasswordResetRoute && <MetaPixelConsent />}
    </div>
  );
}
