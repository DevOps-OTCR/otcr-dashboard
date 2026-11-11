export type PmProjectSummary = {
  id: string;
  name: string;
  draftSprints: number;
  overdue: number;
  dueThisWeek: number;
  nextDeadline: { title: string; deadline: Date } | null;
};

type RawDeliverable = {
  id: string;
  title: string;
  deadline: string;
  status?: string;
  completed?: boolean;
};

type RawSprint = {
  status?: string;
  deliverables?: Array<RawDeliverable>;
};

type RawProject = {
  id: string;
  name: string;
  sprints: Array<RawSprint>;
};

const CLOSED_STATUSES = new Set(['SUBMITTED', 'APPROVED']);

function parseDeadline(value: string): Date | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function isOpen(deliverable: RawDeliverable): boolean {
  if (deliverable.completed === true) {
    return false;
  }
  if (typeof deliverable.status === 'string' && CLOSED_STATUSES.has(deliverable.status)) {
    return false;
  }
  return true;
}

function endOfWeek(now: Date): Date {
  const day = now.getDay();
  const offsetToMonday = (day + 6) % 7;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - offsetToMonday,
    0,
    0,
    0,
    0,
  );
  const end = new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate() + 6,
    23,
    59,
    59,
    999,
  );
  return end;
}

export function summarizePmProjects(projects: Array<RawProject>, now: Date): PmProjectSummary[] {
  const nowMs = now.getTime();
  const weekEndMs = endOfWeek(now).getTime();

  return projects.map((project) => {
    const sprints = Array.isArray(project.sprints) ? project.sprints : [];

    let draftSprints = 0;
    let overdue = 0;
    let dueThisWeek = 0;
    let nextDeadline: { title: string; deadline: Date } | null = null;

    for (const sprint of sprints) {
      if (sprint.status === 'DRAFT') {
        draftSprints += 1;
      }

      const deliverables = Array.isArray(sprint.deliverables) ? sprint.deliverables : [];

      for (const deliverable of deliverables) {
        if (!isOpen(deliverable)) {
          continue;
        }

        const deadline = parseDeadline(deliverable.deadline);
        if (deadline === null) {
          continue;
        }

        const deadlineMs = deadline.getTime();

        if (deadlineMs < nowMs) {
          overdue += 1;
          continue;
        }

        if (deadlineMs <= weekEndMs) {
          dueThisWeek += 1;
        }

        if (nextDeadline === null || deadlineMs < nextDeadline.deadline.getTime()) {
          nextDeadline = { title: deliverable.title, deadline };
        }
      }
    }

    return {
      id: project.id,
      name: project.name,
      draftSprints,
      overdue,
      dueThisWeek,
      nextDeadline,
    };
  });
}

export function canSeePmTools(role: string): boolean {
  return role === 'ADMIN' || role === 'LC' || role === 'PM';
}
