import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, GripVertical, Pencil, Plus, Save, Trash2, X } from 'lucide-react';

export default function AdminCategoryManager({ onCategoriesChanged, onProductsChanged, refreshKey = 0, service }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [categoryName, setCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [addingToCategory, setAddingToCategory] = useState(null);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [error, setError] = useState('');
  const draggedCategoryId = useRef(null);
  const draggedProduct = useRef(null);

  const load = async () => {
    try {
      const { data } = await service.get('/admin/categories');
      setCategories(data.categories || []);
      setProducts(data.products || []);
      setExpanded((current) => {
        const next = { ...current };
        (data.categories || []).forEach((category) => {
          if (next[category.id] === undefined) next[category.id] = true;
        });
        return next;
      });
      onCategoriesChanged?.(data.categories || []);
      onProductsChanged?.(data.products || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível carregar as categorias.');
    }
  };

  useEffect(() => { load(); }, [refreshKey, service]);

  const saveCategory = async (event) => {
    event.preventDefault();
    if (!categoryName.trim()) return;
    try {
      if (editingCategory) await service.put(`/admin/categories/${editingCategory.id}`, { name: categoryName.trim() });
      else await service.post('/admin/categories', { name: categoryName.trim() });
      setCategoryName('');
      setEditingCategory(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar a categoria.');
    }
  };

  const deleteCategory = async (category) => {
    if (!window.confirm(`Excluir a categoria "${category.name}"? Os produtos e os vínculos com outras categorias serão mantidos.`)) return;
    try {
      await service.delete(`/admin/categories/${category.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível excluir a categoria.');
    }
  };

  const persistCategoryOrder = async (sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return;
    const next = [...categories];
    const sourceIndex = next.findIndex((category) => category.id === sourceId);
    const targetIndex = next.findIndex((category) => category.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setCategories(next);
    try {
      await service.put('/admin/categories/order', { category_ids: next.map((category) => category.id) });
      await load();
    } catch (err) {
      await load();
      setError(err.response?.data?.message || 'Não foi possível salvar a ordem das categorias.');
    }
  };

  const persistProductOrder = async (category, sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return;
    const nextCategories = categories.map((item) => {
      if (item.id !== category.id) return item;
      const nextProducts = [...item.products];
      const sourceIndex = nextProducts.findIndex((product) => product.id === sourceId);
      const targetIndex = nextProducts.findIndex((product) => product.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return item;
      const [moved] = nextProducts.splice(sourceIndex, 1);
      nextProducts.splice(targetIndex, 0, moved);
      return { ...item, products: nextProducts };
    });
    setCategories(nextCategories);
    const reordered = nextCategories.find((item) => item.id === category.id).products;
    try {
      await service.put(`/admin/categories/${category.id}/products/order`, { product_ids: reordered.map((product) => product.id) });
      await load();
    } catch (err) {
      await load();
      setError(err.response?.data?.message || 'Não foi possível salvar a ordem dos produtos.');
    }
  };

  const assignSelectedProducts = async (categoryId) => {
    if (!selectedProducts.length) return;
    try {
      await service.post(`/admin/categories/${categoryId}/products`, { product_ids: selectedProducts.map(Number) });
      setAddingToCategory(null);
      setSelectedProducts([]);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível adicionar os produtos à categoria.');
    }
  };

  return (
    <section className="bg-surface p-5 sm:p-6 rounded-3xl border border-line shadow-xs space-y-5">
      <div>
        <h2 className="text-xl font-serif font-bold text-brand-ink">Gerenciador de categorias</h2>
        <p className="text-xs text-ink-soft mt-1">Arraste categorias e produtos para definir a ordem em que aparecem no catálogo.</p>
      </div>

      {error && <p role="alert" className="p-3 rounded-xl bg-danger-soft text-danger-ink text-xs">{error}</p>}

      <form onSubmit={saveCategory} className="flex flex-col sm:flex-row gap-2">
        <input
          aria-label="Nome da categoria"
          value={categoryName}
          onChange={(event) => setCategoryName(event.target.value)}
          placeholder={editingCategory ? 'Editar nome da categoria' : 'Nome da nova categoria'}
          maxLength={100}
          required
          className="flex-1 bg-surface-muted border border-line-strong rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-ink"
        />
        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#5E1A2B] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#4A1422]">
          {editingCategory ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {editingCategory ? 'Salvar categoria' : 'Adicionar categoria'}
        </button>
        {editingCategory && <button type="button" onClick={() => { setEditingCategory(null); setCategoryName(''); }} className="inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs text-ink-muted hover:bg-surface-subtle"><X className="w-4 h-4" /> Cancelar</button>}
      </form>

      <div className="space-y-3">
        {!categories.length && <p className="rounded-xl bg-surface-muted p-4 text-xs text-ink-soft">Ainda não há categorias cadastradas.</p>}
        {categories.map((category) => (
          <article
            key={category.id}
            aria-label={`Categoria ${category.name}`}
            draggable
            onDragStart={() => { draggedCategoryId.current = category.id; }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); persistCategoryOrder(draggedCategoryId.current, category.id); draggedCategoryId.current = null; }}
            className="rounded-2xl border border-line bg-canvas overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 sm:px-4 py-3">
              <span title="Arraste para reorganizar" className="cursor-grab text-ink-faint"><GripVertical className="w-4 h-4" /></span>
              <button type="button" aria-expanded={!!expanded[category.id]} onClick={() => setExpanded((value) => ({ ...value, [category.id]: !value[category.id] }))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                {expanded[category.id] ? <ChevronDown className="w-4 h-4 shrink-0 text-brand-ink" /> : <ChevronRight className="w-4 h-4 shrink-0 text-brand-ink" />}
                <span className="truncate font-serif font-bold text-ink-strong">{category.name}</span>
                <span className="shrink-0 text-[10px] text-ink-faint">({category.products?.length || 0})</span>
              </button>
              <button type="button" onClick={() => { setEditingCategory(category); setCategoryName(category.name); }} aria-label={`Editar categoria ${category.name}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-ink-soft hover:text-brand-ink"><Pencil className="w-4 h-4" />Editar</button>
              <button type="button" onClick={() => deleteCategory(category)} aria-label={`Excluir categoria ${category.name}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-ink-soft hover:text-danger-ink"><Trash2 className="w-4 h-4" />Excluir</button>
            </div>

            {expanded[category.id] && (
              <div className="border-t border-line px-4 py-3 space-y-3">
                <ul className="space-y-1">
                  {(category.products || []).map((product) => (
                    <li
                      key={product.id}
                      draggable
                      onDragStart={(event) => { event.stopPropagation(); draggedProduct.current = { categoryId: category.id, productId: product.id }; }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const dragged = draggedProduct.current;
                        if (dragged?.categoryId === category.id) persistProductOrder(category, dragged.productId, product.id);
                        draggedProduct.current = null;
                      }}
                      className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-ink-secondary hover:bg-surface"
                    >
                      <GripVertical className="w-3.5 h-3.5 shrink-0 cursor-grab text-ink-faint" />
                      <span className="min-w-0 flex-1 truncate">{product.name}</span>
                      <button type="button" aria-label={`Remover ${product.name} de ${category.name}`} onClick={async () => {
                        try { await service.delete(`/admin/categories/${category.id}/products/${product.id}`); await load(); }
                        catch (err) { setError(err.response?.data?.message || 'Não foi possível remover o vínculo.'); }
                      }} className="p-1 text-ink-soft hover:text-danger-ink"><X className="h-4 w-4" /></button>
                      {!product.is_active && <span className="text-[10px] text-ink-faint">Inativo</span>}
                    </li>
                  ))}
                  {!category.products?.length && <li className="px-2 py-2 text-xs italic text-ink-faint">Nenhum produto associado.</li>}
                </ul>

                <button
                  type="button"
                  onClick={() => { setAddingToCategory(addingToCategory === category.id ? null : category.id); setSelectedProducts([]); }}
                  className="inline-flex items-center gap-2 rounded-lg border border-brand-ink/20 bg-surface px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-brand-ink/5"
                >
                  <Plus className="w-4 h-4" /> Adicionar produto à categoria
                </button>

                {addingToCategory === category.id && (
                  <div className="rounded-xl border border-line bg-surface p-3 space-y-3">
                    <p className="text-xs font-semibold text-ink-secondary">Selecione um ou mais produtos. Os vínculos com outras categorias serão mantidos.</p>
                    <div className="max-h-48 overflow-y-auto divide-y divide-line-muted">
                      {products.filter((product) => !category.products?.some((linked) => linked.id === product.id)).map((product) => (
                        <label key={product.id} className="flex items-center gap-2 py-2 text-xs">
                          <input type="checkbox" checked={selectedProducts.includes(product.id)} onChange={(event) => setSelectedProducts((current) => event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id))} />
                          <span className="flex-1">{product.name}</span>
                          {product.categories?.length > 0 && <span className="text-[10px] text-ink-faint">{product.categories.map((item) => item.name).join(", ")}</span>}
                        </label>
                      ))}
                      {!products.length && <p className="py-2 text-xs text-ink-faint">Cadastre blends antes de associá-los.</p>}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => { setAddingToCategory(null); setSelectedProducts([]); }} className="rounded-lg px-3 py-2 text-xs text-ink-soft">Cancelar</button>
                      <button type="button" disabled={!selectedProducts.length} onClick={() => assignSelectedProducts(category.id)} className="rounded-lg bg-[#5E1A2B] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Adicionar selecionados</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
