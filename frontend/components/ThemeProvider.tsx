'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  /** What the user picked. `system` means no explicit choice has been saved. */
  preference: ThemePreference;
  /** The theme actually applied to the page. */
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  toggleTheme: () => void;
}

export const THEME_STORAGE_KEY = 'theme';
const THEME_CHANGE_EVENT = 'otcr-theme-change';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Runs before React hydrates (see app/layout.tsx) so the first paint already
 * uses the right theme instead of flashing light and then switching.
 */
export const themeInitScript = `(function(){try{var p=null;try{p=localStorage.getItem('${THEME_STORAGE_KEY}')}catch(e){}var d=p==='dark'||(p!=='light'&&window.matchMedia('${DARK_QUERY}').matches);var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(d?'dark':'light');r.style.colorScheme=d?'dark':'light'}catch(e){}})();`;

// Fallback for browsers where localStorage is unavailable (e.g. blocked storage).
let memoryPreference: ThemePreference = 'system';

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return memoryPreference;
  }
}

function subscribePreference(onChange: () => void) {
  // `storage` keeps other open tabs in sync; the custom event covers this tab.
  window.addEventListener('storage', onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

function readSystemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function subscribeSystemTheme(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSyncExternalStore(subscribePreference, readPreference, () => 'system' as const);
  const systemTheme = useSyncExternalStore(subscribeSystemTheme, readSystemTheme, () => 'light' as const);
  const theme: ResolvedTheme = preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    memoryPreference = next;
    try {
      if (next === 'system') {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      // Storage blocked: the in-memory preference still applies for this page view.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark');
  }, [setPreference, theme]);

  const value = useMemo(
    () => ({ preference, theme, setPreference, toggleTheme }),
    [preference, theme, setPreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
