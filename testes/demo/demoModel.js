// Dados e funções de demonstração. Nenhum dado deste módulo deve ser usado como registro real.
export const DEMO_VIEWS = ['inicio', 'favoritos', 'carrinho', 'checkout', 'conta', 'pedidos', 'admin', 'distribuidores'];
export const DEMO_SCENARIOS = ['normal', 'vazio', 'sem-estoque', 'pagamento-recusado', 'pago'];
export const DEMO_PERSONAS = ['visitante', 'cliente', 'admin', 'distribuidor'];

export const demoCategories = [
  { id: 11, name: 'Aromas florais', position: 1 },
  { id: 12, name: 'Aromas herbais', position: 2 },
  { id: 13, name: 'Aromas cítricos', position: 3 },
];

export const demoProducts = [
  { id: 101, name: 'Blend Floral', price: 49.9, stock: 15, category_ids: [11, 13], category_id: 11, category_position: 1, sales_count: 12, images: [], short_description: 'Aroma floral de demonstração, sem vínculo com produtos reais.', symptom_target: 'Ansiedade (exemplo fictício)', ingredients: [{ id: 1, name: 'Lavanda', pivot: { percentage: '60%' } }, { id: 2, name: 'Gerânio', pivot: { percentage: '40%' } }] },
  { id: 102, name: 'Blend Jardim', price: 58, stock: 8, category_ids: [11], category_id: 11, category_position: 2, sales_count: 9, images: [], short_description: 'Exemplo fictício para pré-visualizar a página do produto.', symptom_target: 'Ansiedade (exemplo fictício)', ingredients: [{ id: 3, name: 'Gerânio', pivot: { percentage: '100%' } }] },
  { id: 103, name: 'Blend Verde', price: 44.5, stock: 20, category_ids: [12], category_id: 12, category_position: 1, sales_count: 5, images: [], short_description: 'Composição fictícia de notas herbais.', symptom_target: 'Dificuldade para dormir (exemplo fictício)', ingredients: [{ id: 4, name: 'Alecrim', pivot: { percentage: '50%' } }, { id: 5, name: 'Hortelã', pivot: { percentage: '50%' } }] },
  { id: 104, name: 'Blend Brisa', price: 63.9, stock: 4, category_ids: [12], category_id: 12, category_position: 2, sales_count: 6, images: [], short_description: 'Blend fictício criado apenas para testes visuais.', symptom_target: 'Dificuldade para dormir (exemplo fictício)', ingredients: [{ id: 5, name: 'Hortelã', pivot: { percentage: '100%' } }] },
  { id: 105, name: 'Blend Sol', price: 39.9, stock: 10, category_ids: [13], category_id: 13, category_position: 1, sales_count: 20, images: [], short_description: 'Mistura fictícia de notas cítricas.', symptom_target: 'Cansaço (exemplo fictício)', ingredients: [{ id: 6, name: 'Laranja', pivot: { percentage: '100%' } }] },
  { id: 106, name: 'Blend Citrus', price: 54.9, stock: 12, category_ids: [13], category_id: 13, category_position: 2, sales_count: 2, images: [], short_description: 'Produto de exemplo sem finalidade terapêutica declarada.', symptom_target: 'Cansaço (exemplo fictício)', ingredients: [{ id: 7, name: 'Limão', pivot: { percentage: '100%' } }] },
];

