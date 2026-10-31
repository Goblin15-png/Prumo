import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBase = env.VITE_API_BASE_URL || (mode === 'production' ? '/api/v1' : 'http://localhost:8000/api/v1');
  const apiOrigin = apiBase.startsWith('/') ? null : new URL(apiBase).origin;
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "script-src 'self' https://connect.facebook.net https://www.googletagmanager.com https://sdk.mercadopago.com https://http2.mlstatic.com https://www.mercadopago.com.br https://www.mercadopago.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "frame-src 'self' https://www.googletagmanager.com https://sdk.mercadopago.com https://www.mercadopago.com.br https://www.mercadopago.com https://secure-fields.mercadopago.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: https: https://www.facebook.com https://connect.facebook.net https://*.fbcdn.net",
    `connect-src 'self' ${[apiOrigin, 'https://connect.facebook.net', 'https://www.facebook.com', 'https://www.googletagmanager.com', 'https://www.google.com', 'https://api.mercadopago.com', 'https://api.mercadolibre.com', 'https://sdk.mercadopago.com', 'https://http2.mlstatic.com', 'https://www.mercadopago.com.br', 'https://www.mercadopago.com'].filter(Boolean).join(' ')}`,
  ].join('; ');

  return {
    plugins: [
      react(),
      {
        name: 'production-content-security-policy',
        apply: 'build',
        transformIndexHtml: {
          order: 'pre',
          handler(html) {
            return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">`);
          },
        },
      },
    ],
    server: {
      port: 3000,
      open: true,
    },
  };
});
