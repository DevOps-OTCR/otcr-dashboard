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
  timeZone?: string;
};

type ProjectInput = ProjectSprintSummary & { timeZone?: string };

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
  projects: ProjectInput[],
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
          timeZone: project.timeZone,
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

export function startOfMonth(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(1);
  return out;
}

export function monthGridDays(anchor: Date): Date[] {
  const start = startOfWeek(startOfMonth(anchor));
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDays(start, i));
  }
  return days;
}

function wallClockInZone(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).formatToParts(date);
    const values: Record<string, number> = {};
    for (const part of parts) {
      if (part.type === 'year' || part.type === 'month' || part.type === 'day' || part.type === 'hour' || part.type === 'minute') {
        values[part.type] = Number(part.value);
      }
    }
    const { year, month, day, hour, minute } = values;
    if ([year, month, day, hour, minute].some((n) => typeof n !== 'number' || Number.isNaN(n))) return null;
    return { year, month, day, hour, minute };
  } catch {
    return null;
  }
}

export function moveToDayInZone(start: Date, targetDay: Date, timeZone?: string): Date {
  if (!timeZone || !isValidDate(start) || !isValidDate(targetDay)) {
    return moveToDay(start, targetDay);
  }
  const zoned = wallClockInZone(start, timeZone);
  if (!zoned) return moveToDay(start, targetDay);

  const guess = Date.UTC(targetDay.getFullYear(), targetDay.getMonth(), targetDay.getDate(), zoned.hour, zoned.minute, 0, 0);
  const guessParts = wallClockInZone(new Date(guess), timeZone);
  if (!guessParts) return moveToDay(start, targetDay);
  const guessZoned = Date.UTC(guessParts.year, guessParts.month - 1, guessParts.day, guessParts.hour, guessParts.minute, 0, 0);
  const offset1 = guessZoned - guess;
  let result = guess - offset1;

  const resultParts = wallClockInZone(new Date(result), timeZone);
  if (resultParts) {
    const resultZoned = Date.UTC(resultParts.year, resultParts.month - 1, resultParts.day, resultParts.hour, resultParts.minute, 0, 0);
    const offset2 = resultZoned - result;
    if (offset2 !== offset1) result = guess - offset2;
  }

  return new Date(result);
}

export function deliverableIdOf(item: CalendarItem): string {
  return item.id.startsWith('deliverable:') ? item.id.slice('deliverable:'.length) : item.id;
}
