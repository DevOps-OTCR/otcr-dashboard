'use client';

import { useAuth } from './AuthContext';
import Image from 'next/image';
import Link from 'next/link';
import {
  LayoutDashboard,
  FileText,
  Presentation,
  Download,
  FileStack,
  MessageSquare,
  Users,
  Bell,
  Settings,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { setDevRoleOverride, type AppRole } from '@/lib/permissions';

export type NavItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  scrollRef?: string;
  badge?: string;
  roles: AppRole[];
};

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, href: '/dashboard', roles: ['CONSULTANT', 'LC', 'PM', 'ADMIN'] },
  { id: 'workstreamDocs', label: 'Workstream Documents', icon: FileText, scrollRef: 'workstream-docs', roles: ['LC', 'PM', 'ADMIN'] },
  { id: 'slides', label: 'Slides', icon: Presentation, scrollRef: 'slides', roles: ['CONSULTANT', 'LC', 'PM', 'ADMIN'] },
  { id: 'decks', label: 'Decks', icon: FileStack, scrollRef: 'decks', roles: ['PM', 'ADMIN'] },
  { id: 'clientCallNotes', label: 'Client Call Notes', icon: MessageSquare, scrollRef: 'client-call-notes', roles: ['LC', 'PM', 'ADMIN'] },
  { id: 'team', label: 'Team', icon: Users, href: '/teams', roles: ['CONSULTANT', 'LC', 'PM', 'ADMIN'] },
];

interface AppNavbarProps {
  role: AppRole;
  currentPath?: string;
  onNavClick?: (scrollRef: string) => void;
  onRoleChange?: (role: AppRole) => void;
}

const ROLES: AppRole[] = ['CONSULTANT', 'LC', 'PM', 'ADMIN'];

export function AppNavbar({ role, currentPath = '/dashboard', onNavClick, onRoleChange }: AppNavbarProps) {
  const session = useAuth();
  const handleRoleSwitch = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as AppRole;
    if (value) {
      setDevRoleOverride(value);
      onRoleChange?.(value);
    }
  };
  const visibleItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(role) || item.roles.includes('ADMIN')
  );

  return (
    <header className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-50">
      <div className="max-w-[2000px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Image
                src="/otcr-logo.png"
                alt="OTCR"
                width={100}
                height={36}
                className="h-9 w-auto"
                priority
              />
            </Link>
            <Badge variant="info" size="sm" className="uppercase hidden sm:inline-flex">
              {role}
            </Badge>
            <select
              value={role}
              onChange={handleRoleSwitch}
              title="Switch view (dev)"
              className="ml-2 text-xs font-medium px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)] cursor-pointer hover:border-[var(--primary)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  View as {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-[var(--accent)] rounded-lg transition-colors relative">
              <Bell className="w-5 h-5" />
            </button>
            <button className="p-2 hover:bg-[var(--accent)] rounded-lg transition-colors">
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={() => session.logout()}
              className="text-sm font-medium px-3 py-2 rounded-lg hover:bg-[var(--accent)] transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-1 border-t border-[var(--border)] py-2 overflow-x-auto scrollbar-hide">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              (item.href && currentPath === item.href) ||
              (item.scrollRef && currentPath.includes(item.scrollRef));

            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors whitespace-nowrap',
                    isActive
                      ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
                      : 'text-[var(--foreground)]/75 hover:bg-[var(--accent)] hover:text-[var(--foreground)]'
                  )}
                >
                  <Icon className="w-4 h-4 text-[var(--primary)]" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <Badge variant="warning" size="sm">
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.scrollRef && onNavClick) onNavClick(item.scrollRef);
                }}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-[var(--primary)]/15 text-[var(--primary)]'
                    : 'text-[var(--foreground)]/75 hover:bg-[var(--accent)] hover:text-[var(--foreground)]'
                )}
              >
                <Icon className="w-4 h-4 text-[var(--primary)]" />
                <span>{item.label}</span>
                {item.badge && (
                  <Badge variant="warning" size="sm">
                    {item.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
