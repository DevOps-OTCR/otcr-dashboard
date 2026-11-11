'use client';

import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';
import { PersistentNavbar, type AppNavbarProps, type AppNavPath } from './AppNavbar';
import { GoogleCalendarPanel } from './GoogleCalendarPanel';
import { CmsCalendar } from './CmsCalendar';
import { getUserRole } from '@/lib/permissions';
import { DashboardRefresh, NavbarRegistration } from './navbar-registration';
import { clearResourceCache } from '@/lib/resource-cache';

// Pages register their resolved permissions. The layout owns the navbar instance.
const overviewPaths = ['/overview', '/consultant'];
const dashboardPaths = [...overviewPaths, '/dashboard', '/deliverables', '/slides', '/attendance',
  '/workstream', '/workstream-docs', '/when2meet', '/teams', '/forms', '/client-notes',
  '/feedback', '/feedback/anonymous', '/feedback/prc', '/alumni-database', '/people', '/settings/slack'];

export function DashboardShell({ children }: { children: ReactNode }) {
  const { isLoggedIn, user } = useAuth();
  // Pages builds use trailingSlash, so usePathname() returns '/overview/' rather than '/overview'.
  const path = (usePathname() ?? '').replace(/\/+$/, '') || '/';
  const overview = overviewPaths.includes(path);
  const [navbar, setNavbar] = useState<AppNavbarProps>({ role: getUserRole(user?.email) });
  const [calendarVisited, setCalendarVisited] = useState(overview);
  const [view, setView] = useState<'google' | 'schedule'>('google');
  const [scheduleVisited, setScheduleVisited] = useState(false);
  if (overview && !calendarVisited) setCalendarVisited(true);
  const showNavbar = isLoggedIn && dashboardPaths.includes(path);
  // Refresh bypasses cached responses and remounts the page, which renders its snapshot
  // immediately and refetches in the background. Repeated clicks within a second are ignored.
  const [refreshKey, setRefreshKey] = useState(0);
  const lastRefresh = useRef(0);
  const refresh = useCallback(() => {
    if (Date.now() - lastRefresh.current < 1000) return;
    lastRefresh.current = Date.now();
    clearResourceCache();
    setRefreshKey(key => key + 1);
  }, []);
  const onCalendarTabKeyDown = (event: KeyboardEvent) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const select = event.key === 'ArrowLeft' || event.key === 'Home' ? 'google' : 'schedule';
    if (select === 'schedule') setScheduleVisited(true);
    setView(select);
    document.getElementById('calendar-tab-' + select)?.focus();
  };

  return <NavbarRegistration.Provider value={setNavbar}><DashboardRefresh.Provider value={refresh}>
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {showNavbar && <PersistentNavbar {...navbar} currentPath={(path.startsWith('/feedback') ? '/forms' : path) as AppNavPath} />}
      <div className={overview
        ? `mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 gap-6 items-start ${path === '/consultant' ? 'max-w-[1400px] xl:grid-cols-2' : 'max-w-[1800px] lg:grid-cols-2'}`
        : undefined}>
        <div key={refreshKey}>{children}</div>
        <div hidden={!overview || !isLoggedIn}>
          {calendarVisited && isLoggedIn && <>
            <div role="tablist" aria-label="Calendar view" onKeyDown={onCalendarTabKeyDown} className="mb-3 inline-flex gap-1 rounded-lg bg-[var(--secondary)] p-1">
              <button
                type="button"
                role="tab"
                id="calendar-tab-google"
                aria-controls="calendar-panel-google"
                aria-selected={view === 'google'}
                tabIndex={view === 'google' ? 0 : -1}
                onClick={() => setView('google')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === 'google' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--foreground)]/70 hover:text-[var(--foreground)]'}`}
              >
                Google Calendar
              </button>
              <button
                type="button"
                role="tab"
                id="calendar-tab-schedule"
                aria-controls="calendar-panel-schedule"
                aria-selected={view === 'schedule'}
                tabIndex={view === 'schedule' ? 0 : -1}
                onClick={() => { setScheduleVisited(true); setView('schedule'); }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === 'schedule' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--foreground)]/70 hover:text-[var(--foreground)]'}`}
              >
                Team schedule
              </button>
            </div>
            <div role="tabpanel" id="calendar-panel-google" aria-labelledby="calendar-tab-google" hidden={view !== 'google'}>
              <GoogleCalendarPanel className="shadow-lg h-full" active={overview} title={path === '/consultant' ? 'Google Calendar' : 'Calendar'} />
            </div>
            <div role="tabpanel" id="calendar-panel-schedule" aria-labelledby="calendar-tab-schedule" hidden={view !== 'schedule'}>
              {scheduleVisited && <CmsCalendar refreshKey={refreshKey} />}
            </div>
          </>}
        </div>
      </div>
    </div>
  </DashboardRefresh.Provider></NavbarRegistration.Provider>;
}
