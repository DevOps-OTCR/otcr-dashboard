import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  dot?: boolean;
}

export function Badge({ children, variant = 'default', size = 'md', className, dot = false }: BadgeProps) {
  const variants = {
    default:
      'bg-[var(--surface-muted)] text-[var(--text-muted)] border-[var(--border)]',
    success:
      'bg-[var(--success-bg)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]',
    warning:
      'bg-[var(--warning-bg)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)]',
    danger:
      'bg-[var(--danger-bg)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]',
    info:
      'bg-[var(--info-bg)] text-[var(--info)] border-[color-mix(in_srgb,var(--info)_30%,transparent)]',
    purple:
      'bg-[var(--info-bg)] text-[var(--info)] border-[color-mix(in_srgb,var(--info)_30%,transparent)]',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs font-semibold',
    md: 'px-2.5 py-1 text-xs font-semibold',
    lg: 'px-3 py-1.5 text-sm font-semibold',
  };

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] border tabular-nums',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {dot && (
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}
