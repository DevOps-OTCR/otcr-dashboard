import type { ActionItem } from '@/types';
import { getDaysUntil } from '@/lib/utils';

/** Task as returned from backend API. */
export type TaskFromApi = {
  id: string;
  taskName: string;
  description?: string | null;
  dueDate: string;
  projectName: string;
  workstream: string;
  workstreamId?: string | null;
  status: string;
  completed: boolean;
  createdById: string;
  assigneeType: string;
  assigneeEmail?: string | null;
  projectId?: string | null;
  createdAt: string;
  updatedAt: string;
  consultantTaskStatus?: string | null;
};

export type TeamForTasks = { id: string; name: string; memberEmails: string[] };

/** Get display label for assignee from task and optional teams (for ALL_TEAM). */
export function getAssigneeLabelForTask(task: TaskFromApi, teams?: TeamForTasks[]): string {
  if (task.assigneeType === 'PERSON' && task.assigneeEmail) return task.assigneeEmail;
  if (task.assigneeType === 'ALL') return 'Everyone';
  if (task.assigneeType === 'ALL_PMS') return 'All PMs';
  if (task.assigneeType === 'ALL_TEAM' && task.projectId && teams) {
    const team = teams.find((t) => t.id === task.projectId);
    return team ? `Entire team: ${team.name}` : 'Entire team';
  }
  return '—';
}

/** Convert API task to ActionItem for dashboard display. */
export function taskToActionItem(task: TaskFromApi, assigneeLabel: string): ActionItem {
  const due = new Date(task.dueDate);
  const daysLeft = getDaysUntil(due);
  const status = task.completed
    ? 'completed'
    : daysLeft < 0
      ? 'overdue'
      : task.status === 'IN_PROGRESS'
        ? 'in_progress'
        : 'pending';
  return {
    id: task.id,
    taskName: task.taskName,
    dueDate: due,
    projectName: task.projectName,
    workstream: task.workstream,
    status,
    assignedTo: assigneeLabel,
    description: task.description ?? undefined,
    completed: task.completed,
  };
}
