import { demoProducts } from './demoModel.js';

// Adaptador exclusivamente em memória. Não importa o cliente HTTP nem faz chamadas de rede.
export function createDemoProductService(getProducts, updateProducts) {
  const seed = () => ({
    ingredients: [...new Map(demoProducts.flatMap((product) => product.ingredients || []).map(({ id, name }) => [id, { id, name }])).values()],
    symptoms: [...new Set(demoProducts.map((product) => product.symptom_target).filter(Boolean))].map((name, index) => ({ id: index + 1, name })),
    tags: [],
  });
  let taxonomy = seed();
  const fail = (message) => { throw Object.assign(new Error(message), { response: { data: { message } } }); };
  const copy = (value) => structuredClone(value);
  const hydrateProduct = (product) => ({
    ...copy(product),
    is_active: product.is_active !== false,
    symptoms: product.symptoms ?? taxonomy.symptoms.filter((item) => item.name === product.symptom_target),
  });
  const save = (payload, existing = null) => {
    if (!payload.name?.trim() || !Number.isFinite(Number(payload.price)) || Number(payload.price) < 0) fail('Informe nome e preço válidos.');
    if (!Number.isInteger(Number(payload.stock)) || Number(payload.stock) < 0) fail('Informe um estoque válido.');
    const images = payload.images || [];
    if (images.length > 8 || images.some((url) => { try { return new URL(url).protocol !== 'https:'; } catch { return true; } })) fail('Use até 8 links HTTPS para as imagens.');
    const product = { category_id: null, category_ids: [], ...copy(existing || {}), ...copy(payload) };
    product.id = existing?.id ?? Math.max(100, ...getProducts().map((item) => item.id)) + 1;
    product.price = Number(payload.price);
    product.stock = Number(payload.stock);
    if (Object.hasOwn(payload, 'symptom_ids')) {
      product.symptoms = taxonomy.symptoms.filter((item) => payload.symptom_ids.includes(item.id));
      product.symptom_target = product.symptoms[0]?.name || null;
    }
    product.ingredients = (payload.ingredients || []).map((row) => {
      const ingredient = taxonomy.ingredients.find((item) => item.id === row.id);
      if (!ingredient) fail('Ingrediente não encontrado nesta demonstração.');
      return { ...ingredient, pivot: { percentage: row.percentage || '' } };
    });
    product.tags = taxonomy.tags.filter((tag) => (payload.tags || []).includes(tag.id));
    return { data: { product } };
  };
  return {
    hydrateProduct,
    reset: () => { taxonomy = seed(); },
    async get(path) {
      if (path === '/symptoms') return { data: copy(taxonomy.symptoms) };
      if (path !== '/admin/taxonomy') fail('Operação indisponível nesta demonstração.');
      return { data: copy(taxonomy) };
    },
    async post(path, data) {
      if (path === '/admin/products') return save(data);
      if (path === '/user/profile') {
        if (typeof data.problema_principal !== 'string' || !data.problema_principal.trim() || !data.health_data_consent) fail('Escolha a queixa principal e confirme o consentimento.');
        return { data: { profile: copy(data), recommendations: [] } };
      }
      const key = path === '/admin/ingredients' ? 'ingredients' : path === '/admin/tags' ? 'tags' : path === '/admin/symptoms' ? 'symptoms' : null;
      if (!key) fail('Operação indisponível nesta demonstração.');
      const name = data.name?.trim();
      if (!name || taxonomy[key].some((item) => item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) fail('Informe um nome novo para este cadastro.');
      const item = { id: Math.max(0, ...taxonomy[key].map((entry) => entry.id)) + 1, ...copy(data), name };
      taxonomy[key].push(item);
      return { data: { [key === 'ingredients' ? 'ingredient' : key === 'symptoms' ? 'symptom' : 'tag']: copy(item) } };
    },
    async put(path, data) {
      const complaint = path.match(/^\/admin\/symptoms\/(\d+)$/);
      if (complaint) {
        const symptom = taxonomy.symptoms.find((item) => item.id === Number(complaint[1]));
        const name = data.name?.trim();
        if (!symptom || !name || taxonomy.symptoms.some((item) => item.id !== symptom.id && item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) fail('Informe um nome novo para a queixa.');
        const oldName = symptom.name; symptom.name = name;
        updateProducts?.(getProducts().map((product) => ({ ...product, symptom_target: product.symptom_target === oldName ? name : product.symptom_target, symptoms: product.symptoms?.map((item) => item.id === symptom.id ? { ...item, name } : item) })));
        return { data: { symptom: copy(symptom) } };
      }
      const match = path.match(/^\/admin\/products\/(\d+)$/);
      const existing = match && getProducts().find((item) => item.id === Number(match[1]));
      if (!existing) fail('Produto não encontrado nesta demonstração.');
      return save(data, existing);
    },
    async delete(path) {
      if (path === '/user/profile') return { data: { message: 'Questionário fictício removido.' } };
      const match = path.match(/^\/admin\/symptoms\/(\d+)$/);
      const symptom = match && taxonomy.symptoms.find((item) => item.id === Number(match[1]));
      if (!symptom) fail('Queixa não encontrada na demonstração.');
      taxonomy.symptoms = taxonomy.symptoms.filter((item) => item.id !== symptom.id);
      updateProducts?.(getProducts().map((product) => ({ ...product, symptom_target: product.symptom_target === symptom.name ? null : product.symptom_target, symptoms: product.symptoms?.filter((item) => item.id !== symptom.id) })));
      return { data: { message: 'Queixa removida somente da demonstração.' } };
    },
  };
}
