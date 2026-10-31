import React from 'react';
import { SlidersHorizontal, Search, Heart, ShoppingBag, User } from 'lucide-react';

export default function Header({ cartCount, onOpenOnboarding, userProfile }) {
  return (
    <div className="w-full bg-canvas">
      {/* Barra de Navegação Superior (Tom Vinho/Bordeaux Fino) */}
      <header className="w-full bg-[#5E1A2B] text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 py-3 flex items-center justify-between gap-4">
          
          {/* Logotipo: Ícone Botânico + Texto Serif */}
          <div className="flex items-center gap-3 cursor-pointer">
            <div className="w-8 h-8 rounded-full border border-warning-line/40 flex items-center justify-center text-amber-100 font-serif italic text-base">
              🌿
            </div>
            <div className="flex flex-col">
              <span className="font-serif tracking-widest text-lg sm:text-xl font-medium uppercase text-white leading-tight">
                PROTOCOLO CUIDAR
              </span>
              <span className="text-[9px] tracking-[0.25em] text-amber-100/70 font-sans uppercase">
                APOTHECARY & RITUAL
              </span>
            </div>
          </div>

          {/* Links Centrais em Pílula Translúcida */}
          <nav className="hidden md:flex items-center bg-[#4A1422] rounded-full px-6 py-2 gap-8 text-xs font-medium text-stone-200 shadow-inner">
            <a href="#" className="hover:text-white transition">Início</a>
            <a href="#" className="hover:text-white transition">Sobre Nós</a>
            <a href="#" className="hover:text-white transition">Contato</a>
          </nav>

          {/* Ícones de Ação à Direita: Favoritos, Carrinho com Contador, Perfil */}
          <div className="flex items-center gap-5 text-stone-200">
            <button className="hover:text-white transition p-1" title="Favoritos">
              <Heart className="w-5 h-5 stroke-[1.6]" />
            </button>

            <button 
              className="relative hover:text-white transition p-1"
              title="Sacola de Compras"
            >
              <ShoppingBag className="w-5 h-5 stroke-[1.6]" />
              <span className="absolute -top-1 -right-1 bg-[#2C4835] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-brand-ink">
                {cartCount}
              </span>
            </button>

            <button 
              onClick={onOpenOnboarding}
              className="hover:text-white transition p-1 relative"
              title={userProfile ? 'Meu Perfil Botânico' : 'Preencher Questionário de Onboarding'}
            >
              <User className="w-5 h-5 stroke-[1.6]" />
              {userProfile && (
                <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 rounded-full"></span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Barra de Pesquisa Flutuante / Arredondada */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 mb-2">
        <div className="relative flex items-center bg-surface rounded-full border border-line shadow-xs px-4 py-2 hover:border-line-strong transition">
          <SlidersHorizontal className="w-4 h-4 text-ink-faint mr-3 cursor-pointer hover:text-ink-muted" />
          <input
            type="text"
            placeholder="Pesquisar bem-estar..."
            className="w-full text-xs text-ink-secondary placeholder-ink-faint bg-transparent outline-none"
          />
          <Search className="w-4 h-4 text-ink-faint ml-2 cursor-pointer hover:text-ink-muted" />
        </div>
      </div>
    </div>
  );
}