export const demoCustomer = {
  id: 900, name: 'Cliente Demonstração', email: 'cliente@example.invalid', role: 'customer', email_verified_at: '2026-01-01T10:00:00.000Z',
  profile: { numero_telefone: '(00) 00000-0000', problema_principal: null },
};
export const demoAdmin = { id: 901, name: 'Administrador Demo', email: 'admin@example.invalid', role: 'admin', email_verified_at: '2026-01-01T10:00:00.000Z' };
export const demoAddress = { recipient_name: 'Cliente Demonstração', phone: '(00) 00000-0000', street: 'Rua Exemplo', number: '123', complement: '', neighborhood: 'Bairro Modelo', city: 'Cidade Fictícia', state: 'MG', postal_code: '00000-000' };
export const demoShipping = [{ id: 'demo-normal', name: 'Entrega padrão (simulação)', company: 'Transportadora Fictícia', price: 14.9, delivery_time: 6 }, { id: 'demo-expressa', name: 'Entrega expressa (simulação)', company: 'Transportadora Fictícia', price: 27.5, delivery_time: 2 }];
const demoOrderBase = { user: { name: demoCustomer.name, email: demoCustomer.email }, shipping_address: demoAddress, payment_status: 'approved', payment_method: 'pix', fulfillment_method: 'delivery' };
export const demoOrders = [
  { ...demoOrderBase, id: 1001, order_number: 'DEMO-1001', status: 'paid', fulfillment_status: 'confirmed', created_at: '2026-10-01T15:00:00Z', shipping_method: 'Entrega padrão (simulação)', shipping_cost: 14.9, total_price: 64.8, items: [{ product_name: 'Blend Floral', quantity: 1, unit_price: 49.9, subtotal: 49.9 }] },
  { ...demoOrderBase, id: 1002, order_number: 'DEMO-1002', status: 'shipped', fulfillment_status: 'shipped', created_at: '2026-10-03T11:00:00Z', shipping_method: 'Entrega expressa (simulação)', shipping_cost: 27.5, total_price: 116.5, items: [{ product_name: 'Blend Verde', quantity: 2, unit_price: 44.5, subtotal: 89 }], tracking_code: 'RASTREIO-FICTICIO' },
  { ...demoOrderBase, id: 1003, order_number: 'DEMO-1003', status: 'paid', fulfillment_method: 'pickup', pickup_contact_name: demoCustomer.name, fulfillment_status: 'confirmed', shipping_address: null, payment_method: 'credit_card', created_at: '2026-10-04T11:00:00Z', shipping_method: 'Retirada em loja (simulação)', shipping_cost: 0, total_price: 107.9, items: [{ product_name: 'Blend Floral', quantity: 1, unit_price: 49.9, subtotal: 49.9 }, { product_name: 'Blend Jardim', quantity: 1, unit_price: 58, subtotal: 58 }] },
  { ...demoOrderBase, id: 1004, order_number: 'DEMO-1004', status: 'pending', fulfillment_status: null, payment_status: 'pending', created_at: '2026-10-05T11:00:00Z', shipping_method: 'Entrega padrão (simulação)', shipping_cost: 14.9, total_price: 54.8, items: [{ product_name: 'Blend Sol', quantity: 1, unit_price: 39.9, subtotal: 39.9 }] },
];

export const currency = (value) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function applyScenario(products, scenario) {
  if (scenario === 'vazio') return [];
  if (scenario === 'sem-estoque') return products.map((item) => ({ ...item, stock: 0 }));
  return products;
}
export function updateCart(cart, product, change) {
  const previous = cart.find((item) => item.id === product.id);
  const amount = Math.min(Math.max(0, (previous?.quantity || 0) + change), Math.max(0, Number(product.stock) || 0));
  if (amount === 0) return cart.filter((item) => item.id !== product.id);
  if (previous) return cart.map((item) => item.id === product.id ? { ...item, quantity: amount } : item);
  return [...cart, { ...product, quantity: amount }];
}
export function cartTotal(cart) {
  return cart.reduce((total, item) => total + Number(item.price) * item.quantity, 0);
}
export function searchDemoProducts(products, query) {
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  return normalized ? products.filter((item) => [item.name, item.short_description, item.symptom_target, ...(item.ingredients || []).map((x) => x.name)].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(normalized))) : products;
}
export function resolveDemoParams(search) {
  const params = new URLSearchParams(search);
  // Links antigos do catálogo abrem a mesma página inicial.
  const view = params.get('view') === 'catalogo' ? 'inicio' : params.get('view');
  return {
    view: DEMO_VIEWS.includes(view) ? view : 'inicio',
    scenario: DEMO_SCENARIOS.includes(params.get('scenario')) ? params.get('scenario') : 'normal',
    persona: DEMO_PERSONAS.includes(params.get('persona')) ? params.get('persona') : 'cliente',
  };
}

export const demoAudienceMetrics = {
  minimum_group_size: 5,
  audience: {
    acquisition: [{ label: 'Instagram', count: 15, percentage: 75 }, { label: 'Indicação de Amigos', count: 5, percentage: 25 }],
    gender: [{ label: 'Feminino', count: 12, percentage: 60 }, { label: 'Masculino', count: 8, percentage: 40 }],
    age: [{ label: '25–34', count: 12, percentage: 60 }, { label: '35–44', count: 8, percentage: 40 }],
  },
  complaint_by_audience: [
    { dimension: 'acquisition', label: 'Instagram', complaint: 'Ansiedade (exemplo fictício)', count: 10 },
    { dimension: 'age', label: '25–34', complaint: 'Ansiedade (exemplo fictício)', count: 7 },
    { dimension: 'gender', label: 'Feminino', complaint: 'Ansiedade (exemplo fictício)', count: 6 },
  ],
};
