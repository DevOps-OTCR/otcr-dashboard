'use client';

import { useAuth } from './AuthContext';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Settings,
  Bell,
  FileText,
  Activity,
  Layers,
  StickyNote,
  Users,
} from 'lucide-react';
import { ROLE_FULL_LABELS } from '@/lib/permissions';
import { AdminRoleSwitcher } from '@/components/AdminRoleSwitcher';

export type PMNavPath = '/pm' | '/engagement' | '/teams';

const NAV_ITEMS: { label: string; icon: React.ComponentType<{ className?: string }>; href: PMNavPath; pathMatch: PMNavPath; scrollKey?: string }[] = [
  { label: 'Overview', icon: LayoutDashboard, href: '/pm', pathMatch: '/pm', scrollKey: 'overview' },
  { label: 'Notifications', icon: Bell, href: '/pm', pathMatch: '/pm', scrollKey: 'notifications' },
  { label: 'Workstream Docs', icon: FileText, href: '/pm', pathMatch: '/pm', scrollKey: 'workstreamdocs' },
  { label: 'Initial Slides', icon: Layers, href: '/pm', pathMatch: '/pm', scrollKey: 'initialslides' },
  { label: 'Final Slides', icon: Layers, href: '/pm', pathMatch: '/pm', scrollKey: 'finalslides' },
  { label: 'Call Notes', icon: StickyNote, href: '/pm', pathMatch: '/pm', scrollKey: 'callnotes' },
  { label: 'Engagement', icon: Activity, href: '/engagement', pathMatch: '/engagement' },
  { label: 'Teams', icon: Users, href: '/teams', pathMatch: '/teams' },
];

interface PMNavbarProps {
  currentPath: PMNavPath;
  unreadNotificationCount?: number;
  /** When on /pm, call this for in-dashboard nav items instead of linking */
  onNavClick?: (key: string) => void;
}

export function PMNavbar({ currentPath, unreadNotificationCount = 0, onNavClick }: PMNavbarProps) {
  const isOnPm = currentPath === '/pm';
  const {logout: signOut} = useAuth();

  return (
    <header className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-50">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Link href="/pm" className="flex items-center gap-3">
              <Image
                src="/otcr-logo.png"
                alt="OTCR Consulting"
                width={120}
                height={40}
                className="h-10 w-auto"
                priority
              />
              <span className="text-sm font-semibold text-[var(--primary)] hidden sm:inline">
                {ROLE_FULL_LABELS.PM}
              </span>
            </Link>
            <AdminRoleSwitcher className="shrink-0" />
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/pm"
              className="relative p-2 rounded-xl hover:bg-[var(--accent)]"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadNotificationCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-100 border border-red-500/50 text-red-800 text-xs rounded-full flex items-center justify-center font-bold">
                  {unreadNotificationCount}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => signOut()}
              className="p-2 rounded-full bg-[var(--accent)] hover:bg-[var(--primary)]/20 transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-1 border-t border-[var(--border)] py-2 overflow-x-auto">
          {NAV_ITEMS.map((item, index) => {
            const Icon = item.icon;
            const useScroll = isOnPm && onNavClick && item.href === '/pm';
            const navButtonClass = 'flex items-center gap-2 rounded-lg px-4 py-2 text-sm whitespace-nowrap transition-colors text-[var(--foreground)]/75 hover:bg-[var(--accent)] hover:text-[var(--foreground)]';

            if (useScroll && onNavClick && item.scrollKey) {
              return (
                <motion.button
                  key={item.label}
                  type="button"
                  initial={{ x: -12, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => onNavClick(item.scrollKey!)}
                  className={navButtonClass}
                >
                  <Icon className="w-4 h-4 text-[var(--primary)]" />
                  <span>{item.label}</span>
                </motion.button>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className={navButtonClass}
              >
                <Icon className="w-4 h-4 text-[var(--primary)]" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
