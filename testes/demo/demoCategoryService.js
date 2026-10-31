// Adaptador local do gerenciador de categorias; sem cliente HTTP ou persistência externa.
export function createDemoCategoryService(getState, commitCategories, commitProducts) {
  const ids = (product) => product.category_ids ?? product.categories?.map((category) => category.id) ?? (product.category_id ? [product.category_id] : []);
  const position = (product, categoryId) => product.category_positions?.[categoryId] ?? product.category_position ?? 0;
  const copy = (value) => structuredClone(value);
  const fail = (message) => { throw Object.assign(new Error(message), { response: { data: { message } } }); };
  const linked = (categoryId) => getState().products.filter((product) => ids(product).includes(categoryId)).sort((a, b) => position(a, categoryId) - position(b, categoryId) || a.id - b.id);
  const assignIds = (product, categoryIds) => ({ ...product, category_ids: categoryIds, category_id: categoryIds[0] ?? null });
  const category = (id) => getState().categories.find((item) => item.id === id) || fail('Categoria não encontrada na demonstração.');
  const validateName = (name, id = null) => {
    name = name?.trim();
    if (!name || name.length > 100) fail('Informe um nome de categoria com até 100 caracteres.');
    if (getState().categories.some((item) => item.id !== id && item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) fail('Já existe uma categoria com esse nome.');
    return name;
  };
  const request = async (method, path, data = {}) => {
    const { categories, products } = getState();
    if (method === 'get' && path === '/admin/categories') {
      return { data: copy({
        categories: categories.map((item) => ({ ...item, products: linked(item.id) })),
        products: products.map((product) => ({ ...product, categories: categories.filter((item) => ids(product).includes(item.id)).map((item) => ({ ...item, pivot: { sort_order: position(product, item.id) } })) })),
      }) };
    }
    if (method === 'post' && path === '/admin/categories') {
      const item = { id: Math.max(0, ...categories.map((entry) => entry.id)) + 1, name: validateName(data.name), active: true };
      commitCategories([...categories, item]);
      return { data: { category: item } };
    }
    if (method === 'put' && path === '/admin/categories/order') {
      if (data.category_ids.length !== categories.length || new Set(data.category_ids).size !== categories.length) fail('Selecione todas as categorias para ordenar.');
      commitCategories(data.category_ids.map((id) => category(id)));
      return { data: {} };
    }
    const match = path.match(/^\/admin\/categories\/(\d+)(?:\/products(?:\/(order|\d+))?)?$/);
    if (!match) fail('Operação indisponível nesta demonstração.');
    const id = Number(match[1]);
    category(id);
    if (method === 'put' && path === `/admin/categories/${id}`) {
      const name = validateName(data.name, id);
      commitCategories(categories.map((item) => item.id === id ? { ...item, name } : item));
      return { data: {} };
    }
    if (method === 'delete' && path === `/admin/categories/${id}`) {
      commitCategories(categories.filter((item) => item.id !== id));
      commitProducts(products.map((product) => assignIds(product, ids(product).filter((categoryId) => categoryId !== id))));
      return { data: {} };
    }
    if (method === 'post' && path === `/admin/categories/${id}/products`) {
      let nextPosition = Math.max(-1, ...linked(id).map((product) => position(product, id))) + 1;
      commitProducts(products.map((product) => data.product_ids.includes(product.id) && !ids(product).includes(id)
        ? { ...assignIds(product, [...ids(product), id]), category_positions: { ...product.category_positions, [id]: nextPosition++ } } : product));
      return { data: {} };
    }
    if (method === 'put' && match[2] === 'order') {
      const current = linked(id).map((product) => product.id);
      if (data.product_ids.length !== current.length || new Set(data.product_ids).size !== current.length || data.product_ids.some((productId) => !current.includes(productId))) fail('Selecione todos os produtos desta categoria para ordenar.');
      commitProducts(products.map((product) => current.includes(product.id) ? { ...product, category_positions: { ...product.category_positions, [id]: data.product_ids.indexOf(product.id) } } : product));
      return { data: {} };
    }
    if (method === 'delete' && match[2] && match[2] !== 'order') {
      commitProducts(products.map((product) => product.id === Number(match[2]) ? assignIds(product, ids(product).filter((categoryId) => categoryId !== id)) : product));
      return { data: {} };
    }
    fail('Operação indisponível nesta demonstração.');
  };
  return Object.fromEntries(['get', 'post', 'put', 'delete'].map((method) => [method, (path, data) => request(method, path, data)]));
}
