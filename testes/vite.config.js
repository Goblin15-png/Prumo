import { fileURLToPath } from 'node:url';
import { defineConfig } from '../frontend/node_modules/vite/dist/node/index.js';
import react from '../frontend/node_modules/@vitejs/plugin-react/dist/index.js';
import tailwindcss from '../frontend/node_modules/@tailwindcss/postcss/dist/index.mjs';

const directory = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: directory('./'),
  publicDir: directory('../frontend/public'),
  envDir: false,
  plugins: [react()],
  resolve: {
    alias: {
      'lucide-react': directory('../frontend/node_modules/lucide-react'),
      axios: directory('../frontend/node_modules/axios'),
      react: directory('../frontend/node_modules/react'),
      'react-dom': directory('../frontend/node_modules/react-dom'),
      '/demo-entry.jsx': directory('./demo/standalone.jsx'),
    },
  },
  css: { postcss: { plugins: [tailwindcss({ base: directory('./') })] } },
  server: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
    fs: { allow: [directory('../frontend'), directory('./')] },
  },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
});
