import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Plus, Trash2, Save, Sparkles, Leaf } from 'lucide-react';

const createInitialFormData = (product) => ({
  name: product?.name ?? '',
  price: product?.price ?? '',
  stock: product?.stock ?? 0,
  shipping_width_cm: product?.shipping_width_cm ?? '',
  shipping_height_cm: product?.shipping_height_cm ?? '',
  shipping_length_cm: product?.shipping_length_cm ?? '',
  shipping_weight_kg: product?.shipping_weight_kg ?? '',
  short_description: product?.short_description ?? '',
  therapeutic_description: product?.therapeutic_description ?? '',
  images: product?.images ?? [],
  symptom_target: product?.symptom_target ?? '',
  ...(!product?.symptom_target || product?.symptoms?.length ? { symptom_ids: product?.symptoms?.map((symptom) => symptom.id) ?? [] } : {}),
  is_active: product?.is_active ?? true,
  tags: product?.tags?.map((tag) => tag.id) ?? [],
  ingredients: product?.ingredients?.map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    percentage: ingredient.pivot?.percentage ?? '',
  })) ?? [],
});

export default function AdminProductForm({ isOpen, onClose, onProductSaved, existingProduct = null, service }) {
  const saving = useRef(false);
  const taxonomyRequest = useRef(0);
  const [taxonomyLoading, setTaxonomyLoading] = useState(true);
  const [taxonomyError, setTaxonomyError] = useState('');
  const [formData, setFormData] = useState(() => createInitialFormData(existingProduct));

  const [imageUrls, setImageUrls] = useState(() => (existingProduct?.images || []).join('\n'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [availableTags, setAvailableTags] = useState([]);
  const [availableSymptoms, setAvailableSymptoms] = useState([]);
  const [availableIngredients, setAvailableIngredients] = useState([]);
  const [newTagName, setNewTagName] = useState('');
  const [newIngredientName, setNewIngredientName] = useState('');
  const [newIngredientBenefits, setNewIngredientBenefits] = useState('');
  const [creatingIngredient, setCreatingIngredient] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setFormData(createInitialFormData(existingProduct));
    setImageUrls((existingProduct?.images || []).join('\n'));
    setError(null);
    setNewTagName('');
    setNewIngredientName('');
    setNewIngredientBenefits('');
  }, [isOpen, existingProduct?.id]);

  const loadTaxonomy = useCallback(async () => {
    const request = ++taxonomyRequest.current;
    setTaxonomyLoading(true);
    setTaxonomyError('');
    try {
      const { data } = await service.get('/admin/taxonomy');
      if (request !== taxonomyRequest.current) return;
      setAvailableTags(data.tags || []);
      setAvailableSymptoms(data.symptoms || []);
      setAvailableIngredients(data.ingredients || []);
    } catch {
      if (request === taxonomyRequest.current) setTaxonomyError('Não foi possível carregar as opções do formulário. Tente novamente antes de salvar.');
    } finally {
      if (request === taxonomyRequest.current) setTaxonomyLoading(false);
    }
  }, [service]);

  useEffect(() => {
    if (!isOpen) return;
    loadTaxonomy();
    return () => { taxonomyRequest.current += 1; };
  }, [isOpen, loadTaxonomy]);

  if (!isOpen) return null;
  const imageList = imageUrls.split('\n').map((url) => url.trim()).filter(Boolean);

  const handleToggleTag = (tagId) => {
    setFormData((prev) => {
      const current = prev.tags || [];
      if (current.includes(tagId)) {
        return { ...prev, tags: current.filter((id) => id !== tagId) };
      } else {
        return { ...prev, tags: [...current, tagId] };
      }
    });
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const { data } = await service.post('/admin/tags', { name: newTagName.trim() });
      setAvailableTags((prev) => [...prev, data.tag]);
      setFormData((prev) => ({ ...prev, tags: [...(prev.tags || []), data.tag.id] }));
      setNewTagName('');
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível criar essa tag.');
    }
  };

  const handleCreateIngredient = async () => {
    if (!newIngredientName.trim() || creatingIngredient) return;
    setCreatingIngredient(true);
    try {
      const { data } = await service.post('/admin/ingredients', {
        name: newIngredientName.trim(),
        benefits: newIngredientBenefits.trim() || null,
      });
      const ingredient = data.ingredient;
      setAvailableIngredients((prev) => [...prev, ingredient].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setFormData((prev) => ({
        ...prev,
        ingredients: [...prev.ingredients, { id: ingredient.id, name: ingredient.name, percentage: '0%' }],
      }));
      setNewIngredientName('');
      setNewIngredientBenefits('');
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível cadastrar esse ingrediente.');
    } finally {
      setCreatingIngredient(false);
    }
  };

  const handleAddIngredientRow = () => {
    if (!availableIngredients.length) return;
    const firstIngredient = availableIngredients.find((ingredient) => !formData.ingredients.some((row) => row.id === ingredient.id));
    if (!firstIngredient) return;
    setFormData((prev) => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        { id: firstIngredient.id, name: firstIngredient.name, percentage: '0%' },
      ],
    }));
  };

  const handleRemoveIngredientRow = (index) => {
    setFormData((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, idx) => idx !== index),
    }));
  };

  const handleIngredientChange = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.ingredients];
      if (field === 'id') {
        if (prev.ingredients.some((row, position) => position !== index && row.id === Number(value))) return prev;
        const found = availableIngredients.find((i) => i.id === Number(value));
        updated[index] = { ...updated[index], id: Number(value), name: found?.name || '' };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return { ...prev, ingredients: updated };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving.current || taxonomyLoading || taxonomyError) return;
    const images = imageUrls.split('\n').map((url) => url.trim()).filter(Boolean);
    if (images.length > 8) {
      setError('Cadastre no máximo 8 imagens por produto.');
      return;
    }
    const payload = { ...formData, stock: Number(formData.stock), images };
    saving.current = true;
    setLoading(true);
    setError(null);

    try {
      let res;
      if (existingProduct?.id) {
        res = await service.put(`/admin/products/${existingProduct.id}`, payload);
      } else {
        res = await service.post('/admin/products', payload);
      }

      if (onProductSaved) {
        onProductSaved(res.data.product || formData);
      }
      onClose();
    } catch (err) {
      const firstValidationError = Object.values(err.response?.data?.errors || {}).flat()[0];
      setError(firstValidationError || err.response?.data?.message || 'Falha ao salvar produto no catálogo.');
    } finally {
      saving.current = false;
      setLoading(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={existingProduct ? "Editar blend" : "Cadastrar blend"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-canvas text-ink rounded-3xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 border border-success-ink/10 my-8 max-h-[92vh] overflow-y-auto">
        
        {/* Cabeçalho */}
        <div className="flex justify-between items-start mb-6 pb-3 border-b border-line">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-brand-ink font-bold bg-brand-ink/10 px-3 py-1 rounded-full">
              Formulário do Lojista
            </span>
            <h2 className="text-2xl font-serif text-brand-ink font-bold mt-1">
              {existingProduct ? 'Editar Fórmula Botânica' : 'Cadastrar Novo Blend / Sinergia'}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            aria-label="Fechar formulário do blend"
            className="p-1 rounded-full text-ink-faint hover:text-ink-secondary hover:bg-surface-strong/50 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-xl bg-danger-soft text-danger-ink text-xs border border-danger-line">
            {error}
          </div>
        )}

        {taxonomyLoading && <p role="status" className="mb-4 text-sm text-ink-muted">Carregando opções do blend…</p>}
        {taxonomyError && <div role="alert" className="mb-4 space-y-2 rounded-xl border border-warning-line bg-warning-soft p-3 text-sm text-warning-ink"><p>{taxonomyError}</p><button type="button" onClick={loadTaxonomy} className="rounded-lg border border-current px-3 py-2">Recarregar opções do blend</button></div>}

        <form onSubmit={handleSubmit} aria-busy={loading}>
          <fieldset disabled={loading || taxonomyLoading || Boolean(taxonomyError)} className="min-w-0 space-y-4">
          
          {/* Nome e Preço */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="blend-name" className="block text-xs font-semibold text-ink-secondary mb-1">
                Nome do Produto / Blend *
              </label>
              <input
                id="blend-name"
                type="text"
                maxLength={180}
                required
                placeholder="Ex: Aroma Sono Reparador 10ml"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-surface border border-line-strong rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-brand-ink outline-none"
              />
            </div>

            <div>
              <label htmlFor="blend-price" className="block text-xs font-semibold text-ink-secondary mb-1">
                Preço (R$) *
              </label>
              <input
                id="blend-price"
                type="number"
                min="0"
                max="99999999.99"
                step="0.01"
                required
                placeholder="229.90"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full bg-surface border border-line-strong rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-brand-ink outline-none"
              />
            </div>
          </div>

          {/* Estoque e Dor Alvo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="blend-stock" className="block text-xs font-semibold text-ink-secondary mb-1">
                {existingProduct ? 'Estoque disponível (unidades)' : 'Estoque inicial (unidades)'}
              </label>
              <input
                id="blend-stock"
                type="number"
                min="0"
                max="1000000"
                step="1"
                required
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                className="w-full bg-surface border border-line-strong rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-brand-ink outline-none"
              />
            </div>

            <div>
              <fieldset className="space-y-2">
                <legend className="text-xs font-bold text-brand-ink">Queixas / alvos (opcional)</legend>
                <p className="text-[11px] text-ink-soft">Selecione uma ou mais opções. Cadastre novas opções na área de queixas e alvos.</p>
                <details className="rounded-xl border border-line-strong bg-surface p-3">
                  <summary className="cursor-pointer text-xs font-semibold">Selecionar queixas do público-alvo ({formData.symptom_ids?.length || 0})</summary>
                  <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                    {availableSymptoms.map((symptom) => <label key={symptom.id} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={(formData.symptom_ids || []).includes(symptom.id)} onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData((prev) => ({ ...prev, symptom_ids: checked ? [...(prev.symptom_ids || []), symptom.id] : (prev.symptom_ids || []).filter((id) => id !== symptom.id) }));
                      }} />{symptom.name}
                    </label>)}
                    {!availableSymptoms.length && <p className="text-xs text-ink-soft">Nenhuma queixa cadastrada. Cadastre na área Queixas e públicos-alvo.</p>}
                  </div>
                </details>
                {!Object.hasOwn(formData, 'symptom_ids') && formData.symptom_target && <div className="text-xs text-ink-muted">
                  <p>Alvo legado preservado: {formData.symptom_target}. Selecione opções cadastradas para substituí-lo.</p>
                  <button type="button" className="mt-1 underline" onClick={() => setFormData((prev) => ({ ...prev, symptom_target: '', symptom_ids: [] }))}>Remover alvo legado</button>
                </div>}
              </fieldset>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface-muted p-4 space-y-3">
            <div>
              <h3 className="text-xs font-bold text-ink">Embalagem para cálculo de frete</h3>
              <p className="mt-1 text-[11px] text-ink-soft">Informe as medidas e o peso embalado reais. O Melhor Envio usa centímetros e quilogramas.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['shipping_width_cm', 'Largura (cm)'],
                ['shipping_height_cm', 'Altura (cm)'],
                ['shipping_length_cm', 'Comprimento (cm)'],
                ['shipping_weight_kg', 'Peso (kg)'],
              ].map(([name, label]) => (
                <label key={name} className="text-[11px] font-semibold text-ink-secondary">
                  {label}
                  <input
                    type="number"
                    min={name === 'shipping_weight_kg' ? '0.001' : '0.01'}
                    step={name === 'shipping_weight_kg' ? '0.001' : '0.01'}
                    max={name === 'shipping_weight_kg' ? '1000' : '500'}
                    inputMode="decimal"
                    value={formData[name]}
                    onChange={(e) => setFormData((prev) => ({ ...prev, [name]: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-ink"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Descrições */}
          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1">
              Descrição Curta (Vitrine)
            </label>
            <input
              type="text"
              placeholder="Ex.: Aroma floral com lavanda e bergamota."
              value={formData.short_description}
              onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
              className="w-full bg-surface border border-line-strong rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-brand-ink outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1">
              Imagens do produto (URLs HTTPS, uma por linha)
            </label>
            <textarea
              rows={2}
              aria-label="Links das fotos do produto"
              placeholder="https://exemplo.com/imagem-do-produto.jpg"
              value={imageUrls}
              onChange={(e) => setImageUrls(e.target.value)}
              className="w-full bg-surface border border-line-strong rounded-xl p-3 text-xs focus:ring-2 focus:ring-brand-ink outline-none"
            />
            <p className="mt-1 text-[11px] text-ink-soft">
              Cole até 8 links públicos de imagem em HTTPS, um por linha. A primeira foto será a capa. O envio de arquivos do computador ainda não está disponível.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {imageList.slice(0, 8).map((url, index) => <div key={`${index}-${url}`} className="space-y-1 rounded-xl border border-line bg-surface p-2">
                {url.startsWith('https://') && <img src={url} alt={`Prévia da foto ${index + 1}`} referrerPolicy="no-referrer" className="h-20 w-full rounded-lg object-contain" />}
                <p className="text-[11px] font-semibold">{index === 0 ? 'Capa do produto' : `Foto ${index + 1}`}</p>
                {index > 0 && <button type="button" aria-label={`Usar foto ${index + 1} como capa`} onClick={() => setImageUrls([url, ...imageList.filter((_, position) => position !== index)].join('\n'))} className="block text-[11px] text-brand-ink underline">Usar como capa</button>}
                <button type="button" aria-label={`Remover foto ${index + 1}`} onClick={() => setImageUrls(imageList.filter((_, position) => position !== index).join('\n'))} className="text-[11px] text-danger-ink underline">Remover foto</button>
              </div>)}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1">
              Descrição detalhada
            </label>
            <textarea
              rows={3}
              placeholder="Informe características, composição e instruções fornecidas pelo fabricante."
              value={formData.therapeutic_description}
              onChange={(e) => setFormData({ ...formData, therapeutic_description: e.target.value })}
              className="w-full bg-surface border border-line-strong rounded-xl p-3 text-xs focus:ring-2 focus:ring-brand-ink outline-none"
            />
          </div>

          {/* SELETOR DE TAGS */}
          <div className="pt-2 border-t border-line">
            <label className="block text-xs font-bold text-ink mb-2">
              Seletor de Tags (Filtros e Badges)
            </label>
            <div className="flex gap-2 mb-3">
              <input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Criar nova tag (ex.: relaxamento)" className="flex-1 bg-surface border border-line-strong rounded-lg px-3 py-2 text-xs" />
              <button type="button" onClick={handleCreateTag} className="inline-flex items-center gap-1 rounded-lg bg-[#5E1A2B] text-white px-3 py-2 text-xs font-semibold"><Plus className="w-3.5 h-3.5" /> Nova tag</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => {
                const isSelected = formData.tags?.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleToggleTag(tag.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                      isSelected
                        ? 'bg-[#5E1A2B] text-white shadow-xs'
                        : 'bg-surface border border-line-strong text-ink-muted hover:border-line-active'
                    }`}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* MÓDULO DE INGREDIENTES DINÂMICO */}
          <div className="pt-3 border-t border-line space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                <Leaf className="w-4 h-4 text-success-ink" />
                Ingredientes e concentrações informadas
              </label>

              <button
                type="button"
                onClick={handleAddIngredientRow}
                disabled={!availableIngredients.some((ingredient) => !formData.ingredients.some((row) => row.id === ingredient.id))}
                className="flex items-center gap-1 text-[11px] font-bold text-success-ink hover:text-success-ink disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> {availableIngredients.length ? 'Adicionar Ingrediente' : 'Cadastre um ingrediente primeiro'}
              </button>
            </div>

            <div className="rounded-xl border border-success-ink/15 bg-success-soft/50 p-3 space-y-2">
              <p className="text-xs font-semibold text-ink-secondary">Cadastrar ingrediente novo</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newIngredientName}
                  onChange={(e) => setNewIngredientName(e.target.value)}
                  placeholder="Nome do ingrediente"
                  maxLength={120}
                  className="min-w-0 flex-1 bg-surface border border-line-strong rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-success-ink"
                />
                <input
                  type="text"
                  value={newIngredientBenefits}
                  onChange={(e) => setNewIngredientBenefits(e.target.value)}
                  placeholder="Benefícios (opcional)"
                  className="min-w-0 flex-1 bg-surface border border-line-strong rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-success-ink"
                />
                <button
                  type="button"
                  onClick={handleCreateIngredient}
                  disabled={!newIngredientName.trim() || creatingIngredient}
                  className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-emerald-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" /> {creatingIngredient ? 'Salvando…' : 'Cadastrar'}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {formData.ingredients.map((ingRow, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-surface p-2.5 rounded-xl border border-line">
                  <select
                    aria-label={`Ingrediente ${idx + 1}`}
                    value={ingRow.id}
                    onChange={(e) => handleIngredientChange(idx, 'id', e.target.value)}
                    className="flex-1 bg-surface-muted border border-line-strong rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-brand-ink"
                  >
                    {availableIngredients.map((item) => (
                      <option key={item.id} value={item.id} disabled={formData.ingredients.some((row, position) => position !== idx && row.id === item.id)}>
                        {item.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    aria-label={`Concentração do ingrediente ${idx + 1}`}
                    placeholder="40%"
                    value={ingRow.percentage}
                    onChange={(e) => handleIngredientChange(idx, 'percentage', e.target.value)}
                    className="w-20 bg-surface-muted border border-line-strong rounded-lg px-2.5 py-1.5 text-xs text-center font-bold text-brand-ink outline-none"
                  />

                  <button
                    type="button"
                    onClick={() => handleRemoveIngredientRow(idx)}
                    className="p-1.5 text-ink-faint hover:text-danger-ink transition"
                    title="Remover Ingrediente"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Ativo na Loja */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 text-brand-ink rounded border-line-strong focus:ring-brand-ink"
            />
            <label htmlFor="is_active" className="text-xs font-semibold text-ink-secondary cursor-pointer">
              Exibir este produto imediatamente no catálogo da loja
            </label>
          </div>

          {/* Ações */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-ink-muted hover:text-ink-strong transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-[#5E1A2B] hover:bg-[#4A1422] text-white px-6 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition shadow-md disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Salvando...' : 'Salvar no Catálogo'}
            </button>
          </div>

          </fieldset>
        </form>
      </div>
    </div>
  );
}
