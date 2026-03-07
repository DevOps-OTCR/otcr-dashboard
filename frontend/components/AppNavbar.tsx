'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  LayoutDashboard,
  Activity,
  FileText,
  Presentation,
  MessageSquare,
  Users,
  Bell,
  CheckCircle2,
  Settings,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { AdminRoleSwitcher } from '@/components/AdminRoleSwitcher';
import { useAuth } from '@/components/AuthContext';
import { getDefaultDashboardPath, hasAccess, canShowNavItem, ROLE_FULL_LABELS, type AppRole } from '@/lib/permissions';
import { getNotificationsForUser, markNotificationRead } from '@/lib/notifications-storage';

export type NavItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: string;
  canAccess: (role: AppRole) => boolean;
};

export type AppNavPath =
  | '/dashboard'
  | '/consultant'
  | '/pm'
  | '/lc'
  | '/partner'
  | '/deliverables'
  | '/workstream'
  | '/workstream-docs'
  | '/teams'
  | '/slides'
  | '/client-notes'
  | '/settings/slack';

export interface AppNavbarProps {
  role: AppRole;
  currentPath?: AppNavPath;
  unreadNotificationCount?: number;
}

function formatNotificationTime(at: Date): string {
  const mins = Math.floor((Date.now() - at.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AppNavbar({ role, currentPath = '/dashboard', unreadNotificationCount = 0 }: AppNavbarProps) {
  const { logout, user } = useAuth();
  const overviewPath = getDefaultDashboardPath(role);
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
  const withBasePath = (path: string) => `${basePath}${path}`;
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsPanelRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<ReturnType<typeof getNotificationsForUser>>([]);

  useEffect(() => {
    setNotifications(getNotificationsForUser(user?.email ?? null));
  }, [user?.email]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!notificationsPanelRef.current) return;
      if (!notificationsPanelRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const localUnreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );
  const effectiveUnreadCount = Math.max(unreadNotificationCount, localUnreadCount);

  const navItems: NavItem[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: LayoutDashboard,
      href: overviewPath,
      canAccess: () => true,
    },
    {
      id: 'clientCallNotes',
      label: 'Client Call Notes',
      icon: MessageSquare,
      href: '/client-notes',
      canAccess: (r) =>
        hasAccess('clientCallNotesRead', r, 'read') ||
        hasAccess('clientCallNotesWrite', r, 'write'),
    },
    {
      id: 'workstreamDocs',
      label: 'Workstream',
      icon: FileText,
      href: '/workstream',
      canAccess: (r) =>
        hasAccess('workstreamDocReleased', r, 'read') ||
        hasAccess('engagementStatusTimelines', r, 'read'),
    },
    {
      id: 'engagement',
      label: 'Deliverables',
      icon: Activity,
      href: '/deliverables',
      canAccess: (r) => hasAccess('engagementStatusTimelines', r, 'read'),
    },
    {
      id: 'slides',
      label: 'Slides',
      icon: Presentation,
      href: '/slides',
      canAccess: (r) =>
        hasAccess('viewInitialSlides', r, 'read') ||
        hasAccess('viewFinalSlides', r, 'read') ||
        hasAccess('uploadInitialSlide', r, 'write') ||
        hasAccess('uploadFinalSlide', r, 'write'),
    },
    {
      id: 'team',
      label: 'Teams',
      icon: Users,
      href: '/teams',
      canAccess: (r) => canShowNavItem('team', r),
    },
  ];

  return (
    <header className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-50">
      <div className="max-w-[2000px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Link href={overviewPath} className="flex items-center gap-2">
              <Image
                src={withBasePath('/otcr-logo.png')}
                alt="OTCR"
                width={100}
                height={36}
                className="h-9 w-auto"
                priority
              />
            </Link>
            <Badge variant="info" size="sm" className="hidden sm:inline-flex">
              {ROLE_FULL_LABELS[role] ?? role}
            </Badge>
            <AdminRoleSwitcher className="shrink-0" />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" ref={notificationsPanelRef}>
              <button
                className="p-2 hover:bg-[var(--accent)] rounded-lg transition-colors relative"
                aria-label="Notifications"
                onClick={() => setNotificationsOpen((prev) => !prev)}
              >
                <Bell className="w-5 h-5" />
                {effectiveUnreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-100 border border-red-500/50 text-red-800 text-xs rounded-full flex items-center justify-center font-bold">
                    {effectiveUnreadCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl z-50">
                  <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                    <h3 className="font-semibold">Notifications</h3>
                    {localUnreadCount > 0 && (
                      <Badge variant="info" size="sm">
                        {localUnreadCount} new
                      </Badge>
                    )}
                  </div>
                  <div className="max-h-[360px] overflow-y-auto p-3 space-y-2">
                    {notifications.length === 0 ? (
                      <p className="text-sm text-[var(--foreground)]/60 text-center py-6">No notifications yet</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            markNotificationRead(n.id);
                            setNotifications(getNotificationsForUser(user?.email ?? null));
                          }}
                          className={cn(
                            'w-full text-left p-3 rounded-xl border transition-colors',
                            n.read
                              ? 'border-[var(--border)] bg-[var(--secondary)]/60'
                              : 'border-[var(--primary)]/30 bg-[var(--primary)]/5',
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-[var(--accent)] shrink-0">
                              <CheckCircle2 className="w-4 h-4 text-[var(--primary)]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{n.title}</p>
                                {!n.read && <span className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0" />}
                              </div>
                              <p className="text-xs text-[var(--foreground)]/75 mt-1">{n.message}</p>
                              <p className="text-xs text-[var(--foreground)]/55 mt-1">
                                {formatNotificationTime(n.at)}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <Link href="/settings/slack" className="p-2 hover:bg-[var(--accent)] rounded-lg transition-colors" aria-label="Slack settings">
              <Settings className="w-5 h-5" />
            </Link>
            <button
              onClick={() => logout()}
              className="text-sm font-medium px-3 py-2 rounded-lg hover:bg-[var(--accent)] transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-1 border-t border-[var(--border)] py-2 overflow-x-auto scrollbar-hide">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.href;
            const enabled = item.canAccess(role);

            if (!enabled) {
              return (
                <span
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors whitespace-nowrap text-[var(--foreground)]/35 cursor-not-allowed"
                  title="You do not have access to this page"
                >
                  <Icon className="w-4 h-4 text-[var(--foreground)]/35" />
                  <span>{item.label}</span>
                </span>
              );
            }

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
          })}
        </nav>
      </div>
    </header>
  );
}
