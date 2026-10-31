import React, { useState } from 'react';

export default function ProductQuickViewModal({ product, isOpen, onClose, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);

  if (!isOpen || !product) return null;

  const handleAdd = () => {
    if (onAddToCart) {
      onAddToCart(product, quantity);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-canvas text-ink rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden border border-success-ink/10 flex flex-col md:flex-row max-h-[90vh]">
        {/* Galeria / Imagem */}
        <div className="md:w-1/2 bg-surface-subtle flex items-center justify-center p-6 relative">
          <div className="w-full h-64 md:h-full flex items-center justify-center bg-success-soft/50 rounded-2xl border border-success-ink/5">
            <span className="text-success-ink/40 text-sm font-serif italic">
              [Visualização do Frasco / Blend Botânico]
            </span>
          </div>
          <span className="absolute top-4 left-4 bg-emerald-900 text-white text-xs px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold">
            {product.category?.name || 'Sinergia Pura'}
          </span>
        </div>

        {/* Detalhes do Produto */}
        <div className="md:w-1/2 p-6 md:p-8 flex flex-col overflow-y-auto">
          <div className="flex justify-between items-start">
            <h3 className="text-2xl font-serif text-success-ink">{product.name}</h3>
            <button
              onClick={onClose}
              className="text-ink-faint hover:text-ink-secondary text-xl font-bold ml-2"
            >
              &times;
            </button>
          </div>

          <p className="text-xl font-medium text-success-ink mt-2">
            R$ {Number(product.price).toFixed(2).replace('.', ',')}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                product.stock > 0
                  ? 'bg-success-subtle text-success-ink'
                  : 'bg-danger-subtle text-danger-ink'
              }`}
            >
              {product.stock > 0 ? `${product.stock} unidades em estoque` : 'Esgotado'}
            </span>
          </div>

          <p className="text-sm text-ink-muted mt-4 leading-relaxed">
            {product.description || product.short_description}
          </p>

          {/* Secção de Ingredientes Estruturada */}
          {product.ingredients && product.ingredients.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-success-ink mb-2">
                Composição & Ingredientes Puros
              </h4>
              <ul className="space-y-1.5 text-xs text-ink-secondary">
                {product.ingredients.map((ing) => (
                  <li key={ing.id} className="flex items-start gap-1.5">
                    <span className="text-success-ink font-bold">&#8226;</span>
                    <div>
                      <span className="font-semibold">{ing.name}</span>
                      {ing.pivot?.percentage && (
                        <span className="text-ink-soft ml-1">({ing.pivot.percentage})</span>
                      )}
                      {ing.benefits && (
                        <p className="text-[11px] text-ink-soft italic">{ing.benefits}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Seletor de Quantidade & Botão de Compra */}
          <div className="mt-auto pt-6 border-t border-line flex items-center gap-4">
            <div className="flex items-center border border-line-strong rounded-lg overflow-hidden bg-surface">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="px-3 py-1.5 text-ink-muted hover:bg-surface-subtle"
              >
                -
              </button>
              <span className="px-3 py-1.5 text-sm font-semibold">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(product.stock || 10, q + 1))}
                className="px-3 py-1.5 text-ink-muted hover:bg-surface-subtle"
              >
                +
              </button>
            </div>

            <button
              onClick={handleAdd}
              disabled={product.stock <= 0}
              className="flex-1 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition shadow-sm"
            >
              Adicionar ao Carrinho
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
