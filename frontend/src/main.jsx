import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './components/ThemeProvider';
const App = lazy(() => window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')
    ? import('./AdminApp.jsx')
    : import('./App.jsx'));
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider><Suspense fallback={<p role="status" className="p-8">Carregando…</p>}><App /></Suspense></ThemeProvider>
  </React.StrictMode>,
);
