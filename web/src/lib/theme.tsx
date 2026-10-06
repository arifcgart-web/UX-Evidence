import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePref = 'light' | 'mix' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'mix' | 'dark';

const KEY = 'uxe.theme';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'mix' || v === 'dark' || v === 'auto') return v;
  } catch {
    /* storage unavailable */
  }
  return 'mix';
}

function resolve(pref: ThemePref): ResolvedTheme {
  if (pref !== 'auto') return pref;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'mix';
}

interface ThemeState {
  pref: ThemePref;
  theme: ResolvedTheme;
  setPref: (p: ThemePref) => void;
}

const Ctx = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolve(readPref()));

  useEffect(() => {
    const apply = () => setTheme(resolve(pref));
    apply();
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener('change', apply);
    return () => mq?.removeEventListener('change', apply);
  }, [pref]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const value = useMemo<ThemeState>(
    () => ({
      pref,
      theme,
      setPref: (p) => {
        setPrefState(p);
        try {
          localStorage.setItem(KEY, p);
        } catch {
          /* ignore */
        }
      },
    }),
    [pref, theme],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme outside ThemeProvider');
  return ctx;
}
