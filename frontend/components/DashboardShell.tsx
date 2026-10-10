'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';
import { PersistentNavbar, type AppNavbarProps, type AppNavPath } from './AppNavbar';
import { GoogleCalendarPanel } from './GoogleCalendarPanel';
import { getUserRole } from '@/lib/permissions';
import { NavbarRegistration } from './navbar-registration';

// Pages register their resolved permissions. The layout owns the navbar instance.
const overviewPaths = ['/pm', '/lc', '/partner', '/consultant'];
const dashboardPaths = [...overviewPaths, '/dashboard', '/deliverables', '/slides', '/attendance',
  '/workstream', '/workstream-docs', '/when2meet', '/teams', '/forms', '/client-notes',
  '/feedback', '/feedback/anonymous', '/feedback/prc', '/alumni-database', '/settings/slack'];

export function DashboardShell({ children }: { children: ReactNode }) {
  const { isLoggedIn, user } = useAuth();
  const path = usePathname() ?? '';
  const overview = overviewPaths.includes(path);
  const [navbar, setNavbar] = useState<AppNavbarProps>({ role: getUserRole(user?.email) });
  const [calendarVisited, setCalendarVisited] = useState(overview);
  useEffect(() => {
    if (overview) setCalendarVisited(true);
  }, [overview]);
  const showNavbar = isLoggedIn && dashboardPaths.includes(path);

  return <NavbarRegistration.Provider value={setNavbar}>
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {showNavbar && <PersistentNavbar {...navbar} currentPath={(path.startsWith('/feedback') ? '/forms' : path) as AppNavPath} />}
      <div className={overview
        ? `mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 gap-6 items-start ${path === '/consultant' ? 'max-w-[1400px] xl:grid-cols-2' : 'max-w-[1800px] lg:grid-cols-2'}`
        : undefined}>
        <div>{children}</div>
        <div hidden={!overview || !isLoggedIn}>
          {calendarVisited && isLoggedIn && <GoogleCalendarPanel className="shadow-lg h-full" active={overview} title={path === '/consultant' ? 'Google Calendar' : 'Calendar'} />}
        </div>
      </div>
    </div>
  </NavbarRegistration.Provider>;
}
