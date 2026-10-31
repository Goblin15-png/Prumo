import React, { useEffect, useState } from 'react';
import { adminApi as api } from '../services/api';
import { Pencil, Plus, Trash2, X } from 'lucide-react';

export default function AdminCatalogManager({ onEditProduct, onProductsChanged, onProductDeleted, refreshKey = 0 }) {
  const [products, setProducts] = useState([]);
  const [tags, setTags] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [ingredientName, setIngredientName] = useState('');
  const [ingredientNotes, setIngredientNotes] = useState('');
  const [savingIngredient, setSavingIngredient] = useState(false);
  const [tagName, setTagName] = useState('');
  const [editingTag, setEditingTag] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [catalog, taxonomy] = await Promise.all([
        api.get('/admin/products'),
        api.get('/admin/taxonomy'),
      ]);
      setProducts(catalog.data.products || []);
      onProductsChanged?.(catalog.data.products || []);
      setTags(taxonomy.data.tags || []);
      setIngredients(taxonomy.data.ingredients || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível carregar a gestão do catálogo.');
    }
  };

  useEffect(() => { load(); }, [refreshKey]);

  const remove = async (type, id, name) => {
    const label = type === 'products' ? 'blend' : 'tag';
    if (!window.confirm(`Excluir ${label} "${name}"?`)) return;
    try {
      await api.delete(`/admin/${type}/${id}`);
      if (type === 'products') {
        const next = products.filter((product) => product.id !== id);
        setProducts(next);
        onProductsChanged?.(next);
        onProductDeleted?.();
      } else {
        await load();
      }
    } catch (err) {
      setError(err.response?.data?.message || `Não foi possível excluir ${label}.`);
    }
  };

  const saveTaxonomy = async (type) => {
    const editing = editingTag;
    const value = tagName;
    if (!value.trim()) return;
    try {
      const url = editing ? `/admin/${type}/${editing.id}` : `/admin/${type}`;
      const method = editing ? 'put' : 'post';
      await api[method](url, { name: value.trim() });
      setTagName(''); setEditingTag(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar. Verifique se esse nome já existe.');
    }
  };

  const startEditTaxonomy = (item) => { setEditingTag(item); setTagName(item.name.replace(/^#/, '')); };

  return (
    <section className="bg-surface p-5 sm:p-6 rounded-3xl border border-line shadow-xs space-y-6">
      <div>
        <h2 className="text-xl font-serif font-bold text-brand-ink">Gerenciar blends, ingredientes e tags</h2>
        <p className="text-xs text-ink-soft mt-1">Em Todos os blends, use Editar para alterar dados, fotos e ingredientes, ou Excluir para remover um produto. Você também pode ocultá-lo da vitrine desmarcando Exibir este produto no formulário.</p>
      </div>
      {error && <p role="alert" className="p-3 rounded-xl bg-danger-soft text-danger-ink text-xs">{error}</p>}

      <div className="grid grid-cols-1 gap-5">
        <div className="rounded-2xl border border-line p-4 space-y-3">
          <h3 className="font-bold text-sm text-ink">Tags dos blends</h3>
          <div className="flex gap-2">
            <input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="Ex.: relaxamento" className="min-w-0 flex-1 bg-surface-muted border border-line-strong rounded-lg px-3 py-2 text-xs" />
            <button onClick={() => saveTaxonomy('tags')} className="px-3 rounded-lg bg-[#5E1A2B] text-white text-xs font-semibold"><Plus className="w-4 h-4" /></button>
            {editingTag && <button onClick={() => { setEditingTag(null); setTagName(''); }} aria-label="Cancelar edição da tag" className="px-2 text-ink-soft"><X className="w-4 h-4" /></button>}
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => <span key={tag.id} className="inline-flex items-center gap-1 bg-surface-subtle rounded-full pl-3 pr-1 py-1 text-xs">{tag.name}<button onClick={() => startEditTaxonomy(tag)} aria-label={`Editar ${tag.name}`} className="p-1 text-ink-soft hover:text-brand-ink"><Pencil className="w-3 h-3" /></button><button onClick={() => remove('tags', tag.id, tag.name)} aria-label={`Excluir ${tag.name}`} className="p-1 text-ink-soft hover:text-danger-ink"><Trash2 className="w-3 h-3" /></button></span>)}
          </div>
        </div>


      </div>

      <section className="rounded-2xl border border-line p-4 space-y-3">
        <h3 className="text-sm font-bold text-ink">Ingredientes</h3>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={async (event) => {
          event.preventDefault(); setSavingIngredient(true); setError('');
          try { await api.post('/admin/ingredients', { name: ingredientName.trim(), benefits: ingredientNotes.trim() || null }); setIngredientName(''); setIngredientNotes(''); await load(); }
          catch (err) { setError(Object.values(err.response?.data?.errors || {}).flat()[0] || err.response?.data?.message || 'Não foi possível criar o ingrediente.'); }
          finally { setSavingIngredient(false); }
        }}>
          <input aria-label="Nome do novo ingrediente" required maxLength={120} value={ingredientName} onChange={(e) => setIngredientName(e.target.value)} placeholder="Nome do ingrediente" className="min-w-0 flex-1 rounded-lg border border-line-strong p-2 text-xs" />
          <input aria-label="Descrição do ingrediente" maxLength={5000} value={ingredientNotes} onChange={(e) => setIngredientNotes(e.target.value)} placeholder="Descrição opcional" className="min-w-0 flex-1 rounded-lg border border-line-strong p-2 text-xs" />
          <button type="submit" disabled={savingIngredient} className="rounded-lg bg-[#5E1A2B] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{savingIngredient ? 'Salvando…' : 'Criar ingrediente'}</button>
        </form>
        <ul className="flex flex-wrap gap-2 text-xs">{ingredients.map((ingredient) => <li key={ingredient.id} className="rounded-full bg-surface-subtle px-3 py-1">{ingredient.name}</li>)}</ul>
        {!ingredients.length && <p className="text-xs text-ink-soft">Nenhum ingrediente cadastrado.</p>}
      </section>

      <div className="border-t border-line pt-5">
        <h3 className="font-bold text-sm text-ink mb-3">Todos os blends ({products.length})</h3>
        <div className="divide-y divide-line-muted">
          {products.map((product) => (
            <div key={product.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-ink truncate">{product.name}</p>
                <p className="text-[11px] text-ink-soft">R$ {Number(product.price).toFixed(2).replace('.', ',')} · Estoque {product.stock} · {product.is_active ? 'Ativo' : 'Inativo'}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => onEditProduct(product)} aria-label={`Editar ${product.name}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-2 text-xs hover:bg-surface-subtle text-ink-muted"><Pencil className="w-4 h-4" />Editar</button>
                <button onClick={() => remove('products', product.id, product.name)} aria-label={`Excluir ${product.name}`} className="inline-flex items-center gap-1 rounded-lg border border-danger-line px-2 py-2 text-xs text-danger-ink hover:bg-danger-soft"><Trash2 className="w-4 h-4" />Excluir</button>
              </div>
            </div>
          ))}
          {!products.length && <p className="py-4 text-xs text-ink-soft">Nenhum blend cadastrado no servidor ainda.</p>}
        </div>
      </div>
    </section>
  );
}
