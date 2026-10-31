import React, { useEffect, useState } from 'react';
import { Eye, Heart } from 'lucide-react';

export default function ProductCard({ product, onQuickView, isFavorite = false, onToggleFavorite }) {
  const imageUrl = Array.isArray(product.images) ? product.images[0] : null;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [imageUrl]);

  return (
    <div 
      onClick={() => onQuickView(product)}
      className="group bg-surface rounded-2xl border border-line/90 p-3 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col cursor-pointer"
    >
      {/* Área da Imagem (Placeholder Cinza-Sálvia com cantos arredondados) */}
      <div className="relative w-full aspect-square bg-image-surface rounded-xl overflow-hidden flex items-center justify-center">
        {/* Placeholder ou imagem real */}
        {(!imageUrl || imageFailed) && (
          <span className="text-image-ink text-xs font-serif italic tracking-wide select-none">
            Imagem não cadastrada
          </span>
        )}
        {imageUrl && !imageFailed && (
          <img
            src={imageUrl}
            alt={product.name ? `Imagem de ${product.name}` : 'Imagem do produto'}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImageFailed(true)}
          />
        )}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite?.(product.id);
          }}
          aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          aria-pressed={isFavorite}
          className={`absolute top-2.5 left-2.5 w-7 h-7 rounded-full bg-surface/90 border border-line shadow-xs flex items-center justify-center transition ${isFavorite ? 'text-brand-ink' : 'text-ink-soft hover:text-brand-ink'}`}
          title={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        >
          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
        </button>

        {/* Círculo Branco no Canto Superior Direito (exatamente como na imagem) */}
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onQuickView(product);
          }}
          className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-surface/90 border border-line shadow-xs flex items-center justify-center text-ink-soft hover:text-success-ink hover:scale-110 transition"
          title="Ver Ingredientes & Quick View"
        >
          <Eye className="w-3.5 h-3.5 stroke-[1.8]" />
        </div>
      </div>

      {/* Textos Inferiores: Título em Caixa Alta e Preço */}
      <div className="pt-3 pb-1 flex flex-col">
        <h4 className="font-sans font-bold text-[11px] uppercase tracking-wider text-ink-strong group-hover:text-success-ink transition line-clamp-1">
          {product.name || 'PRODUTO SEM NOME'}
        </h4>

        <span className="text-ink-strong font-bold text-xs sm:text-sm mt-1">
          R$ {Number(product.price).toFixed(2).replace('.', ',')}
        </span>
      </div>
    </div>
  );
}
