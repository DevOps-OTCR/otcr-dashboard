'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { AppNavbar } from './AppNavbar';
import { WeeklyDeliverablesCard } from './WeeklyDeliverablesCard';
import { projectsAPI, setAuthToken } from '@/lib/api';
import { useNavigationSnapshot } from '@/lib/use-navigation-snapshot';
import { getDashboardDeliverables, type ProjectSprintSummary, type SprintSummary } from '@/lib/dashboard-deliverables';
import { setLastDashboard } from '@/lib/dashboard-context';
import { useRouter } from 'next/navigation';
import type { AppRole } from '@/lib/permissions';

export function OverviewDeliverables({ role, path }: { role: AppRole; path: '/pm' | '/lc' | '/partner' }) {
  const { isLoggedIn, user, getToken } = useAuth();
  const router = useRouter();
  const { snapshot, saveSnapshot } = useNavigationSnapshot<ProjectSprintSummary[]>('overview', user?.email);
  const [projects, setProjects] = useState(snapshot ?? []);
  const [loading, setLoading] = useState(!snapshot);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) { router.replace('/sign-in'); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const token = await getToken();
        if (cancelled) return;
        setAuthToken(token || user?.email || null);
        const res = await projectsAPI.getAll({ limit: 100 });
        const next = await Promise.all((res.data?.projects ?? []).map(async (project: { id: string; name: string }) => {
          const sprints = await projectsAPI.getSprints(project.id);
          return { id: project.id, name: project.name, sprints: sprints.data as SprintSummary[] };
        }));
        if (!cancelled) { setProjects(next); saveSnapshot(next); setError(false); }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isLoggedIn, user?.email, getToken, router, saveSnapshot]);
  useEffect(() => { setLastDashboard(path); }, [path]);

  if (!isLoggedIn) return null;
  return <>
    <AppNavbar role={role} currentPath={path} />
    <WeeklyDeliverablesCard
      description="Current week deliverables and due dates across projects"
      items={getDashboardDeliverables(projects)} loading={loading}
      emptyMessage={error ? 'Could not load deliverables. Return to Overview to retry.' : 'No deliverables found for the current week.'}
    />
    {error && projects.length > 0 && <p role="alert" className="mt-3 text-sm text-red-600">Could not refresh deliverables. Showing previously loaded data.</p>}
  </>;
}
