import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const ThemeContext = createContext(null);
const cookieName = 'protocolo-theme';
const validPreference = (value) => value === 'light' || value === 'dark' ? value : null;
const readPreference = () => {
  try {
    return validPreference(document.cookie.split('; ').find((entry) => entry.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1));
  } catch { return null; }
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => readPreference() || 'light');
  const channel = useRef(null);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    // Cookies não emitem eventos de storage; avisa as outras abas sem persistir em localStorage.
    try {
      channel.current = new BroadcastChannel(cookieName);
      channel.current.onmessage = () => {
        const saved = readPreference();
        if (saved) setTheme(saved);
      };
    } catch { /* em navegadores sem canal, sincroniza ao voltar para a aba */ }
    const syncPreference = () => {
      const saved = readPreference();
      if (saved) setTheme(saved);
    };
    window.addEventListener('focus', syncPreference);
    document.addEventListener('visibilitychange', syncPreference);
    return () => {
      channel.current?.close();
      channel.current = null;
      window.removeEventListener('focus', syncPreference);
      document.removeEventListener('visibilitychange', syncPreference);
    };
  }, []);

  const value = useMemo(() => ({
    theme,
    toggleTheme: () => {
      const next = theme === 'dark' ? 'light' : 'dark';
      setTheme(next);
      try {
        document.cookie = `${cookieName}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
        channel.current?.postMessage('changed');
      } catch { /* tema continua ativo nesta visita */ }
    },
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
