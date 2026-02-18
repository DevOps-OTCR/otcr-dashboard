import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30 hover:bg-[var(--primary)]/25 focus:ring-[var(--primary)]',
    secondary: 'bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--accent)] focus:ring-[var(--ring)]',
    outline: 'border-2 border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)] focus:ring-[var(--ring)]',
    ghost: 'text-[var(--foreground)] hover:bg-[var(--accent)] focus:ring-[var(--ring)]',
    danger: 'bg-red-500/15 text-red-700 border border-red-500/30 hover:bg-red-500/25 focus:ring-red-500',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2 text-base gap-2',
    lg: 'px-6 py-3 text-lg gap-2.5',
  };

  return (
    <button
      className={cn(
        baseStyles,
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {children}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}
