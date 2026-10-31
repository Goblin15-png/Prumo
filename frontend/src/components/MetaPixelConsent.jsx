import React, { useEffect, useRef, useState } from 'react';

const PIXEL_ID = '1636298474539545';
const CONSENT_KEY = 'meta-pixel-consent';
const GOOGLE_CONSENT_KEY = 'google-tag-manager-consent';
const CONSENT_MAX_AGE = 365 * 24 * 60 * 60;
const parseConsent = (value) => value === 'accepted' ? true : value === 'rejected' ? false : null;

const readConsentCookie = (key = CONSENT_KEY) => {
  try {
    const entry = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${key}=`));
    return parseConsent(entry?.slice(key.length + 1));
  } catch { return null; }
};

const readLegacyConsent = () => {
  try { return parseConsent(localStorage.getItem(CONSENT_KEY)); }
  catch { return null; }
};

const clearLegacyConsent = () => {
  try { localStorage.removeItem(CONSENT_KEY); }
  catch { /* O cookie é a fonte da preferência quando o armazenamento antigo está bloqueado. */ }
};

const writeConsentCookie = (accepted, key = CONSENT_KEY) => {
  try {
    document.cookie = `${key}=${accepted ? 'accepted' : 'rejected'}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
    // Alguns navegadores ignoram a gravação de cookies bloqueados sem lançar um erro.
    return readConsentCookie(key) === accepted;
  } catch { return false; }
};

export default function MetaPixelConsent() {
  const [consent, setConsent] = useState(() => readConsentCookie() ?? readLegacyConsent());
  const [googleConsent, setGoogleConsent] = useState(() => readConsentCookie(GOOGLE_CONSENT_KEY));
  const [isPromptOpen, setIsPromptOpen] = useState(consent === null || (consent === true && googleConsent === null));
  const channel = useRef(null);
  const sessionOnly = useRef(false);
  const currentConsent = useRef(consent);
  const currentGoogleConsent = useRef(googleConsent);
  currentConsent.current = consent;
  currentGoogleConsent.current = googleConsent;

  useEffect(() => {
    // Preserva decisões anteriores sem sobrescrever uma preferência já salva em cookie.
    const savedCookie = readConsentCookie();
    const legacyConsent = readLegacyConsent();
    if (savedCookie !== null) clearLegacyConsent();
    else if (legacyConsent !== null) {
      sessionOnly.current = !writeConsentCookie(legacyConsent);
      if (!sessionOnly.current) clearLegacyConsent();
    }

    const syncConsent = () => {
      // Se a gravação falhou, respeita a decisão desta aba em vez de restaurar um cookie antigo.
      if (sessionOnly.current) return;
      const saved = readConsentCookie();
      const savedGoogle = readConsentCookie(GOOGLE_CONSENT_KEY);
      if (saved === currentConsent.current && savedGoogle === currentGoogleConsent.current) return;
      sessionOnly.current = false;
      setConsent(saved);
      setGoogleConsent(savedGoogle);
      setIsPromptOpen(saved === null || (saved === true && savedGoogle === null));
    };
    try {
      channel.current = new BroadcastChannel(CONSENT_KEY);
      channel.current.onmessage = syncConsent;
    } catch { /* Sincroniza ao voltar à aba quando BroadcastChannel não está disponível. */ }
    window.addEventListener('focus', syncConsent);
    document.addEventListener('visibilitychange', syncConsent);
    return () => {
      channel.current?.close();
      channel.current = null;
      window.removeEventListener('focus', syncConsent);
      document.removeEventListener('visibilitychange', syncConsent);
    };
  }, []);

  useEffect(() => {
    window.protocoloTagManager?.setConsent(consent === true && googleConsent === true);
  }, [consent, googleConsent]);

  useEffect(() => {
    if (consent !== true) {
      window.fbq?.('consent', 'revoke');
      return;
    }

    if (window.fbq) {
      window.fbq('consent', 'grant');
      window.fbq('track', 'PageView');
      return;
    }

    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  }, [consent]);

  const saveConsent = (accepted) => {
    const metaSaved = writeConsentCookie(accepted);
    const googleSaved = writeConsentCookie(accepted, GOOGLE_CONSENT_KEY);
    sessionOnly.current = !(metaSaved && googleSaved);
    // Uma escolha nova substitui a antiga, mesmo se o navegador bloquear o cookie.
    clearLegacyConsent();
    setConsent(accepted);
    setGoogleConsent(accepted);
    setIsPromptOpen(false);
    if (!sessionOnly.current) channel.current?.postMessage('changed');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsPromptOpen(true)}
        className="fixed bottom-4 left-4 z-40 rounded-full border border-line-strong bg-surface px-4 py-2 text-xs font-semibold text-ink-secondary shadow-lg hover:bg-surface-muted"
      >
        Preferências de cookies
      </button>

      {isPromptOpen && (
        <section
          aria-label="Preferências de cookies"
          className="fixed inset-x-4 bottom-16 z-50 mx-auto max-w-2xl rounded-2xl border border-line bg-surface p-5 text-ink shadow-2xl sm:inset-x-6 sm:bottom-6"
        >
          <h2 className="font-serif text-lg font-bold text-brand-ink">
            Preferências de cookies
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Com sua autorização, usamos o Meta Pixel e tags do Google para registrar visitas
            e compartilhar esses dados com Meta e Google para medir campanhas. Você pode aceitar ou recusar
            esse rastreamento. Sua escolha fica salva em um cookie neste navegador por até um ano
            e pode ser alterada depois em “Preferências de cookies”.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => saveConsent(false)}
              className="rounded-xl border border-line-strong px-4 py-2 text-sm font-semibold text-ink-secondary hover:bg-surface-muted"
            >
              Recusar rastreamento
            </button>
            <button
              type="button"
              onClick={() => saveConsent(true)}
              className="rounded-xl bg-[#5E1A2B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4A1422]"
            >
              Aceitar
            </button>
          </div>
        </section>
      )}
    </>
  );
}
