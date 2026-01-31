import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getDaysUntil(date: Date | string): number {
  const d = new Date(date);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING: 'bg-yellow-500',
    IN_PROGRESS: 'bg-blue-500',
    SUBMITTED: 'bg-purple-500',
    APPROVED: 'bg-green-500',
    OVERDUE: 'bg-red-500',
    REJECTED: 'bg-red-600',
    ACTIVE: 'bg-green-500',
    COMPLETED: 'bg-gray-500',
    ON_HOLD: 'bg-yellow-600',
    CANCELLED: 'bg-red-500',
  };
  return colors[status] || 'bg-gray-400';
}
