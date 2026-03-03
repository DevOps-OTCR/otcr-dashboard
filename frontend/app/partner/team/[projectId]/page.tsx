'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Activity, ArrowLeft, Users } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { LCPartnerNavbar } from '@/components/LCPartnerNavbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { GoogleCalendarPanel } from '@/components/GoogleCalendarPanel';
import { projectsAPI, tasksAPI, setAuthToken } from '@/lib/api';
import { getEffectiveRole } from '@/lib/permissions';
import type { TaskFromApi } from '@/lib/task-utils';
import type { WorkstreamDeadline } from '@/types';

type ProjectMember = {
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
};

type ProjectDetails = {
  id: string;
  name: string;
  description?: string | null;
  members?: ProjectMember[];
};

function buildWorkstreamDeadlines(tasks: TaskFromApi[]): WorkstreamDeadline[] {
  const byWorkstream = new Map<string, { earliestDue: Date; total: number; completed: number }>();

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
      return;
    }

    if (due < existing.earliestDue) existing.earliestDue = due;
    existing.total += 1;
    if (task.completed) existing.completed += 1;
  });

  const now = new Date();
  return Array.from(byWorkstream.entries()).map(([workstreamName, stats]) => {
    const daysRemaining = Math.floor(
      (stats.earliestDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
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
}

export default function PartnerTeamDashboardPage() {
  const session = useAuth();
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = useMemo(
    () => (typeof params?.projectId === 'string' ? params.projectId : ''),
    [params],
  );

  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [workstreams, setWorkstreams] = useState<WorkstreamDeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dashboardRef = useRef<HTMLDivElement>(null);
  const navScrollMap: Record<string, RefObject<HTMLDivElement | null>> = {
    overview: dashboardRef,
  };

  useEffect(() => {
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in');
    }
  }, [session.loading, session.isLoggedIn, router]);

  useEffect(() => {
    const load = async () => {
      if (!projectId || !session.isLoggedIn || !session.user?.email) return;

      setLoading(true);
      setForbidden(false);
      setErrorMessage(null);

      try {
        const token = await session.getToken();
        setAuthToken(token || session.user.email || null);
        const currentRole = await getEffectiveRole(token, session.user.email);
        const executive = currentRole === 'EXECUTIVE';

        const [projectRes, taskRes] = await Promise.all([
          projectsAPI.getById(projectId, { includeMembers: true }),
          tasksAPI.getAll({ includeCompleted: true }),
        ]);

        const projectData = projectRes.data as ProjectDetails;
        const memberEmails = (projectData.members ?? [])
          .map((m) => (m.user.email ?? '').toLowerCase())
          .filter(Boolean);
        const currentEmail = session.user.email.toLowerCase();

        if (!executive && !memberEmails.includes(currentEmail)) {
          setForbidden(true);
          setProject(null);
          setWorkstreams([]);
          return;
        }

        const allTasks = Array.isArray(taskRes.data) ? (taskRes.data as TaskFromApi[]) : [];
        const scopedTasks = allTasks.filter((task) => task.projectId === projectId);

        setProject(projectData);
        setWorkstreams(buildWorkstreamDeadlines(scopedTasks));
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 403 || status === 404) {
          setForbidden(true);
          setProject(null);
          setWorkstreams([]);
        } else {
          setErrorMessage('Failed to load team dashboard.');
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [projectId, session.isLoggedIn, session.user?.email, session]);

  if (session.loading || !session.isLoggedIn || loading) {
    return <FullScreenLoader />;
  }

  const handleNavClick = (key: string) => {
    const ref = navScrollMap[key];
    if (ref?.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      <LCPartnerNavbar role="PARTNER" currentPath="/partner" onNavClick={handleNavClick} unreadNotificationCount={0} />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 overflow-y-auto">
        <div ref={dashboardRef} className="max-w-[1800px] mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Button variant="ghost" size="sm" className="mb-2" onClick={() => router.push('/teams')}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to teams
              </Button>
              <h1 className="text-2xl font-semibold">
                {project ? `${project.name} Dashboard` : 'Team Dashboard'}
              </h1>
              <p className="text-sm text-[var(--foreground)]/70">
              </p>
            </div>
          </div>

          {forbidden ? (
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Access Restricted</CardTitle>
                <CardDescription>
                  You do not have access to this team dashboard, or the team no longer exists.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : errorMessage ? (
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Unable to load dashboard</CardTitle>
                <CardDescription>{errorMessage}</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-6 space-y-6">
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-[var(--primary)]" />
                      Engagement status & timelines
                    </CardTitle>
                    <CardDescription>
                      Workstream status and deadlines for {project?.name ?? 'this team'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 max-h-[400px] overflow-y-auto">
                    {workstreams.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--foreground)]/60">
                        No tasks found for this team yet.
                      </div>
                    ) : (
                      workstreams
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
                                  ws.status === 'on_track'
                                    ? 'success'
                                    : ws.status === 'at_risk'
                                      ? 'warning'
                                      : 'danger'
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
                                <div className="h-full bg-[var(--primary)]" style={{ width: `${ws.progress ?? 0}%` }} />
                              </div>
                            </div>
                            <p className="text-xs text-[var(--foreground)]/60 mt-2">{ws.daysRemaining}d remaining</p>
                          </div>
                        ))
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-[var(--primary)]" />
                      Team Members
                    </CardTitle>
                    <CardDescription>Current members on this team</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {(project?.members ?? []).map((m) => (
                        <li
                          key={m.user.id}
                          className="py-2 px-3 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm"
                        >
                          {m.user.email}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              <div className="col-span-12 lg:col-span-6">
                <GoogleCalendarPanel
                  className="shadow-lg h-full"
                  title={`${project?.name ?? 'Team'} Calendar`}
                  description="Upcoming dates and deadlines"
                  projectId={projectId}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
