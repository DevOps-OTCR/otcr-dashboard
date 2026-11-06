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
  const baseStyles = 'inline-flex items-center justify-center rounded-[var(--radius-md)] font-semibold transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--ring)] disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-[var(--primary)] text-[var(--primary-foreground)] border border-transparent hover:bg-[var(--primary)]/90',
    secondary: 'bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--surface-muted)]',
    outline: 'bg-transparent text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--surface-muted)]',
    ghost: 'bg-transparent text-[var(--foreground)] border border-transparent hover:bg-[var(--surface-muted)]',
    danger: 'bg-[var(--danger)] text-[var(--danger-bg)] border border-transparent hover:bg-[var(--danger)]/90',
  };

  const sizes = {
    sm: 'h-8 px-3 text-[13px] gap-1.5',
    md: 'h-9 min-h-11 sm:min-h-0 px-4 text-sm gap-2',
    lg: 'h-11 min-h-11 px-5 text-sm gap-2',
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
