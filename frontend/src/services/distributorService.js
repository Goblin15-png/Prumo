import api, { adminApi, ensureCsrfCookie, ensureAdminCsrfCookie } from './api';

export function createDistributorService(client = api, csrf = ensureCsrfCookie) {
  const write = async (method, url, data) => {
    await csrf();
    return (await client[method](url, data)).data;
  };
  return {
    workspace: async () => (await client.get('/distributor/workspace')).data,
    save: (kind, data) => write(data.id ? 'put' : 'post', `/distributor/${kind}${data.id ? `/${data.id}` : ''}`, data),
    remove: (kind, id) => write('delete', `/distributor/${kind}/${id}`),
  };
}

export function createSupportService(administrative = false) {
  const client = administrative ? adminApi : api;
  const csrf = administrative ? ensureAdminCsrfCookie : ensureCsrfCookie;
  const base = administrative ? '/admin/support' : '/distributor/support';
  const write = async (method, path, data) => {
    await csrf();
    return (await client[method](base + path, data)).data;
  };
  return {
    list: async (status = '', page = 1) => (await client.get(base, { params: { status: status || undefined, page } })).data,
    show: async (id) => (await client.get(`${base}/${id}`)).data,
    create: (data) => write('post', '', data),
    reply: (id, body) => write('post', `/${id}/messages`, { body }),
    status: (id, status) => write('patch', `/${id}/status`, { status }),
  };
}

export const distributorService = createDistributorService();
export const distributorSupportService = createSupportService();
export const adminSupportService = createSupportService(true);
