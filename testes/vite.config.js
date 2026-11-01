import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { defineConfig } from '../frontend/node_modules/vite/dist/node/index.js';
import tailwindcss from '../frontend/node_modules/@tailwindcss/postcss/dist/index.mjs';

const directory = (path) => fileURLToPath(new URL(path, import.meta.url));
// Carregar o plugin na sua localização original preserva a resolução dos
// imports dinâmicos (react-refresh/babel) nas dependências do frontend.
const frontendRequire = createRequire(new URL('../frontend/package.json', import.meta.url));
const reactPluginUrl = pathToFileURL(frontendRequire.resolve('@vitejs/plugin-react')).href;
const { default: react } = await import(reactPluginUrl);

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
