'use client';

import { Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <motion.button
      onClick={toggleTheme}
      whileTap={{ scale: 0.92, rotate: 10 }}
      className="p-2 hover:bg-[var(--accent)] rounded-lg transition-all duration-300"
      aria-label="Toggle theme"
    >
      <motion.div animate={{ rotate: theme === 'dark' ? 180 : 0 }} transition={{ type: 'spring', stiffness: 200 }}>
        {theme === 'dark' ? (
          <Sun className="w-5 h-5 text-yellow-500" />
        ) : (
          <Moon className="w-5 h-5 text-indigo-600" />
        )}
      </motion.div>
    </motion.button>
  );
}
