import React from 'react';
import { Sparkles } from 'lucide-react';
import ProductCard from './ProductCard';
import ProductCarousel from './ProductCarousel';

export default function RecommendedSection({
  products,
  userProfile,
  onQuickView,
  onOpenQuestionnaire,
  favoriteIds = [],
  onToggleFavorite
}) {
  const activeSymptom = userProfile?.problema_principal;

  return (
    <section className="w-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-4 pb-2 border-b border-line/80 gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-ink-strong tracking-tight">
            {activeSymptom ? (
              <>
                Produtos relacionados a:{' '}
                <span className="text-brand-ink underline decoration-amber-300">
                  {activeSymptom}
                </span>
              </>
            ) : (
              'Recomendados para Você'
            )}
          </h2>
          <p className="text-xs text-ink-soft mt-0.5">
            {activeSymptom
              ? 'Produtos cadastrados com essa queixa aparecem primeiro.'
              : 'O questionário opcional pode filtrar produtos pela queixa informada.'}
          </p>
        </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
          {!userProfile && (
            <button
              onClick={onOpenQuestionnaire}
              className="text-xs font-semibold text-brand-ink hover:underline"
            >
              Responder questionário opcional &rarr;
            </button>
          )}

        </div>
      </div>

      <ProductCarousel
        items={products}
        label="recomendações"
        renderItem={(prod) => (
          <div className="flex flex-col">
            <ProductCard
              product={prod}
              onQuickView={onQuickView}
              isFavorite={favoriteIds.includes(prod.id)}
              onToggleFavorite={onToggleFavorite}
            />
            {/* Badges de Tags visíveis abaixo do card */}
            {prod.tags && prod.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5 px-1">
                {prod.tags.map((t) => (
                  <span
                    key={t.id}
                    className="text-[9px] bg-surface-subtle text-brand-ink font-bold px-1.5 py-0.5 rounded-md"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      />
    </section>
  );
}
