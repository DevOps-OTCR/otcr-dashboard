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
import type { ProjectSprintSummary } from '@/lib/dashboard-deliverables';
import { useAuth } from '@/components/AuthContext';

export type ScheduleProject = { id: string; name: string; color: string };

type UseCmsScheduleResult = {
  items: CalendarItem[];
  setItems: React.Dispatch<React.SetStateAction<CalendarItem[]>>;
  projects: ScheduleProject[];
  loading: boolean;
  error: string | null;
  warning: string | null;
};

type ScheduleProjectRow = {
  id: string;
  name: string;
  timeZone: string;
  canManage: boolean;
};

type ScheduleDeliverableRow = {
  id: string;
  title: string;
  deadline: string;
  projectId: string;
  status: string;
};

export function useCmsSchedule(
  refreshKey = 0,
  from: Date,
  to: Date,
): UseCmsScheduleResult {
  const { user, getToken } = useAuth();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [projects, setProjects] = useState<ScheduleProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const fromMs = from.getTime();
  const toMs = to.getTime();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const token = await getToken();
        if (cancelled) return;
        setLoading(true);
        setAuthToken(token || user?.email || null);

        const res = await projectsAPI.getSchedule(
          new Date(fromMs).toISOString(),
          new Date(toMs).toISOString(),
        );
        if (cancelled) return;
        const rawProjects: ScheduleProjectRow[] =
          res.data?.projects ?? [];
        const rawDeliverables: ScheduleDeliverableRow[] =
          res.data?.deliverables ?? [];

        const deliverablesByProject = new Map<string, ScheduleDeliverableRow[]>();
        for (const deliverable of rawDeliverables) {
          const list = deliverablesByProject.get(deliverable.projectId);
          if (list) {
            list.push(deliverable);
          } else {
            deliverablesByProject.set(deliverable.projectId, [deliverable]);
          }
        }

        const manageableIds = new Set<string>();
        for (const project of rawProjects) {
          if (project.canManage) manageableIds.add(project.id);
        }

        const nextProjects: ProjectSprintSummary[] = rawProjects.map((project) => ({
          id: project.id,
          name: project.name,
          timeZone: project.timeZone,
          sprints: [
            {
              id: 'schedule',
              label: '',
              weekStartDate: '',
              weekEndDate: '',
              deliverables: (deliverablesByProject.get(project.id) ?? []).map(
                (deliverable) => ({
                  id: deliverable.id,
                  title: deliverable.title,
                  deadline: deliverable.deadline,
                }),
              ),
            },
          ],
        }));

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
  }, [getToken, user?.email, refreshKey, fromMs, toMs]);

  return { items, setItems, projects, loading, error, warning };
}
