import React, { useMemo, useRef, useState } from 'react';
import AdminComplaintsManager from '../../frontend/src/components/AdminComplaintsManager';
import OnboardingModal from '../../frontend/src/components/OnboardingModal';
import AdminProductForm from '../../frontend/src/components/AdminProductForm';
import { createDemoProductService } from './demoProductService';
import { currency } from './demoModel';

export default function DemoProductManager({ products, onProductsChanged, onProductRemoved }) {
  const currentProducts = useRef(products);
  currentProducts.current = products;
  const service = useMemo(() => createDemoProductService(() => currentProducts.current, onProductsChanged), []);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [demoProfile, setDemoProfile] = useState(null);
  const close = () => { setOpen(false); setEditing(null); };

  return <>
    <AdminComplaintsManager service={service} />
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-serif text-xl font-bold text-brand-ink">Formulário do cliente · demonstração</h2>
      <p className="text-sm text-ink-muted">Crie uma queixa na área acima e confira a mesma opção no dropdown do cliente. Nenhuma resposta desta prévia é enviada ao servidor.</p>
      <button type="button" onClick={() => setQuestionnaireOpen(true)} className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold">Testar formulário do cliente</button>
      {demoProfile && <p role="status" className="text-sm text-success-ink">Queixa principal fictícia: {demoProfile.problema_principal}</p>}
    </section>
    <OnboardingModal service={service} isOpen={questionnaireOpen} onClose={() => setQuestionnaireOpen(false)} profile={demoProfile} onProfileUpdated={setDemoProfile} />
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-serif text-xl font-bold text-brand-ink">Gerenciar produtos · demonstração</h2>
      <button type="button" onClick={() => { setEditing(null); setOpen(true); }} className="rounded-xl bg-[#5E1A2B] px-4 py-2 text-sm font-semibold text-white">Adicionar blend</button>
    </div>
    <p className="text-sm text-ink-muted">Use Editar para mudar nome, preço, estoque, ingredientes, queixas e fotos. O mesmo formulário é usado no painel conectado. As alterações abaixo duram somente até recarregar esta página.</p>
    {message && <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success-ink">{message}</p>}
    <ul className="divide-y divide-line-muted">{products.map((product) => <li key={product.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0"><h3 className="text-sm font-semibold">{product.name}</h3><p className="text-xs text-ink-soft">{currency(product.price)} · Estoque {product.stock} · {product.is_active === false ? 'Oculto da vitrine' : 'Ativo'}</p></div>
      <div className="flex gap-2">
        <button type="button" aria-label={`Editar ${product.name}`} onClick={() => { setEditing(service.hydrateProduct(product)); setOpen(true); }} className="rounded-lg border border-line-strong px-3 py-2 text-xs font-semibold">Editar</button>
        <button type="button" aria-label={`Excluir ${product.name}`} onClick={() => {
          if (!window.confirm(`Excluir o blend fictício "${product.name}"?`)) return;
          onProductsChanged(products.filter((item) => item.id !== product.id));
          onProductRemoved?.(product.id);
          setMessage(`"${product.name}" excluído somente da demonstração.`);
        }} className="rounded-lg border border-danger-line px-3 py-2 text-xs font-semibold text-danger-ink">Excluir</button>
      </div>
    </li>)}</ul>
    {!products.length && <p className="text-sm text-ink-soft">Nenhum blend. Use Adicionar blend para criar um exemplo.</p>}
    <AdminProductForm service={service} isOpen={open} onClose={close} existingProduct={editing} onProductSaved={(product) => {
      onProductsChanged(editing ? products.map((item) => item.id === product.id ? product : item) : [...products, product]);
      setMessage(`"${product.name}" salvo somente na demonstração.`);
    }} />
  </section></>;
}
