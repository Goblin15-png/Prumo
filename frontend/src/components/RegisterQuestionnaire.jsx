import React, { useEffect, useState } from 'react';
import api, { ensureCsrfCookie, adminApi, ensureAdminCsrfCookie } from '../services/api';
import { Sparkles, Lock, Mail, User, Eye, EyeOff } from 'lucide-react';

export default function RegisterQuestionnaire({ isOpen, onClose, onAuthSuccess, onRegisterSuccess, onResetComplete, administrative = false }) {
  const authApi = administrative ? adminApi : api;
  const authCsrf = administrative ? ensureAdminCsrfCookie : ensureCsrfCookie;
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [isResetMode, setIsResetMode] = useState(window.location.pathname === '/reset-password');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [noticeMessage, setNoticeMessage] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [twoFactorMode, setTwoFactorMode] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorSecret, setTwoFactorSecret] = useState('');
  const [twoFactorUri, setTwoFactorUri] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [authenticatedUser, setAuthenticatedUser] = useState(null);
  const [resetToken] = useState(() => new URLSearchParams(window.location.hash.slice(1) || window.location.search).get('token'));
  const [resetEmail] = useState(() => new URLSearchParams(window.location.hash.slice(1) || window.location.search).get('email') || '');
  // O cadastro da conta coleta apenas os dados necessários para login.
  const [formData, setFormData] = useState({
    name: '',
    email: resetEmail,
    password: '',
  });

  useEffect(() => {
    if (window.location.pathname === '/reset-password') {
      window.history.replaceState({}, '', '/reset-password');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoginMode(true);
    setIsForgotMode(false);
    setErrorMessage(null);
    setNoticeMessage('');
    setTwoFactorMode(null);
    setTwoFactorCode('');
    setTwoFactorSecret('');
    setTwoFactorUri('');
    setRecoveryCodes([]);
    setAuthenticatedUser(null);
    setFormData((current) => ({ ...current, password: '' }));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    setErrorMessage(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isLoginMode && !isForgotMode && !twoFactorMode && formData.password !== passwordConfirmation) {
      setErrorMessage('As senhas não conferem. Verifique e tente novamente.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      if (twoFactorMode === 'setup') {
        await authCsrf();
        const res = await authApi.post('/admin/auth/two-factor/confirm-setup', { code: twoFactorCode });
        setAuthenticatedUser(res.data.user);
        setRecoveryCodes(res.data.recovery_codes || []);
        setTwoFactorMode(null);
        return;
      }

      if (twoFactorMode === 'verify') {
        await authCsrf();
        const res = await authApi.post('/admin/auth/two-factor/verify', { code: twoFactorCode });
        if (onAuthSuccess) onAuthSuccess(res.data.user);
        onClose();
        return;
      }

      if (isForgotMode) {
        await ensureCsrfCookie();
        await api.post('/password/forgot', { email: formData.email });
        setNoticeMessage('Se o endereço puder receber recuperação, enviaremos as instruções.');
        return;
      }

      if (isResetMode) {
        await ensureCsrfCookie();
        await api.post('/password/reset', {
          token: resetToken,
          email: formData.email || resetEmail,
          password: formData.password,
          password_confirmation: passwordConfirmation,
        });
        setNoticeMessage('Senha redefinida. Entre com a nova senha.');
        setIsResetMode(false);
        setIsLoginMode(true);
        window.history.replaceState({}, '', '/');
        if (onResetComplete) onResetComplete();
        return;
      }

      if (isLoginMode) {
        // Fluxo de Login
        await authCsrf();
        const res = await authApi.post(administrative ? '/admin/auth/login' : '/login', {
          email: formData.email,
          password: formData.password,
        });

        if (res.data.requires_password_reset) {
          setIsForgotMode(true);
          setNoticeMessage('Esta conta administrativa precisa redefinir a senha. Solicite o link de recuperação enviado ao email cadastrado.');
          return;
        }

        if (res.data.requires_two_factor_setup || res.data.requires_two_factor) {
          setTwoFactorMode(res.data.requires_two_factor_setup ? 'setup' : 'verify');
          setTwoFactorSecret(res.data.secret || '');
          setTwoFactorUri(res.data.otpauth_url || '');
          setTwoFactorCode('');
          setErrorMessage(null);
          return;
        }

        if (onAuthSuccess) onAuthSuccess(res.data.user);
        onClose();
      } else {
        // O questionário opcional é oferecido logo após a criação da conta.
        await ensureCsrfCookie();
        const res = await api.post('/register', {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          password_confirmation: passwordConfirmation,
        });

        if (onRegisterSuccess) {
          onRegisterSuccess(res.data.user);
        } else {
          if (onAuthSuccess) onAuthSuccess(res.data.user);
          onClose();
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Falha na comunicação com o servidor botânico.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-canvas text-ink rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-8 border border-success-ink/10 my-8">
        
        {/* Cabeçalho */}
        <div className="text-center mb-6">
          <span className="text-[10px] uppercase tracking-widest text-brand-ink font-bold bg-brand-ink/10 px-3 py-1 rounded-full">
            {isForgotMode ? 'Recuperação de senha' : isResetMode ? 'Nova senha' : administrative ? 'Acesso administrativo' : isLoginMode ? 'Acessar Conta' : 'Cadastro de cliente'}
          </span>
          <h2 className="text-2xl font-serif text-brand-ink mt-3 font-bold">
            {isForgotMode ? 'Recupere seu acesso' : isResetMode ? 'Defina uma nova senha' : administrative ? 'Entrar no painel' : isLoginMode ? 'Bem-vindo de Volta' : 'Crie sua conta'}
          </h2>
          <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">
            {isForgotMode
              ? 'Informe seu email. Se a conta puder receber recuperação, enviaremos as instruções.'
              : isResetMode
              ? 'Escolha uma senha com pelo menos 12 caracteres.'
              : administrative
              ? 'Use sua conta administrativa individual. O acesso exige autenticação em duas etapas.'
              : isLoginMode
              ? 'Informe seu email e senha para acompanhar seus pedidos e recomendações.'
              : 'Use nome, email e senha para criar a conta. Depois você escolhe se quer responder o questionário opcional.'}
          </p>
        </div>

        {noticeMessage && <div role="status" className="mb-4 rounded-xl border border-success-line bg-success-soft p-3 text-xs text-success-ink">{noticeMessage}</div>}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-danger-soft text-danger-ink text-xs border border-danger-line">
            {errorMessage}
          </div>
        )}

        {recoveryCodes.length > 0 && (
          <div className="space-y-4 rounded-2xl border border-warning-line-strong bg-warning-soft p-4 text-sm text-warning-ink">
            <h3 className="font-bold">Guarde seus códigos de recuperação</h3>
            <p className="text-xs">Cada código pode ser usado uma vez. Eles não serão exibidos novamente.</p>
            <ul className="grid grid-cols-2 gap-2 font-mono text-xs">
              {recoveryCodes.map((code) => <li key={code} className="rounded bg-surface p-2">{code}</li>)}
            </ul>
            <button type="button" onClick={() => { if (onAuthSuccess) onAuthSuccess(authenticatedUser); setRecoveryCodes([]); onClose(); }} className="w-full rounded-xl bg-[#5E1A2B] py-2.5 text-xs font-semibold text-white">
              Guardei os códigos e continuar
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" hidden={recoveryCodes.length > 0}>
          
          {/* Campos Básicos de Conta */}
          {!isLoginMode && !isForgotMode && !isResetMode && (
            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">
                Nome Completo *
              </label>
              <div className="relative">
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Ex: Maria Clara Silva"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full bg-surface border border-line-strong rounded-xl pl-9 pr-3 py-2 text-xs focus:ring-2 focus:ring-brand-ink outline-none"
                />
                <User className="w-4 h-4 text-ink-faint absolute left-3 top-2.5" />
              </div>
            </div>
          )}

          <div hidden={!!twoFactorMode}>
            <label className="block text-xs font-semibold text-ink-secondary mb-1">
              Email *
            </label>
            <div className="relative">
              <input
                type="email"
                name="email"
                required={!twoFactorMode}
                placeholder="seuemail@exemplo.com"
                value={formData.email}
                onChange={handleChange}
                className="w-full bg-surface border border-line-strong rounded-xl pl-9 pr-3 py-2 text-xs focus:ring-2 focus:ring-brand-ink outline-none"
              />
              <Mail className="w-4 h-4 text-ink-faint absolute left-3 top-2.5" />
            </div>
          </div>

          {!isForgotMode && (
          <div hidden={!!twoFactorMode}>
            <label className="block text-xs font-semibold text-ink-secondary mb-1">
              {isResetMode ? 'Nova senha *' : 'Senha *'}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                required={!twoFactorMode}
                autoComplete={isResetMode ? 'new-password' : isLoginMode ? 'current-password' : 'new-password'}
                minLength={isLoginMode ? undefined : 12}
                placeholder={isLoginMode ? 'Sua senha' : 'Mínimo 12 caracteres'}
                value={formData.password}
                onChange={handleChange}
                className="w-full bg-surface border border-line-strong rounded-xl pl-9 pr-10 py-2 text-xs focus:ring-2 focus:ring-brand-ink outline-none"
              />
              <Lock className="w-4 h-4 text-ink-faint absolute left-3 top-2.5" />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showPassword}
                className="absolute right-3 top-2 text-ink-soft hover:text-brand-ink"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          )}

          {(isResetMode || (!isLoginMode && !isForgotMode)) && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">{isResetMode ? 'Confirme a nova senha *' : 'Confirme a senha *'}</label>
              <div className="relative">
                <input
                  type={showPasswordConfirmation ? 'text' : 'password'}
                  required={!twoFactorMode}
                  minLength={12}
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  onChange={(e) => { setPasswordConfirmation(e.target.value); setErrorMessage(null); }}
                  className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 pr-10 text-xs outline-none focus:ring-2 focus:ring-brand-ink"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordConfirmation((visible) => !visible)}
                  aria-label={showPasswordConfirmation ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}
                  aria-pressed={showPasswordConfirmation}
                  className="absolute right-3 top-2 text-ink-soft hover:text-brand-ink"
                >
                  {showPasswordConfirmation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {twoFactorMode && (
            <div className="space-y-3 rounded-2xl border border-success-ink/15 bg-success-soft/50 p-4">
              {twoFactorMode === 'setup' ? (
                <>
                  <p className="text-xs font-semibold text-ink">Configure um aplicativo autenticador e informe o código de 6 dígitos.</p>
                  <p className="text-xs text-ink-muted">No aplicativo autenticador, adicione uma conta usando a chave abaixo e escolha a opção baseada em tempo. Depois, digite aqui o código gerado pelo aplicativo.</p>
                  <div><span className="block text-[10px] font-bold uppercase text-ink-soft">Chave de configuração</span><code className="mt-1 block break-all rounded-lg bg-surface p-2 text-xs">{twoFactorSecret}</code></div>
                  <details className="text-[11px] text-ink-muted"><summary className="cursor-pointer font-semibold">Ver endereço otpauth</summary><code className="mt-2 block break-all rounded-lg bg-surface p-2">{twoFactorUri}</code></details>
                </>
              ) : <><p className="text-xs font-semibold text-ink">Digite o código do aplicativo autenticador ou um código de recuperação.</p><p className="text-xs text-ink-muted">Abra a conta da loja no seu autenticador. O código de 6 dígitos muda a cada 30 segundos.</p></>}
              <input type="text" required inputMode={twoFactorMode === 'setup' ? 'numeric' : 'text'} autoComplete="one-time-code" maxLength={32} value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.trim())} placeholder={twoFactorMode === 'setup' ? '000000' : 'Código de autenticação'} className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-center font-mono text-sm tracking-widest outline-none focus:ring-2 focus:ring-brand-ink" />
            </div>
          )}

          {/* Botões de Ação */}
          <div className="pt-4 flex flex-col gap-2.5">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#5E1A2B] hover:bg-[#4A1422] text-white py-2.5 rounded-xl font-semibold text-xs tracking-wider uppercase transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {loading
                ? 'Processando...'
                : twoFactorMode === 'setup'
                ? 'Ativar 2FA e entrar'
                : twoFactorMode === 'verify'
                ? 'Verificar código'
                : isResetMode
                ? 'Redefinir senha'
                : isForgotMode
                ? 'Enviar instruções'
                : isLoginMode
                ? administrative ? 'Entrar no painel' : 'Entrar no Pruma Essential'
                : 'Criar conta'}
            </button>

            <button
              type="button"
              onClick={() => { setNoticeMessage(''); setIsForgotMode(false); setIsLoginMode(!isLoginMode); }}
              className="text-xs text-ink-muted hover:text-brand-ink text-center transition py-1"
              hidden={administrative || isResetMode || !!twoFactorMode}
            >
              {isLoginMode
                ? 'Ainda não tem conta? Cadastre-se'
                : 'Já tem uma conta? Clique aqui para entrar'}
            </button>

            {isLoginMode && !isForgotMode && !twoFactorMode && (
              <button type="button" onClick={() => { setNoticeMessage(''); setIsForgotMode(true); }} className="text-center text-xs text-brand-ink hover:underline">
                Esqueci minha senha
              </button>
            )}

            {isForgotMode && (
              <button type="button" onClick={() => { setNoticeMessage(''); setIsForgotMode(false); }} className="text-center text-xs text-ink-muted hover:text-brand-ink">
                Voltar ao login
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="text-xs text-ink-faint hover:text-ink-secondary text-center transition"
            >
              Fechar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
