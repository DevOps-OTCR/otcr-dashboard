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

type NotificationType = 'upload' | 'comment' | 'revision_request' | 'doc_updated';
interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  context?: string;
  at: Date;
  read: boolean;
}

const mockNotifications: Notification[] = [
  { id: '1', type: 'upload', title: 'New upload', message: 'Market analysis draft v2 was uploaded.', context: 'Market Research', at: new Date(Date.now() - 1000 * 60 * 15), read: false },
  { id: '2', type: 'comment', title: 'New comment', message: 'Alice commented on "Kickoff deck" in Initial Slides.', context: 'Market Research', at: new Date(Date.now() - 1000 * 60 * 45), read: false },
  { id: '3', type: 'revision_request', title: 'Revision requested', message: 'PM requested revision on "Final client deck".', context: 'Financial Analysis', at: new Date(Date.now() - 1000 * 60 * 120), read: true },
];

const mockWorkstreamDocs = [
  { id: '1', name: 'Market Research – Draft', workstream: 'Market Research', status: 'draft' as const },
  { id: '2', name: 'Financial Analysis – Released', workstream: 'Financial Analysis', status: 'released' as const },
];
const mockInitialSlides = [{ id: '1', title: 'Kickoff deck', workstream: 'Market Research', commentCount: 2 }];
const mockFinalSlides = [{ id: '1', title: 'Final client deck', workstream: 'Market Research', commentCount: 1 }];
const mockCallNotes = [
  { id: '1', title: 'Q4 planning call', date: new Date(), author: 'You', canEdit: true },
  { id: '2', title: 'Client sync', date: new Date(Date.now() - 86400000), author: 'You', canEdit: false },
];

function formatNotificationTime(at: Date, now: number): string {
  const mins = Math.floor((now - at.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

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
