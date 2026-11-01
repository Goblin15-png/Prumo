import React, { useEffect, useState } from 'react';
import SupportPanel from './components/SupportPanel';
import { adminSupportService } from './services/distributorService';
import AdminDashboard from './components/AdminDashboard';
import AdminProductForm from './components/AdminProductForm';
import RegisterQuestionnaire from './components/RegisterQuestionnaire';
import ThemeToggle from './components/ThemeToggle';
import { adminApi, ensureAdminCsrfCookie } from './services/api';

export default function AdminApp() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState('dashboard');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    adminApi.get('/admin/auth/me').then(({ data }) => setUser(data.user)).catch((error) => {
      if (![401, 403].includes(error.response?.status)) setError('Não foi possível verificar o acesso. Recarregue a página para tentar novamente.');
    }).finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    setError('');
    try {
      await ensureAdminCsrfCookie();
      await adminApi.post('/admin/auth/logout');
      setUser(null);
      setView('dashboard');
      setFormOpen(false);
      setEditing(null);
    } catch (error) {
      if (error.response?.status === 401) setUser(null);
      else setError('Não foi possível encerrar a sessão administrativa. Tente novamente.');
    }
  };

  return <div className="min-h-screen bg-canvas text-ink">
    <header className="flex flex-wrap items-center justify-between gap-4 bg-[#5E1A2B] px-5 py-5 text-white">
      <a href="/admin" className="font-serif text-lg font-bold">Painel Lojista</a>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <a href="/" className="underline">Ir para a loja</a>
        <ThemeToggle />
        {user && <><span>{user.name}</span><button type="button" onClick={logout} className="rounded-lg border border-white/40 px-3 py-2">Sair do painel</button></>}
      </div>
    </header>
    {error && <p role="alert" className="mx-auto max-w-3xl p-5 text-danger-ink">{error}</p>}
    {loading ? <p role="status" className="p-8">Verificando acesso…</p> : user ? <>
      <nav aria-label="Painel administrativo" className="mx-auto flex max-w-7xl gap-3 px-5 pt-6">
        <button type="button" aria-pressed={view === 'dashboard'} onClick={() => setView('dashboard')} className="rounded-xl border border-line px-4 py-2 text-sm">Visão geral</button>
        {user.admin_permissions?.includes('support.view') && <button type="button" aria-pressed={view === 'support'} onClick={() => setView('support')} className="rounded-xl bg-brand-ink px-4 py-2 text-sm text-white">Suporte</button>}
      </nav>
      {view === 'support' && user.admin_permissions?.includes('support.view') ? <main className="mx-auto max-w-7xl px-5 py-8"><SupportPanel key={user.id} service={adminSupportService} administrative canReply={user.admin_permissions.includes('support.reply')} canManage={user.admin_permissions.includes('support.manage')} /></main> : <AdminDashboard user={user} catalogRefreshKey={refresh}
        onOpenProductForm={() => { setEditing(null); setFormOpen(true); }}
        onEditProduct={(product) => { setEditing(product); setFormOpen(true); }}
        onProductDeleted={() => setRefresh((value) => value + 1)} />}
      <AdminProductForm key={editing?.id || 'new-product'} service={adminApi} existingProduct={editing}
        isOpen={formOpen && user.admin_permissions?.includes(editing ? 'products.update' : 'products.create')}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onProductSaved={() => setRefresh((value) => value + 1)} />
    </> : <main className="mx-auto max-w-lg space-y-4 px-5 py-14">
      <h1 className="font-serif text-2xl font-bold text-brand-ink">Administração da loja</h1>
      <p className="text-sm">Acesso exclusivo para responsáveis autorizados, com conta individual e autenticação em duas etapas.</p>
      <button type="button" onClick={() => setAuthOpen(true)} className="rounded-xl bg-[#5E1A2B] px-5 py-3 text-sm font-semibold text-white">Acessar painel</button>
    </main>}
    <RegisterQuestionnaire administrative isOpen={authOpen} onClose={() => setAuthOpen(false)}
      onAuthSuccess={(user) => { setUser(user); setAuthOpen(false); setError(''); }} />
  </div>;
}
