import React, { useState } from 'react';
import api, { ensureCsrfCookie } from '../services/api';

export default function EmailConfirmation({ user, onVerified, onResend, resending }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await ensureCsrfCookie();
      const { data } = await api.post('/email/confirm-code', { code });
      setCode('');
      onVerified(data.user);
    } catch (failure) {
      setError(failure.response?.status === 429
        ? 'Muitas tentativas. Aguarde um minuto antes de tentar novamente.'
        : failure.response?.data?.errors?.code?.[0] || failure.response?.data?.message || 'Não foi possível confirmar agora. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return <section aria-label="Confirmação de email" className="mx-auto mt-3 w-[min(96%,80rem)] space-y-3 rounded-xl border border-warning-line-strong bg-warning-soft px-4 py-4 text-sm text-warning-ink">
    <p>Confirme o email <strong>{user.email}</strong> para liberar a compra. Digite o código de 6 dígitos enviado para esse endereço.</p>
    <form onSubmit={confirm} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 font-semibold">Código de confirmação
        <input name="email_confirmation_code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={busy} aria-describedby="email-code-help" className="rounded-lg border border-warning-line-strong bg-white px-3 py-2 tracking-widest text-gray-900" />
      </label>
      <button type="submit" disabled={busy || code.length !== 6} className="rounded-lg bg-[#5E1A2B] px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Confirmando…' : 'Confirmar email'}</button>
      <button type="button" onClick={onResend} disabled={resending || busy} className="px-2 py-2 font-semibold underline disabled:opacity-50">{resending ? 'Enviando…' : 'Reenviar código'}</button>
    </form>
    <p id="email-code-help">O código vence em 10 minutos. Confira também o spam. Para reenviar, aguarde 60 segundos; use sempre o código mais recente.</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
