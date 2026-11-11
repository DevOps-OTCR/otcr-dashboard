import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ children, className, hover = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5',
        hover && 'card-hover cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  action?: React.ReactNode;
}

export function CardHeader({ children, className, action, ...props }: CardHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 pb-3', className)} {...props}>
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="max-w-full shrink-0">{action}</div>}
    </div>
  );
}

type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>;

export function CardTitle({ children, className, ...props }: CardTitleProps) {
  return (
    <h3
      className={cn(
        'font-[family-name:var(--font-heading)] text-base font-semibold tracking-tight text-[var(--foreground)]',
        className
      )}
      {...props}
    >
      {children}
    </h3>
  );
}

type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;

export function CardDescription({ children, className, ...props }: CardDescriptionProps) {
  return (
    <p className={cn('text-[13px] text-[var(--text-muted)]', className)} {...props}>
      {children}
    </p>
  );
}

type CardContentProps = React.HTMLAttributes<HTMLDivElement>;

export function CardContent({ children, className, ...props }: CardContentProps) {
  return (
    <div className={cn('space-y-4', className)} {...props}>
      {children}
    </div>
  );
}
