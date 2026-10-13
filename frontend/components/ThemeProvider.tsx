'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

export const THEME_STORAGE_KEY = 'theme';
const THEME_CHANGE_EVENT = 'otcr-theme-change';

// Apply the saved choice before hydration. Unset and legacy System preferences use Light.
export const themeInitScript = `(function(){var t='light';try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='dark')t='dark'}catch(e){}var r=document.documentElement;if(!r.classList.replace(t==='dark'?'light':'dark',t))r.classList.add(t);r.style.colorScheme=t})();`;

function readTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const previous = theme === 'dark' ? 'light' : 'dark';
  if (!root.classList.replace(previous, theme)) root.classList.add(theme);
  root.style.colorScheme = theme;
}

function subscribeTheme(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    applyTheme(event.newValue === 'dark' ? 'dark' : 'light');
    onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The initialization script owns the first paint; hydration must not overwrite it with Light.
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'light' as const);
  const toggleTheme = useCallback(() => {
    const next = readTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The current page still changes theme when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);
  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
