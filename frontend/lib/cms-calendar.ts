import type { ProjectSprintSummary } from './dashboard-deliverables';

export type { ProjectSprintSummary };

export const PROJECT_COLORS = ['#039BE5','#33B679','#8E24AA','#E67C73','#F6BF26','#F4511E','#3F51B5','#0B8043'] as const;
export const EVENT_COLOR = '#475569';

export type CalendarItem = {
  id: string;
  kind: 'deliverable' | 'event';
  title: string;
  start: Date;
  projectId: string | null;
  projectName: string;
  color: string;
  draggable: boolean;
};

export type CalendarEventInput = {
  id: string;
  title: string;
  eventDate: string;
  projectId?: string | null;
  projectName?: string | null;
  audienceScope?: string;
};

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = Sun, 1 = Mon, ...
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(addDays(start, i));
  }
  return days;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

export function buildCalendarItems(
  projects: ProjectSprintSummary[],
  events: CalendarEventInput[],
  manageableProjectIds: Set<string>,
): CalendarItem[] {
  const items: CalendarItem[] = [];

  projects.forEach((project, projectIndex) => {
    const color = PROJECT_COLORS[projectIndex % PROJECT_COLORS.length];
    const draggable = manageableProjectIds.has(project.id);

    for (const sprint of project.sprints) {
      const deliverables = sprint.deliverables ?? [];
      for (const deliverable of deliverables) {
        const start = new Date(deliverable.deadline);
        if (!isValidDate(start)) continue;
        items.push({
          id: `deliverable:${deliverable.id}`,
          kind: 'deliverable',
          title: deliverable.title,
          start,
          projectId: project.id,
          projectName: project.name,
          color,
          draggable,
        });
      }
    }
  });

  for (const event of events) {
    const start = new Date(event.eventDate);
    if (!isValidDate(start)) continue;
    items.push({
      id: `event:${event.id}`,
      kind: 'event',
      title: event.title,
      start,
      projectId: event.projectId ?? null,
      projectName: event.projectName ?? 'OTCR',
      color: EVENT_COLOR,
      draggable: false,
    });
  }

  items.sort((a, b) => a.start.getTime() - b.start.getTime());
  return items;
}

export function itemsForDay(items: CalendarItem[], day: Date): CalendarItem[] {
  return items.filter((item) => sameDay(item.start, day));
}

export function moveToDay(start: Date, targetDay: Date): Date {
  const d = new Date(targetDay);
  d.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
  return d;
}

export function deliverableIdOf(item: CalendarItem): string {
  return item.id.startsWith('deliverable:') ? item.id.slice('deliverable:'.length) : item.id;
}
