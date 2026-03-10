'use client';

import { useAuth } from './AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { getDevRoleOverride, setDevRoleOverride, getDefaultDashboardPath, ROLE_FULL_LABELS, isValidAppRole, type AppRole } from '@/lib/permissions';
import { ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

/** Inline dropdown for admin to switch "View as" role. Renders nothing if user is not admin. Place next to role name in blue. */
export function AdminRoleSwitcher({ className }: { className?: string }) {
  const session = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [actualRole, setActualRole] = useState<AppRole | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const syncRole = async () => {
      if (!session.isLoggedIn || !session.user?.email) {
        setActualRole(null);
        return;
      }
      try {
        const token = await session.getToken();
        const authValue = token || session.user.email;
        const response = await api.get('/auth/role', {
          headers: { Authorization: `Bearer ${authValue}` },
        });
        const roleString = response?.data?.role;
        if (typeof roleString === 'string' && isValidAppRole(roleString)) {
          setActualRole(roleString);
          return;
        }
        setActualRole('CONSULTANT');
      } catch {
        setActualRole('CONSULTANT');
      }
    };
    void syncRole();
  }, [session.isLoggedIn, session.user?.email, session.getToken]);

  if (!session.isLoggedIn || !actualRole) return null;
  const isAdmin = actualRole === 'ADMIN';
  if (!isAdmin) return null;

  const effectiveRole: AppRole = getDevRoleOverride() ?? actualRole;
  const currentPath = pathname ?? '';

  const handleSelect = (role: AppRole) => {
    setDevRoleOverride(role);
    setOpen(false);
    const target = getDefaultDashboardPath(role);
    if (currentPath !== target) router.push(target);
  };

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--accent)]"
      >
        View as: {ROLE_FULL_LABELS[effectiveRole]}
        <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-[100] min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg py-1">
          {(['ADMIN', 'PM', 'LC', 'PARTNER', 'EXECUTIVE', 'CONSULTANT'] as const).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => handleSelect(role)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm transition-colors',
                effectiveRole === role
                  ? 'bg-[var(--primary)]/15 text-[var(--primary)] font-medium'
                  : 'text-[var(--foreground)] hover:bg-[var(--accent)]'
              )}
            >
              {ROLE_FULL_LABELS[role]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
