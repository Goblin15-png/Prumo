import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro';
  const Icon = theme === 'dark' ? Sun : Moon;

  return <button type="button" onClick={toggleTheme} aria-label={label} title={label} aria-pressed={theme === 'dark'}
    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
    <Icon aria-hidden="true" className="h-4 w-4" />
  </button>;
}
