// Projeção local da organização definida no gerenciador de categorias.
export function groupCatalog(products, categories) {
  const visible = products.filter((product) => product.is_active !== false);
  const activeCategories = categories.filter((category) => category.active !== false);
  const ids = (product) => (product.category_ids ?? product.categories?.map((category) => category.id) ?? (product.category_id ? [product.category_id] : [])).map(Number);
  const position = (product, id) => Number(product.category_positions?.[id]
    ?? product.categories?.find((category) => Number(category.id) === Number(id))?.pivot?.sort_order
    ?? product.category_position ?? 0);
  const sections = activeCategories.map((category) => ({
    key: `category-${category.id}`,
    title: category.name,
    products: visible.filter((product) => ids(product).includes(Number(category.id)))
      .sort((a, b) => position(a, category.id) - position(b, category.id) || a.id - b.id),
  })).filter((section) => section.products.length > 0);
  const categorized = new Set(sections.flatMap((section) => section.products.map((product) => product.id)));
  const otherProducts = visible.filter((product) => !categorized.has(product.id));
  if (otherProducts.length) sections.push({ key: 'unassigned', title: activeCategories.length ? 'Outros produtos' : 'Todos os produtos', products: otherProducts });
  return sections;
}
