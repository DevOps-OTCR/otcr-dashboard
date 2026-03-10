'use client';

import { useState, useRef, useEffect, type RefObject } from 'react';
import { setLastDashboard } from '@/lib/dashboard-context';
import { AppNavbar } from '@/components/AppNavbar';
import { GoogleCalendarPanel } from '@/components/GoogleCalendarPanel';
import { WeeklyDeliverablesCard } from '@/components/WeeklyDeliverablesCard';
import { projectsAPI, setAuthToken } from '@/lib/api';
import {
  getDashboardDeliverables,
  type ProjectSprintSummary,
  type SprintSummary,
  type DashboardDeliverable,
} from '@/lib/dashboard-deliverables';
import { useAuth } from '@/components/AuthContext';
import { useRouter } from 'next/navigation';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';

export default function LCDashboard() {
  const router = useRouter();
  const session = useAuth();
  const [dashboardDeliverables, setDashboardDeliverables] = useState<DashboardDeliverable[]>([]);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const engagementRef = useRef<HTMLDivElement>(null);

  const unreadCount = 0;

  useEffect(() => {
    // If loading is done and user is NOT logged in, kick them to sign-in
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in'); // replace prevents back-button loops
    }
  }, [session, router]);

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  const navScrollMap: Record<string, RefObject<HTMLDivElement | null>> = {
    overview: dashboardRef,
  };
  const handleNavClick = (key: string) => {
    const ref = navScrollMap[key];
    if (ref?.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const loadEngagement = async () => {
      if (!session.isLoggedIn || !session.user?.email) return;
      try {
        const token = await session.getToken();
        setAuthToken(token || session.user?.email || null);
        const projectsRes = await projectsAPI.getAll({ limit: 100 });
        const projects = ((projectsRes.data?.projects ?? []) as Array<{ id: string; name: string }>).map(
          (project) => ({ id: project.id, name: project.name }),
        );
        const sprintResponses = await Promise.all(
          projects.map(async (project) => {
            const sprintsRes = await projectsAPI.getSprints(project.id);
            return {
              id: project.id,
              name: project.name,
              sprints: (Array.isArray(sprintsRes.data) ? sprintsRes.data : []) as SprintSummary[],
            } satisfies ProjectSprintSummary;
          }),
        );
        setDashboardDeliverables(getDashboardDeliverables(sprintResponses));
      } catch {
        setDashboardDeliverables([]);
      }
    };
    void loadEngagement();
  }, [session.isLoggedIn, session.user?.email]);

  useEffect(() => {
    setLastDashboard('/lc');
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      <AppNavbar role="LC" currentPath="/lc" unreadNotificationCount={unreadCount} />

      <div className="flex-1 flex flex-col min-h-screen relative overflow-y-auto">
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 overflow-y-auto">
          <div ref={dashboardRef} className="max-w-[1800px] mx-auto space-y-8 pb-8">
            <div className="grid grid-cols-12 gap-6">
              <div ref={engagementRef} className="col-span-12 lg:col-span-6">
                <WeeklyDeliverablesCard
                  description="Current week deliverables and due dates across projects"
                  items={dashboardDeliverables}
                  emptyMessage="No deliverables found for the current week."
                />
              </div>
              <div className="col-span-12 lg:col-span-6">
                <GoogleCalendarPanel className="shadow-lg h-full" />
              </div>

            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
