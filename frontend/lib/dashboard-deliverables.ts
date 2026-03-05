export type SprintDeliverableSummary = {
  id: string;
  title: string;
  deadline: string;
};

export type SprintSummary = {
  id: string;
  label: string;
  weekStartDate: string;
  weekEndDate: string;
  deliverables?: SprintDeliverableSummary[];
};

export type ProjectSprintSummary = {
  id: string;
  name: string;
  sprints: SprintSummary[];
};

export type DashboardDeliverable = {
  id: string;
  title: string;
  deadline: Date;
  projectName: string;
  sprintLabel: string;
};

function isCurrentSprint(sprint: SprintSummary, now: Date): boolean {
  const start = new Date(sprint.weekStartDate);
  const end = new Date(sprint.weekEndDate);
  end.setHours(23, 59, 59, 999);
  return start <= now && now <= end;
}

function normalizeWeekLabel(label: string): string {
  return label.replace(/\bSprint\s+(\d+)\b/gi, 'Week $1').trim();
}

function pickRelevantSprint(sprints: SprintSummary[], now: Date): SprintSummary | null {
  if (sprints.length === 0) return null;

  const currentSprint = sprints.find((sprint) => isCurrentSprint(sprint, now));
  if (currentSprint) return currentSprint;

  const upcoming = [...sprints]
    .filter((sprint) => new Date(sprint.weekStartDate) > now)
    .sort(
      (a, b) =>
        new Date(a.weekStartDate).getTime() - new Date(b.weekStartDate).getTime(),
    );
  if (upcoming[0]) return upcoming[0];

  const mostRecent = [...sprints].sort(
    (a, b) => new Date(b.weekEndDate).getTime() - new Date(a.weekEndDate).getTime(),
  );
  return mostRecent[0] ?? null;
}

export function getDashboardDeliverables(
  projects: ProjectSprintSummary[],
  now = new Date(),
): DashboardDeliverable[] {
  const items = projects.flatMap((project) => {
    const sprint = pickRelevantSprint(project.sprints ?? [], now);
    if (!sprint) return [];

    return (sprint.deliverables ?? []).map((deliverable) => ({
      id: `${project.id}:${deliverable.id}`,
      title: deliverable.title,
      deadline: new Date(deliverable.deadline),
      projectName: project.name,
      sprintLabel: normalizeWeekLabel(sprint.label) || 'Current Week',
    }));
  });

  return items.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}
