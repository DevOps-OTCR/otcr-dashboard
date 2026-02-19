'use client';

import { useAuth } from '@/components/AuthContext';
import { useState, useRef, useEffect, type RefObject } from 'react';
import { setLastDashboard } from '@/lib/dashboard-context';
import {
  Activity,
} from 'lucide-react';
import { LCPartnerNavbar } from '@/components/LCPartnerNavbar';
import { GoogleCalendarPanel } from '@/components/GoogleCalendarPanel';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { tasksAPI, setAuthToken } from '@/lib/api';
import type { TaskFromApi } from '@/lib/task-utils';
import type { WorkstreamDeadline } from '@/types';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { useRouter } from 'next/navigation';

type NotificationType = 'upload' | 'comment' | 'doc_updated';
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
  { id: '1', type: 'upload', title: 'New upload', message: 'Final deck v3 was uploaded.', context: 'Market Research', at: new Date(Date.now() - 1000 * 60 * 30), read: false },
  { id: '2', type: 'comment', title: 'New comment', message: 'PM commented on "Final client deck".', context: 'Financial Analysis', at: new Date(Date.now() - 1000 * 60 * 90), read: true },
];

const mockWorkstreamDocs = [
  { id: '1', name: 'Market Research – Draft', workstream: 'Market Research', status: 'draft' as const },
  { id: '2', name: 'Financial Analysis – Released', workstream: 'Financial Analysis', status: 'released' as const },
];
const mockInitialSlides = [{ id: '1', title: 'Kickoff deck', workstream: 'Market Research', commentCount: 2 }];
const mockFinalSlides = [{ id: '1', title: 'Final client deck', workstream: 'Market Research', commentCount: 1 }];
const mockCallNotes = [
  { id: '1', title: 'Q4 planning call', date: new Date(), author: 'LC' },
  { id: '2', title: 'Client sync', date: new Date(Date.now() - 86400000), author: 'LC' },
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

export default function PartnerDashboard() {
  const session = useAuth();
  const router = useRouter();
  const [workstreams, setWorkstreams] = useState<WorkstreamDeadline[]>([]);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const engagementRef = useRef<HTMLDivElement>(null);

  const unreadCount = 0;

  const navScrollMap: Record<string, RefObject<HTMLDivElement | null>> = {
    overview: dashboardRef,
  };

  useEffect(() => {
    // If loading is done and user is NOT logged in, kick them to sign-in
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in'); // replace prevents back-button loops
    }
  }, [session, router]);

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  const handleNavClick = (key: string) => {
    const ref = navScrollMap[key];
    if (ref?.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const buildWorkstreamDeadlines = (tasks: TaskFromApi[]): WorkstreamDeadline[] => {
    const byWorkstream = new Map<
      string,
      { earliestDue: Date; total: number; completed: number }
    >();

    tasks.forEach((task) => {
      const key = task.workstream || 'General';
      const due = new Date(task.dueDate);
      const existing = byWorkstream.get(key);
      if (!existing) {
        byWorkstream.set(key, {
          earliestDue: due,
          total: 1,
          completed: task.completed ? 1 : 0,
        });
      } else {
        if (due < existing.earliestDue) existing.earliestDue = due;
        existing.total += 1;
        if (task.completed) existing.completed += 1;
      }
    });

    const now = new Date();
    return Array.from(byWorkstream.entries()).map(([workstreamName, stats]) => {
      const daysRemaining = Math.floor(
        (stats.earliestDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      const progress =
        stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
      const status: WorkstreamDeadline['status'] =
        daysRemaining < 0 && progress < 100
          ? 'overdue'
          : daysRemaining <= 3 && progress < 60
            ? 'at_risk'
            : 'on_track';

      return {
        id: workstreamName,
        workstreamName,
        deadline: stats.earliestDue,
        daysRemaining,
        progress,
        description: `${stats.total} task${stats.total !== 1 ? 's' : ''} • ${stats.completed} completed`,
        status,
      };
    });
  };

  useEffect(() => {
    const loadEngagement = async () => {
      if (!session.isLoggedIn || !session.user?.email) return;
      try {
        const token = await session.getToken();
        setAuthToken(token || session.user?.email || null);
        const res = await tasksAPI.getAll({ includeCompleted: true });
        const tasks = Array.isArray(res.data) ? (res.data as TaskFromApi[]) : [];
        setWorkstreams(buildWorkstreamDeadlines(tasks));
      } catch {
        setWorkstreams([]);
      }
    };
    void loadEngagement();
  }, [session.isLoggedIn, session.user?.email]);

  useEffect(() => {
    setLastDashboard('/partner');
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      <LCPartnerNavbar
        role="PARTNER"
        currentPath="/partner"
        unreadNotificationCount={unreadCount}
        onNavClick={handleNavClick}
      />

      <div className="flex-1 flex flex-col min-h-screen relative overflow-y-auto">
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 overflow-y-auto">
          <div ref={dashboardRef} className="max-w-[1800px] mx-auto space-y-8 pb-8">
            <div className="grid grid-cols-12 gap-6">
              <div ref={engagementRef} className="col-span-12 lg:col-span-6">
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-[var(--primary)]" />
                      Engagement status & timelines
                    </CardTitle>
                    <CardDescription>View workstream status and deadlines</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 max-h-[400px] overflow-y-auto">
                    {workstreams
                      .sort((a, b) => a.daysRemaining - b.daysRemaining)
                      .map((ws) => (
                        <div
                          key={ws.id}
                          className="p-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/80"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <h5 className="font-semibold text-[var(--foreground)]">{ws.workstreamName}</h5>
                              <p className="text-xs text-[var(--foreground)]/70">{ws.description}</p>
                            </div>
                            <Badge
                              variant={
                                ws.status === 'on_track' ? 'success' : ws.status === 'at_risk' ? 'warning' : 'danger'
                              }
                              size="sm"
                            >
                              {ws.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="mt-3 space-y-1">
                            <div className="flex justify-between text-xs text-[var(--foreground)]/60">
                              <span>Progress</span>
                              <span>{ws.progress ?? 0}%</span>
                            </div>
                            <div className="h-2 bg-[var(--accent)] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[var(--primary)]"
                                style={{ width: `${ws.progress ?? 0}%` }}
                              />
                            </div>
                          </div>
                          <p className="text-xs text-[var(--foreground)]/60 mt-2">{ws.daysRemaining}d remaining</p>
                        </div>
                      ))}
                  </CardContent>
                </Card>
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
