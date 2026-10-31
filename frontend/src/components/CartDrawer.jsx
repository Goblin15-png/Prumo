import React from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { orderCurrency } from './orderPresentation';

export default function CartDrawer({ isOpen, onClose, cart, onUpdateQuantity, onRemoveItem, onCheckout }) {
  if (!isOpen) return null;
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
    <section role="dialog" aria-modal="true" aria-label="Sua Sacola Botânica" className="flex h-full w-full max-w-md flex-col border-l border-line bg-canvas shadow-2xl">
      <div className="flex items-center justify-between border-b border-line bg-surface p-5">
        <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-ink-strong"><ShoppingBag className="h-5 w-5" />Sua Sacola Botânica</h2>
        <button onClick={onClose} aria-label="Fechar sacola" className="rounded-full p-2"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {!cart.length && <p className="py-12 text-center text-sm text-ink-muted">Sua sacola está vazia. Explore o catálogo para adicionar produtos.</p>}
        {cart.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
          <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{item.name}</h3><p className="text-xs text-ink-soft">{orderCurrency(item.price)}</p></div>
          <div className="flex items-center rounded-lg border border-line">
            <button className="p-2" aria-label={`Diminuir quantidade de ${item.name}`} onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}><Minus className="h-3 w-3" /></button>
            <span className="text-xs">{item.quantity}</span>
            <button className="p-2 disabled:opacity-40" aria-label={`Aumentar quantidade de ${item.name}`} disabled={item.quantity >= item.stock} onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}><Plus className="h-3 w-3" /></button>
          </div>
          <button className="p-2" aria-label={`Remover ${item.name}`} onClick={() => onRemoveItem(item.id)}><Trash2 className="h-4 w-4" /></button>
        </div>)}
      </div>
      {!!cart.length && <div className="space-y-4 border-t border-line bg-surface p-5"><div className="flex justify-between font-bold"><span>Subtotal dos produtos</span><span>{orderCurrency(subtotal)}</span></div><p className="text-xs text-ink-muted">Escolha entrega ou retirada e a forma de pagamento na próxima etapa.</p><button onClick={onCheckout} className="w-full rounded-xl bg-[#5E1A2B] px-4 py-3 text-sm font-semibold text-white">Continuar para o checkout</button></div>}
    </section>
  </div>;
}
