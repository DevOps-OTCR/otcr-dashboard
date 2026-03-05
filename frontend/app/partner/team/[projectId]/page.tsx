'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Users } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { AppNavbar } from '@/components/AppNavbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { GoogleCalendarPanel } from '@/components/GoogleCalendarPanel';
import { WeeklyDeliverablesCard } from '@/components/WeeklyDeliverablesCard';
import { projectsAPI, setAuthToken } from '@/lib/api';
import {
  getDashboardDeliverables,
  type DashboardDeliverable,
  type ProjectSprintSummary,
  type SprintSummary,
} from '@/lib/dashboard-deliverables';
import { getEffectiveRole } from '@/lib/permissions';

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

export default function PartnerTeamDashboardPage() {
  const session = useAuth();
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = useMemo(
    () => (typeof params?.projectId === 'string' ? params.projectId : ''),
    [params],
  );

  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [dashboardDeliverables, setDashboardDeliverables] = useState<DashboardDeliverable[]>([]);
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

        const projectRes = await projectsAPI.getById(projectId, { includeMembers: true });

        const projectData = projectRes.data as ProjectDetails;
        const memberEmails = (projectData.members ?? [])
          .map((m) => (m.user.email ?? '').toLowerCase())
          .filter(Boolean);
        const currentEmail = session.user.email.toLowerCase();

        if (!executive && !memberEmails.includes(currentEmail)) {
          setForbidden(true);
          setProject(null);
          setDashboardDeliverables([]);
          return;
        }

        const sprintsRes = await projectsAPI.getSprints(projectId);
        const projectSprintSummary = {
          id: projectData.id,
          name: projectData.name,
          sprints: (Array.isArray(sprintsRes.data) ? sprintsRes.data : []) as SprintSummary[],
        } satisfies ProjectSprintSummary;

        setProject(projectData);
        setDashboardDeliverables(getDashboardDeliverables([projectSprintSummary]));
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 403 || status === 404) {
          setForbidden(true);
          setProject(null);
          setDashboardDeliverables([]);
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
      <AppNavbar role="PARTNER" currentPath="/partner" unreadNotificationCount={0} />

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
                <WeeklyDeliverablesCard
                  description={`Current week deliverables and due dates for ${project?.name ?? 'this team'}`}
                  items={dashboardDeliverables}
                  emptyMessage="No deliverables found for the current week."
                />

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
