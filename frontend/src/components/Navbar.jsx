import React, { useState } from 'react';
import ThemeToggle from './ThemeToggle';
import { SlidersHorizontal, Search, Heart, ShoppingBag, User, ShieldCheck, Menu, X } from 'lucide-react';

export default function Navbar({
  currentView,
  setCurrentView,
  cartCount,
  onOpenCart,
  onOpenFavorites,
  onOpenAuth,
  user,
  onLogout,
  searchQuery = '',
  onSearchQueryChange,
  onSearch
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigate = (view) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
  };

  const navLinks = [
    ['Início', 'home'],
    ['Sobre nós', 'sobre'],
    ['Pedidos', 'pedidos'],
    ['Contato', 'home'],
  ];

  const isNavLinkActive = (label, view) => (
    (label === 'Início' && currentView === 'home')
    || (label === 'Sobre nós' && view === 'sobre' && currentView === 'sobre')
    || (label === 'Pedidos' && currentView === 'pedidos')
  );

  return (
    <div className="w-full bg-canvas">
      <header className="w-full bg-[#5E1A2B] text-white shadow-sm">
        <div className="w-full px-4 sm:px-8 lg:px-12 h-20 py-3.5 flex items-center justify-between gap-4">
          
          {/* Logotipo */}
          <div 
            onClick={() => setCurrentView('home')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 sm:w-[72px] sm:h-[72px] shrink-0 flex items-center justify-center group-hover:scale-105 transition">
              <img src="/Protocolo.png" alt="Logo Protocolo Cuidar" className="w-full h-full object-contain" />
            </div>
            <div className="hidden lg:flex flex-col">
              <span className="font-serif tracking-widest text-xl xl:text-3xl font-medium uppercase text-white leading-tight">
                PROTOCOLO CUIDAR
              </span>
            </div>
          </div>

          <nav className="flex md:hidden flex-1 min-w-0 items-center justify-start gap-2 sm:gap-4 overflow-x-auto whitespace-nowrap rounded-full bg-[#4A1422] px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden text-[10px] sm:text-xs font-medium text-stone-200">
            {navLinks.map(([label, view]) => (
              <button key={label} type="button" onClick={() => navigate(view)} className={`shrink-0 hover:text-white transition ${isNavLinkActive(label, view) ? 'text-white font-bold' : ''}`}>
                {label}
              </button>
            ))}
          </nav>

          {/* Links Centrais em Pílula Translúcida */}
          <nav className="hidden md:flex items-center bg-[#4A1422] rounded-full px-4 xl:px-6 py-3 gap-3 lg:gap-5 xl:gap-8 text-sm font-medium text-stone-200 shadow-inner">
            {navLinks.map(([label, view]) => (
              <button
                key={label}
                type="button"
                onClick={() => setCurrentView(view)}
                className={`hover:text-white transition ${isNavLinkActive(label, view) ? 'text-white font-bold' : ''}`}
              >
                {label}
              </button>
            ))}

            {user?.role === 'admin' && (
              <button
                onClick={() => setCurrentView('admin')}
                className={`flex items-center gap-1.5 text-amber-300 font-semibold px-2 py-0.5 rounded-full bg-amber-950/60 hover:text-white transition`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Painel Lojista
              </button>
            )}
          </nav>

          {/* Ícones de Ação: Favoritos, Sacola e Perfil */}
          <div className="hidden md:flex items-center gap-5 text-stone-200">
            <button 
              onClick={() => setCurrentView('favoritos')}
              className="hover:text-white transition p-1" 
              title="Favoritos"
            >
              <Heart className="w-5 h-5 stroke-[1.6]" />
            </button>

            {/* Sacola com Badge */}
            <button 
              onClick={onOpenCart}
              className="relative hover:text-white transition p-1"
              title="Sacola de Compras"
            >
              <ShoppingBag className="w-5 h-5 stroke-[1.6]" />
              <span className="absolute -top-1 -right-1 bg-[#2C4835] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-brand-ink">
                {cartCount}
              </span>
            </button>

            {/* Usuário / Login / Painel */}
            {user ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentView(user.role === 'admin' ? 'admin' : 'minha-conta')}
                  className="flex items-center gap-1.5 text-xs text-amber-100 hover:text-white transition bg-[#4A1422] px-3 py-1 rounded-full border border-warning-line/20"
                >
                  <User className="w-3.5 h-3.5" />
                  <span className="max-w-[90px] truncate">{user.name.split(' ')[0]}</span>
                </button>
                <button
                  onClick={onLogout}
                  className="text-[10px] text-stone-300 hover:text-white underline ml-1"
                >
                  Sair
                </button>
              </div>
            ) : (
              <button 
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 text-xs font-medium text-stone-100 hover:text-white transition bg-[#4A1422] px-3.5 py-1.5 rounded-full border border-warning-line/20"
                title="Entrar"
              >
                <User className="w-4 h-4 stroke-[1.6]" />
                <span className="hidden sm:inline">Entrar</span>
              </button>
            )}
          </div>

          {!user && (
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onOpenAuth();
              }}
              className="md:hidden inline-flex shrink-0 items-center gap-1 rounded-full border border-warning-line/30 bg-[#4A1422] px-2.5 py-2 text-xs font-semibold text-white"
            >
              <User className="h-4 w-4" /> Entrar
            </button>
          )}

          <ThemeToggle />
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="md:hidden p-2 rounded-full hover:bg-white/10 text-white"
            aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-transparent"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Fechar menu suspenso"
          />
          <aside className="fixed right-4 top-[76px] z-50 w-[min(88vw,340px)] max-h-[calc(100dvh-92px)] overflow-y-auto rounded-2xl bg-canvas text-ink shadow-2xl border border-line">
            <div className="px-5 py-4 bg-[#5E1A2B] text-white rounded-t-2xl">
              <span className="font-serif text-lg tracking-wide">Menu</span>
            </div>
            <div className="flex flex-col p-4 gap-2">
              <button type="button" onClick={() => navigate('pedidos')} className="px-3 py-3 rounded-lg hover:bg-surface-subtle text-left">Pedidos</button>
              {user?.role === 'admin' && (
                <button type="button" onClick={() => navigate('admin')} className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-surface-subtle text-left text-brand-ink">
                  <ShieldCheck className="w-5 h-5" /> Painel Lojista
                </button>
              )}
              <button type="button" onClick={() => { setIsMobileMenuOpen(false); onOpenFavorites?.(); }} className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-surface-subtle text-left">
                <Heart className="w-5 h-5" /> Favoritos
              </button>
              <button type="button" onClick={() => { setIsMobileMenuOpen(false); onOpenCart(); }} className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-surface-subtle text-left">
                <ShoppingBag className="w-5 h-5" /> Sacola <span className="ml-auto text-sm text-ink-soft">{cartCount}</span>
              </button>
              {user ? (
                <>
                  <button type="button" onClick={() => navigate(user.role === 'admin' ? 'admin' : 'minha-conta')} className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-surface-subtle text-left">
                    <User className="w-5 h-5" /> Minha conta ({user.name.split(' ')[0]})
                  </button>
                  <button type="button" onClick={() => { setIsMobileMenuOpen(false); onLogout(); }} className="text-left px-3 py-3 text-sm text-ink-soft hover:text-brand-ink">Sair</button>
                </>
              ) : (
                <button type="button" onClick={() => { setIsMobileMenuOpen(false); onOpenAuth(); }} className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-surface-subtle text-left">
                <User className="w-5 h-5" /> Entrar
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Barra de Pesquisa */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSearch?.(searchQuery);
        }}
        className="w-full px-4 sm:px-8 lg:px-12 mt-4 mb-2"
        role="search"
      >
        <div className="relative flex items-center bg-surface rounded-full border border-line shadow-xs px-4 py-2 hover:border-line-strong transition">
          <SlidersHorizontal aria-hidden="true" className="w-4 h-4 text-ink-faint mr-3" />
          <input
            type="text"
            placeholder="Pesquisar bem-estar, dores ou ingredientes (ex: lavanda, enxaqueca, insônia)..."
            className="w-full text-xs text-ink-secondary placeholder-ink-faint bg-transparent outline-none"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange?.(event.target.value)}
            aria-label="Pesquisar produtos"
          />
          <button type="submit" aria-label="Pesquisar" className="ml-2 text-ink-faint hover:text-ink-muted">
            <Search className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
