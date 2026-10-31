// Modelo exclusivo do laboratório visual. Não autentica nem persiste dados.
// DV: Receita Federal, manual-dv-cnpj.pdf (ASCII - 48, módulo 11).
export const normalizeDemoCnpj = (value) => String(value ?? '').trim().toUpperCase().replace(/[.\/\-\s]/g, '');
const digit = (value) => {
  let weight = 2;
  let sum = 0;
  for (let index = value.length - 1; index >= 0; index--) {
    sum += (value.charCodeAt(index) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  return String(remainder < 2 ? 0 : 11 - remainder);
};
export function isValidDemoCnpj(value) {
  const cnpj = normalizeDemoCnpj(value);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const base = cnpj.slice(0, 12);
  const first = digit(base);
  return cnpj === base + first + digit(base + first);
}
const fictionalCnpj = (base) => base + digit(base) + digit(base + digit(base));
export function createDistributorsDemo() {
  return {
    companies: [
      {id:1,name:'Distribuidora Aurora · fictícia',cnpj:fictionalCnpj('DEMO00000001'),status:'approved'},
      {id:2,name:'Distribuidora Horizonte · fictícia',cnpj:fictionalCnpj('DEMO00000002'),status:'pending'},
    ],
    requests: [],
    nextCompanyId: 3,
    nextRequestId: 1,
  };
}
export function registerDemoCompany(state, { name, cnpj }) {
  name = String(name ?? '').trim();
  cnpj = normalizeDemoCnpj(cnpj);
  if (!name || name.length > 180) throw new Error('Informe o nome da empresa, com até 180 caracteres.');
  if (!isValidDemoCnpj(cnpj)) throw new Error('Confira o formato e os dígitos verificadores do CNPJ de exemplo.');
  if (state.companies.some((company) => company.cnpj === cnpj)) throw new Error('Este CNPJ já consta na demonstração.');
  const company = {id:state.nextCompanyId,name,cnpj,status:'pending'};
  return {...state,companies:[...state.companies,company],nextCompanyId:state.nextCompanyId+1};
}
export function reviewDemoCompany(state, persona, companyId, status) {
  if (persona !== 'admin') throw new Error('Selecione o administrador fictício para analisar empresas.');
  const company = state.companies.find((item) => item.id === companyId);
  if (!company || company.status !== 'pending') throw new Error('A empresa precisa estar pendente para análise.');
  if (!['approved','rejected'].includes(status)) throw new Error('Escolha aprovar ou rejeitar.');
  return {...state,companies:state.companies.map((item) => item.id === companyId ? {...item,status} : item)};
}
export function submitDemoDistributorRequest(state, persona, companyId, lines, products) {
  const company = state.companies.find((item) => item.id === companyId);
  if (persona !== 'distribuidor' || company?.status !== 'approved') throw new Error('A solicitação exige um distribuidor fictício aprovado.');
  if (!Array.isArray(lines) || !lines.length) throw new Error('Selecione ao menos um blend e uma quantidade inteira positiva.');
  const selected = new Set();
  const items = lines.map((line) => {
    const product = products.find((item) => item.id === line.product_id && item.is_active !== false && Number(item.stock) > 0);
    if (!product || selected.has(line.product_id)) throw new Error('Escolha produtos disponíveis, sem repetir o mesmo blend.');
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new Error('A quantidade deve ser um número inteiro positivo.');
    selected.add(line.product_id);
    // Apenas solicitação: não cobra, reserva estoque ou presume limites de atacado.
    return {product_id:product.id,product_name:product.name,quantity:line.quantity};
  });
  const request = {id:state.nextRequestId,number:`B2B-DEMO-${state.nextRequestId}`,company_id:companyId,items,status:'received',response:''};
  return {...state,requests:[request,...state.requests],nextRequestId:state.nextRequestId+1};
}
export const demoRequestsForCompany = (state, companyId) => state.requests.filter((request) => request.company_id === companyId);
export function updateDemoDistributorRequest(state, persona, requestId, status, response) {
  if (persona !== 'admin') throw new Error('Selecione o administrador fictício para tratar solicitações.');
  if (!state.requests.some((request) => request.id === requestId)) throw new Error('Solicitação não encontrada.');
  if (!['received','reviewing','answered'].includes(status)) throw new Error('Situação de solicitação inválida.');
  response = String(response ?? '').trim();
  if (response.length > 2000 || (status === 'answered' && !response)) throw new Error('Para responder, escreva uma mensagem de até 2.000 caracteres.');
  return {...state,requests:state.requests.map((request) => request.id === requestId ? {...request,status,response} : request)};
}
