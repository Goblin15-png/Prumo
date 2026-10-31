import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000/api/v1' : '/api/v1');

const api = axios.create({
  baseURL,
  withCredentials: true,
  withXSRFToken: true,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

export const adminApi = axios.create({
  baseURL,
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'ADMIN-XSRF-TOKEN',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
});

export const ensureAdminCsrfCookie = () => adminApi.get('/admin/auth/csrf-cookie');

export const ensureCsrfCookie = () => {
  const csrfUrl = new URL('/sanctum/csrf-cookie', baseURL.startsWith('http') ? baseURL : window.location.origin);
  return api.get(csrfUrl.toString());
};

export const userProfileService = {
  getProfile: () => api.get('/user/profile'),
  saveProfile: (data) => api.post('/user/profile', data),
  deleteProfile: () => api.delete('/user/profile'),
  getRecommendations: () => api.get('/recommendations'),
};

export default api;
