import React, { useEffect, useState } from 'react';
import { X, Plus, Minus, ShoppingBag, Sparkles, Leaf } from 'lucide-react';

export default function ProductModal({ product, isOpen, onClose, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = Array.isArray(product?.images) ? product.images[0] : null;

  useEffect(() => {
    setQuantity(1);
  }, [product?.id, isOpen]);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (!isOpen || !product) return null;

  const handleAdd = () => {
    if (product.stock < quantity || product.stock <= 0) return;
    if (onAddToCart) {
      onAddToCart(product, quantity);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-canvas text-ink rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden border border-success-ink/10 flex flex-col md:flex-row my-6 max-h-[92vh]">
        
        {/* Lado Esquerdo: Área Visual da Embalagem / Blend */}
        <div className="md:w-5/12 bg-image-surface p-6 flex flex-col items-center justify-center relative min-h-[220px] md:min-h-full">
          {imageUrl && !imageFailed ? (
            <img
              src={imageUrl}
              alt={product.name ? `Imagem de ${product.name}` : 'Imagem do produto'}
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="text-white text-sm text-center">Imagem não cadastrada</span>
          )}

          {/* Badges de Tags */}
          {product.tags && product.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-center mt-4">
              {product.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="bg-surface/80 backdrop-blur-xs text-brand-ink text-[10px] font-bold px-2 py-0.5 rounded-full"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Lado Direito: Informações Clínicas & Terapêuticas */}
        <div className="md:w-7/12 p-6 sm:p-8 flex flex-col overflow-y-auto">
          <div className="flex justify-between items-start">
            <div>
              {(product.symptoms?.length > 0 || product.symptom_target) && (
                <span className="text-[10px] uppercase tracking-widest text-brand-ink font-bold bg-brand-ink/10 px-2.5 py-0.5 rounded-full">
                  Queixas / alvos: {product.symptoms?.length ? product.symptoms.map((symptom) => symptom.name).join(', ') : product.symptom_target}
                </span>
              )}
              <h3 className="text-2xl font-serif text-brand-ink font-bold mt-1.5">
                {product.name}
              </h3>
            </div>
            
            <button
              onClick={onClose}
              className="p-1 rounded-full text-ink-faint hover:text-ink-secondary hover:bg-surface-strong/50 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-2xl font-bold text-ink-strong">
              R$ {Number(product.price).toFixed(2).replace('.', ',')}
            </span>
            <span className="text-xs text-ink-soft">
              {product.stock > 0 ? `Estoque: ${product.stock} un.` : 'Indisponível'}
            </span>
          </div>

          {/* Descrição */}
          <div className="mt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-secondary mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand-ink" />
              Descrição do produto
            </h4>
            <p className="text-xs text-ink-muted leading-relaxed">
              {product.therapeutic_description || product.short_description || 'Descrição ainda não informada.'}
            </p>
          </div>

          {/* TABELA DE INGREDIENTES PUROS & PORCENTAGENS */}
          {product.ingredients && product.ingredients.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink mb-2 flex items-center gap-1.5">
                <Leaf className="w-3.5 h-3.5 text-success-ink" />
                Composição do produto
              </h4>
              <div className="border border-line rounded-xl overflow-hidden bg-surface shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-subtle text-ink-muted uppercase text-[10px] font-bold">
                    <tr>
                      <th className="py-2 px-3">Ingrediente Botânico</th>
                      <th className="py-2 px-3 text-right">Concentração</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-muted">
                    {product.ingredients.map((ing) => (
                      <tr key={ing.id} className="hover:bg-surface-muted/60">
                        <td className="py-2 px-3">
                          <p className="font-semibold text-ink">{ing.name}</p>
                          {ing.description && (
                            <p className="text-[10px] text-ink-soft italic mt-0.5">{ing.description}</p>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-brand-ink whitespace-nowrap">
                          {ing.pivot?.percentage || 'Não informado'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Quantidade e Ação */}
          <div className="mt-6 pt-4 border-t border-line flex items-center gap-3">
            <div className="flex items-center border border-line-strong rounded-xl bg-surface overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="px-3 py-2 text-ink-muted hover:bg-surface-subtle transition"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="px-3 py-2 text-xs font-bold text-ink min-w-[28px] text-center">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                disabled={quantity >= product.stock}
                className="px-3 py-2 text-ink-muted hover:bg-surface-subtle transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={handleAdd}
              disabled={product.stock <= 0}
              className="flex-1 bg-[#5E1A2B] hover:bg-[#4A1422] disabled:opacity-50 text-white py-2.5 px-4 rounded-xl text-xs font-semibold uppercase tracking-wider transition shadow-md flex items-center justify-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              Adicionar à Sacola
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
