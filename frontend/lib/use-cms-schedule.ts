'use client';

import { useEffect, useState } from 'react';
import type React from 'react';
import { attendanceAPI, projectsAPI, setAuthToken } from '@/lib/api';
import {
  buildCalendarItems,
  PROJECT_COLORS,
  type CalendarEventInput,
  type CalendarItem,
} from '@/lib/cms-calendar';
import type { ProjectSprintSummary, SprintSummary } from '@/lib/dashboard-deliverables';
import { useAuth } from '@/components/AuthContext';
import { getEffectiveRole } from '@/lib/permissions';

export type ScheduleProject = { id: string; name: string; color: string };

type UseCmsScheduleResult = {
  items: CalendarItem[];
  setItems: React.Dispatch<React.SetStateAction<CalendarItem[]>>;
  projects: ScheduleProject[];
  loading: boolean;
  error: string | null;
  warning: string | null;
};

export function useCmsSchedule(refreshKey = 0): UseCmsScheduleResult {
  const { user, getToken } = useAuth();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [projects, setProjects] = useState<ScheduleProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const token = await getToken();
        if (cancelled) return;
        setAuthToken(token || user?.email || null);

        const role = await getEffectiveRole(token, user?.email);
        if (cancelled) return;

        const res = await projectsAPI.getAll({ includeMembers: true, limit: 100 });
        const rawProjects: Array<{
          id: string;
          name: string;
          pm?: { email?: string | null } | null;
          sprintTimezone?: string | null;
        }> = res.data?.projects ?? [];

        const email = user?.email?.toLowerCase() ?? '';
        const manageableIds = new Set<string>();
        if (role === 'ADMIN' || role === 'LC') {
          for (const project of rawProjects) manageableIds.add(project.id);
        } else if (role === 'PM') {
          for (const project of rawProjects) {
            if (project.pm?.email?.toLowerCase() === email && email) {
              manageableIds.add(project.id);
            }
          }
        }

        const nextProjects: ProjectSprintSummary[] = await Promise.all(
          rawProjects.map(async (project) => {
            const sprints = await projectsAPI.getSprints(project.id);
            const allSprints = (sprints.data as Array<SprintSummary & { status?: string }>) ?? [];
            const visibleSprints = manageableIds.has(project.id)
              ? allSprints
              : allSprints.filter((sprint) => sprint.status === 'RELEASED');
            return {
              id: project.id,
              name: project.name,
              sprints: visibleSprints,
              timeZone: project.sprintTimezone ?? undefined,
            };
          }),
        );
        if (cancelled) return;

        let events: CalendarEventInput[] = [];
        let eventsWarning: string | null = null;
        try {
          const eventsRes = await attendanceAPI.listEvents();
          events = (eventsRes.data?.events ?? []) as CalendarEventInput[];
        } catch {
          events = [];
          eventsWarning = 'OTCR events could not be loaded, so only deadlines are shown.';
        }
        if (cancelled) return;

        setProjects(
          rawProjects.map((project, i) => ({
            id: project.id,
            name: project.name,
            color: PROJECT_COLORS[i % PROJECT_COLORS.length],
          })),
        );
        setItems(buildCalendarItems(nextProjects, events, manageableIds));
        setWarning(eventsWarning);
        setError(null);
      } catch {
        if (!cancelled) setError('Could not load the schedule.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [getToken, user?.email, refreshKey]);

  return { items, setItems, projects, loading, error, warning };
}
