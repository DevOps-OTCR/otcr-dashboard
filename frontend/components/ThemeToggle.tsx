'use client';

import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from './ThemeProvider';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={theme === 'dark'}
      title={label}
      className={cn(
        'p-2 rounded-lg hover:bg-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]',
        className,
      )}
    >
      <Moon aria-hidden="true" className="w-5 h-5 dark:hidden" />
      <Sun aria-hidden="true" className="hidden w-5 h-5 dark:block" />
    </button>
  );
}
