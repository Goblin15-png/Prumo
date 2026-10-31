import React from 'react';
import { Search } from 'lucide-react';
import ProductCard from '../../frontend/src/components/ProductCard';
import ProductCarousel from '../../frontend/src/components/ProductCarousel';
import { searchDemoProducts } from './demoModel';
import { groupDemoCatalog } from './demoCatalogModel';

export default function DemoCatalog({ products, categories, favorites, onToggleFavorite, onQuickView, search, onSearchChange }) {
  const sections = groupDemoCatalog(products, categories);
  const searching = Boolean(search.trim());
  const results = searchDemoProducts(products, search);
  const card = (product) => <ProductCard key={product.id} product={product} onQuickView={onQuickView} isFavorite={favorites.includes(product.id)} onToggleFavorite={onToggleFavorite} />;

  return <div className="space-y-6">
    <div>
      <h1 className="font-serif text-3xl font-bold text-brand-ink">Explore nossos blends</h1>
      <p className="mt-2 text-sm text-ink-muted">Escolha uma categoria ou busque um produto. Esta prévia usa produtos fictícios.</p>
    </div>
    <label className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-3">
      <Search size={18} className="shrink-0 text-ink-soft" />
      <input value={search} onChange={(event) => onSearchChange(event.target.value)} aria-label="Buscar produtos fictícios" placeholder="Buscar produtos ou ingredientes fictícios" className="min-w-0 w-full bg-transparent text-sm outline-none" />
    </label>
    {searching ? <section aria-label="Resultados da busca" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-bold text-brand-ink">Resultados da busca · {results.length} produtos</h2>
        <button type="button" onClick={() => onSearchChange('')} className="text-xs font-semibold text-brand-ink underline">Limpar busca</button>
      </div>
      {results.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">{results.map(card)}</div>
        : <p className="rounded-xl border border-dashed border-line-strong bg-surface-muted p-6 text-sm text-ink-muted">Nenhum produto encontrado. Tente outro nome ou ingrediente.</p>}
    </section> : <>
      {sections.length > 0 && <nav aria-label="Categorias do catálogo" className="flex flex-wrap gap-2">
        {sections.map((section) => <a key={section.key} href={`#demo-${section.key}`} className="rounded-full border border-line-strong bg-surface px-4 py-2 text-xs font-semibold text-brand-ink hover:border-brand-ink">{section.title}</a>)}
      </nav>}
      {sections.length ? <div className="space-y-8">{sections.map((section) => <section id={`demo-${section.key}`} key={section.key} aria-label={section.title} className="scroll-mt-6 space-y-4">
        <div className="pr-16"><h2 className="font-serif text-xl font-bold text-brand-ink">{section.title}</h2><p className="text-xs text-ink-soft">{section.products.length} produtos</p></div>
        <ProductCarousel items={section.products} label={section.title} renderItem={card} />
      </section>)}</div> : <p className="rounded-xl border border-dashed border-line-strong bg-surface-muted p-8 text-center text-sm text-ink-muted">Nenhum produto disponível neste cenário.</p>}
    </>}
  </div>;
}
