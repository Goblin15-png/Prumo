import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import AdminDashboard from './components/AdminDashboard';
import AdminProductForm from './components/AdminProductForm';
import RegisterQuestionnaire from './components/RegisterQuestionnaire';
import ThemeToggle from './components/ThemeToggle';
import { adminApi, ensureAdminCsrfCookie } from './services/api';

const accessMessage = 'Sua sessão administrativa expirou ou seu acesso foi alterado. Entre novamente para continuar.';

export default function AdminApp() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const checkInFlight = useRef(false);

  const clearAccess = useCallback((message = '') => {
    generation.current += 1;
    setUser(null);
    setAuthOpen(false);
    setFormOpen(false);
    setEditing(null);
    setError(message);
  }, []);

  const checkAccess = useCallback(async () => {
    if (checkInFlight.current) return;
    const current = generation.current;
    checkInFlight.current = true;
    setChecking(true);
    try {
      const { data } = await adminApi.get('/admin/auth/me');
      if (current === generation.current) {
        setUser(data.user);
        setError('');
      }
    } catch (requestError) {
      if (current !== generation.current) return;
      if ([401, 403, 419].includes(requestError.response?.status)) {
        clearAccess(requestError.response.status === 401 ? '' : requestError.response.data?.message || accessMessage);
      } else {
        setError('Não foi possível verificar o acesso. Confira sua conexão e tente novamente.');
      }
    } finally {
      checkInFlight.current = false;
      setChecking(false);
      setLoading(false);
    }
  }, [clearAccess]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // A recusa de uma operação não é o mesmo que expiração da sessão.
  // Ignora respostas antigas após sair, trocar de conta ou desmontar o painel.
  useLayoutEffect(() => {
    if (!user) return;
    let active = true;
    const current = generation.current;
    const interceptor = adminApi.interceptors.response.use(undefined, (requestError) => {
      const status = requestError.response?.status;
      const code = requestError.response?.data?.code;
      if (active && current === generation.current && (
        [401, 419].includes(status) || (status === 403 && ['ADMIN_REAUTH_REQUIRED', 'ADMIN_ACCESS_CHANGED'].includes(code))
      )) clearAccess(accessMessage);
      return Promise.reject(requestError);
    });
    return () => { active = false; adminApi.interceptors.response.eject(interceptor); };
  }, [user, clearAccess]);

  useEffect(() => {
    if (!user) return;
    const verify = () => { if (document.visibilityState === 'visible') checkAccess(); };
    const interval = window.setInterval(verify, 60_000);
    window.addEventListener('focus', verify);
    document.addEventListener('visibilitychange', verify);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', verify);
      document.removeEventListener('visibilitychange', verify);
    };
  }, [!!user, checkAccess]);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setError('');
    try {
      await ensureAdminCsrfCookie();
      await adminApi.post('/admin/auth/logout');
      clearAccess();
    } catch (requestError) {
      if (requestError.response?.status === 401) clearAccess();
      else setError('Não foi possível confirmar o encerramento da sessão administrativa. Tente novamente.');
    } finally {
      setLoggingOut(false);
    }
  };

  return <div className="min-h-screen bg-canvas text-ink">
    <a href="#admin-conteudo" className="sr-only focus:not-sr-only focus:block focus:bg-surface focus:p-3">Ir para o conteúdo do painel</a>
    <header className="flex flex-wrap items-center justify-between gap-4 bg-[#5E1A2B] px-5 py-5 text-white">
      <a href="/admin" className="font-serif text-lg font-bold"><span className="block text-xs tracking-widest">PRUMA ESSENTIAL</span>Painel Lojista</a>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <a href="/" className="underline">Ir para a loja</a>
        <ThemeToggle />
        {user && <><span className="min-w-0 break-words">{user.name}<span className="block text-xs text-white/80">{user.admin_profile === 'technical' ? 'Administrador técnico' : user.admin_profile === 'owner' ? 'Administrador proprietário' : 'Perfil não atribuído'}</span></span><button type="button" disabled={loggingOut} onClick={logout} className="rounded-lg border border-white/40 px-3 py-2 disabled:opacity-50">{loggingOut ? 'Saindo…' : 'Sair do painel'}</button></>}
      </div>
    </header>
    {error && <div role="alert" className="mx-auto max-w-3xl space-y-2 p-5 text-danger-ink"><p>{error}</p><button type="button" disabled={checking} onClick={checkAccess} className="rounded-lg border border-current px-3 py-2 text-sm disabled:opacity-50">{checking ? 'Verificando…' : 'Verificar acesso novamente'}</button></div>}
    <main id="admin-conteudo" tabIndex={-1}>
      {loading ? <p role="status" className="p-8">Verificando acesso…</p> : user ? <>
        <AdminDashboard user={user} catalogRefreshKey={refresh}
          onOpenProductForm={() => { setEditing(null); setFormOpen(true); }}
          onEditProduct={(product) => { setEditing(product); setFormOpen(true); }}
          onProductDeleted={() => setRefresh((value) => value + 1)} />
        {formOpen && <AdminProductForm key={editing?.id || 'new-product'} service={adminApi} existingProduct={editing}
          isOpen={user.admin_permissions?.includes(editing ? 'products.update' : 'products.create')}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onProductSaved={() => setRefresh((value) => value + 1)} />}
      </> : <section className="mx-auto max-w-lg space-y-4 px-5 py-14">
        <h1 className="font-serif text-2xl font-bold text-brand-ink">Administração da loja</h1>
        <p className="text-sm">Acesso exclusivo para responsáveis autorizados, com conta individual e autenticação em duas etapas.</p>
        <button type="button" onClick={() => { generation.current += 1; setAuthOpen(true); }} className="rounded-xl bg-[#5E1A2B] px-5 py-3 text-sm font-semibold text-white">Acessar painel</button>
        <p className="text-xs text-ink-soft">Não há cadastro público de administradores. Solicite sua conta individual ao responsável técnico.</p>
      </section>}
    </main>
    {authOpen && <RegisterQuestionnaire administrative isOpen onClose={() => setAuthOpen(false)}
      onAuthSuccess={(authenticatedUser) => { generation.current += 1; setUser(authenticatedUser); setAuthOpen(false); setError(''); }} />}
  </div>;
}
