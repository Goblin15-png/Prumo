import { demoProducts } from './demoModel.js';

// Adaptador em memória: sem APIs, armazenamento persistente ou ações externas.
export function createDemoDistributorWorkspace({ empty = false, error = false, getProducts = () => demoProducts } = {}) {
  const clone = (value) => structuredClone(value);
  const timestamp = '2026-11-01T12:00:00Z';
  let next = 20;
  let inventory = empty ? [] : [
    { id: 1, product_id: 101, product_name: 'Blend Floral', quantity: 4, minimum_quantity: 6 },
    { id: 2, product_id: 103, product_name: 'Blend Verde', quantity: 18, minimum_quantity: 5 },
  ];
  let plans = empty ? [] : [{ id: 3, product_id: 101, product_name: 'Blend Floral', quantity: 24, planned_date: '2026-11-15', notes: 'Reposição fictícia para a próxima quinzena.' }];
  let tickets = empty ? [] : [{ id: 4, subject: 'Dúvida sobre reposição (exemplo)', status: 'open', distributor_name: 'Distribuidor Demonstração', created_at: timestamp, updated_at: timestamp }];
  const messages = empty ? {} : { 4: [
    { id: 5, body: 'Como posso planejar a próxima compra de blends?', from_admin: false, created_at: timestamp },
    { id: 6, body: 'Você pode anotar os produtos e quantidades em Próximas compras.', from_admin: true, created_at: timestamp },
  ] };
  const check = () => { if (error) throw new Error('Falha simulada.'); };
  const find = (id) => {
    check();
    const ticket = tickets.find((item) => item.id === id);
    if (!ticket) throw new Error('Chamado inexistente.');
    return ticket;
  };
  const service = {
    workspace: async () => { check(); return clone({ inventory, plans, products: getProducts().filter((product) => product.is_active !== false).map(({ id, name }) => ({ id, name })) }); },
    save: async (kind, data) => {
      check();
      const product = getProducts().find((product) => String(product.id) === String(data.product_id) && product.is_active !== false);
      if (!product) throw new Error('Selecione um blend ativo.');
      const rows = kind === 'inventory' ? inventory : plans;
      const item = { ...clone(data), product_id: product.id, product_name: product.name, id: data.id || next++ };
      const index = rows.findIndex((row) => row.id === item.id);
      if (index < 0) rows.push(item); else rows[index] = item;
      return { item: clone(item) };
    },
    remove: async (kind, id) => {
      check();
      if (kind === 'inventory') inventory = inventory.filter((item) => item.id !== id);
      else plans = plans.filter((item) => item.id !== id);
    },
  };
  const support = (administrative) => ({
    list: async (status = '', page = 1) => {
      check();
      const filtered = tickets.filter((ticket) => !status || ticket.status === status).slice().reverse();
      return clone({ data: filtered.slice((page - 1) * 20, page * 20), last_page: Math.max(1, Math.ceil(filtered.length / 20)) });
    },
    show: async (id) => clone({ ticket: find(id), messages: messages[id] || [] }),
    create: async ({ subject, body }) => {
      check();
      const id = next++;
      tickets.push({ id, subject, status: 'open', distributor_name: 'Distribuidor Demonstração', created_at: timestamp, updated_at: timestamp });
      messages[id] = [{ id: next++, body, from_admin: false, created_at: timestamp }];
      return { id };
    },
    reply: async (id, body) => {
      const ticket = find(id);
      if (ticket.status === 'closed') throw new Error('Chamado encerrado.');
      messages[id].push({ id: next++, body, from_admin: administrative, created_at: timestamp });
    },
    status: async (id, status) => {
      if (!administrative) throw new Error('Acesso negado.');
      find(id).status = status;
    },
  });
  return { service, distributorSupport: support(false), adminSupport: support(true) };
}
