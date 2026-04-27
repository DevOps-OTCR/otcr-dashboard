'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckSquare, Square, Users, Link as LinkIcon } from 'lucide-react';
import { AppNavbar } from '@/components/AppNavbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { deliverablesAPI, projectsAPI, setAuthToken } from '@/lib/api';
import { getEffectiveRole, type AppRole } from '@/lib/permissions';

type ProjectOption = {
  id: string;
  name: string;
};

type TeamMemberOption = {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};

type DeliverableItem = {
  id: string;
  title: string;
  deadline: string;
  templateKind?: string;
  status: string;
  completed?: boolean;
  assignees?: Array<{
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  }>;
  latestSubmission?: {
    id: string;
    fileUrl: string;
    submittedAt: string;
    status?: string;
    submitter?: {
      id: string;
      email?: string;
      firstName?: string;
      lastName?: string;
    };
  } | null;
  subtasks?: Array<{
    id: string;
    title: string;
    notes?: string | null;
    dueDate?: string | null;
    completed: boolean;
    assigneeId?: string | null;
    assignee?: TeamMemberOption | null;
  }>;
};

type DeliverableSubmitter = {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};

type SprintItem = {
  id: string;
  label: string;
  status: string;
  weekStartDate: string;
  weekEndDate: string;
  deliverables?: DeliverableItem[];
};

function normalizeWeekText(value: string) {
  return value.replace(/\bSprint\s+(\d+)\b/gi, 'Week $1');
}

function formatWeekLabel(value: string, fallbackIndex?: number) {
  const normalized = normalizeWeekText(value).trim();
  if (normalized) return normalized;
  if (fallbackIndex != null) return `Week ${fallbackIndex + 1}`;
  return 'Week';
}

function formatAssignees(assignees?: DeliverableItem['assignees']) {
  if (!assignees || assignees.length === 0) return 'Unassigned';
  const names = assignees
    .map((assignee) =>
      [assignee.firstName, assignee.lastName]
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => value.replace(/,+/g, '').trim())
        .filter(Boolean)
        .join(' ')
        .trim(),
    )
    .filter(Boolean);
  return names.length > 0 ? names.join(', ') : 'Assigned';
}

function formatPerson(person?: TeamMemberOption | null) {
  if (!person) return 'Unassigned';
  const fullName = [person.firstName, person.lastName]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.replace(/,+/g, '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return fullName || person.email || 'Team member';
}

function formatSubmitter(
  submitter?: DeliverableSubmitter,
) {
  if (!submitter) return 'Unknown submitter';
  const fullName = [submitter.firstName, submitter.lastName]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.replace(/,+/g, '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return fullName || 'Unknown submitter';
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function DeliverablesPage() {
  const session = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<AppRole>('CONSULTANT');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [sprints, setSprints] = useState<SprintItem[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyDeliverableId, setBusyDeliverableId] = useState<string | null>(null);
  const [submitLinks, setSubmitLinks] = useState<Record<string, string>>({});
  const [assignmentTargets, setAssignmentTargets] = useState<Record<string, string>>({});
  const [deadlineInputs, setDeadlineInputs] = useState<Record<string, string>>({});
  const [subtaskEdits, setSubtaskEdits] = useState<
    Record<string, { title: string; dueDate: string; assigneeId: string; completed: boolean }>
  >({});
  const [newSubtasks, setNewSubtasks] = useState<
    Record<string, { title: string; dueDate: string; assigneeId: string }>
  >({});
  const [busySubtaskId, setBusySubtaskId] = useState<string | null>(null);
  const [creatingSubtaskFor, setCreatingSubtaskFor] = useState<string | null>(null);

  const canManage = role === 'PM' || role === 'LC' || role === 'ADMIN';
  const currentEmail = (session.user?.email ?? '').toLowerCase();

  const loadSprints = useCallback(async (projectId: string) => {
    try {
      setLoadError(null);
      const res = await projectsAPI.getSprints(projectId);
      const sprintList = (res.data ?? []) as SprintItem[];
      setSprints(sprintList);
      setSelectedSprintId((current) =>
        current && sprintList.some((item) => item.id === current) ? current : sprintList[0]?.id ?? '',
      );
    } catch (error: any) {
      setSprints([]);
      setSelectedSprintId('');
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to load deliverables.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    }
  }, []);

  const loadTeamMembers = useCallback(async (projectId: string) => {
    try {
      const res = await projectsAPI.getById(projectId, { includeMembers: true });
      const project = (res.data ?? {}) as {
        pm?: TeamMemberOption;
        members?: Array<{ user?: TeamMemberOption | null }>;
      };

      const nextMembers = new Map<string, TeamMemberOption>();

      if (project.pm?.id) {
        nextMembers.set(project.pm.id, project.pm);
      }

      (project.members ?? []).forEach((member) => {
        if (member.user?.id) {
          nextMembers.set(member.user.id, member.user);
        }
      });

      setTeamMembers(Array.from(nextMembers.values()));
      setAssignmentTargets({});
    } catch {
      setTeamMembers([]);
      setAssignmentTargets({});
    }
  }, []);

  useEffect(() => {
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in');
    }
  }, [session.loading, session.isLoggedIn, router]);

  useEffect(() => {
    const init = async () => {
      if (!session.isLoggedIn || !session.user?.email) return;

      try {
        const token = await session.getToken();
        if (token) setAuthToken(token);

        const nextRole = await getEffectiveRole(token, session.user.email);
        setRole(nextRole);

        const projectsRes = await projectsAPI.getAll({ limit: 100 });
        const nextProjects = ((projectsRes.data?.projects ?? []) as Array<{ id: string; name: string }>).map(
          (item) => ({ id: item.id, name: item.name }),
        );
        setProjects(nextProjects);

        const firstProjectId = nextProjects[0]?.id ?? '';
        setSelectedProjectId(firstProjectId);
        if (firstProjectId) {
          await Promise.all([loadSprints(firstProjectId), loadTeamMembers(firstProjectId)]);
        }
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [session, session.isLoggedIn, session.user?.email, loadSprints, loadTeamMembers]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const visibleSprints = useMemo(
    () =>
      sprints
        .filter((sprint) => (canManage ? true : sprint.status === 'RELEASED'))
        .map((sprint) => ({
          ...sprint,
          deliverables: (sprint.deliverables ?? []).filter(
            (deliverable) =>
              deliverable.templateKind !== 'INITIAL_SLIDES' &&
              deliverable.templateKind !== 'FINAL_SLIDES' &&
              deliverable.templateKind !== 'INITIAL_WHITEPAPER' &&
              deliverable.templateKind !== 'FINAL_WHITEPAPER',
          ),
        }))
        .filter((sprint) => (sprint.deliverables ?? []).length > 0),
    [canManage, sprints],
  );

  const selectedSprint = useMemo(
    () => visibleSprints.find((sprint) => sprint.id === selectedSprintId) ?? visibleSprints[0] ?? null,
    [visibleSprints, selectedSprintId],
  );

  useEffect(() => {
    setDeadlineInputs(
      Object.fromEntries(
        ((selectedSprint?.deliverables ?? []) as DeliverableItem[]).map((deliverable) => [
          deliverable.id,
          toDateTimeLocalValue(deliverable.deadline),
        ]),
      ),
    );
    setSubtaskEdits(
      Object.fromEntries(
        ((selectedSprint?.deliverables ?? []) as DeliverableItem[])
          .flatMap((deliverable) =>
            (deliverable.subtasks ?? []).map((subtask) => [
              subtask.id,
              {
                title: subtask.title,
                dueDate: subtask.dueDate ? toDateTimeLocalValue(subtask.dueDate) : '',
                assigneeId: subtask.assigneeId ?? '',
                completed: subtask.completed,
              },
            ]),
          ),
      ),
    );
    setNewSubtasks(
      Object.fromEntries(
        ((selectedSprint?.deliverables ?? []) as DeliverableItem[]).map((deliverable) => [
          deliverable.id,
          { title: '', dueDate: '', assigneeId: '' },
        ]),
      ),
    );
  }, [selectedSprint]);

  const handleProjectChange = async (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedSprintId('');
    if (!projectId) {
      setSprints([]);
      setTeamMembers([]);
      setAssignmentTargets({});
      return;
    }

    setLoading(true);
    try {
      await Promise.all([loadSprints(projectId), loadTeamMembers(projectId)]);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignmentToggle = async (deliverable: DeliverableItem) => {
    if (!selectedProjectId) return;

    const assignedToCurrentUser = Boolean(
      deliverable.assignees?.some(
        (assignee) => assignee.email?.toLowerCase() === currentEmail,
      ),
    );

    setBusyDeliverableId(deliverable.id);
    try {
      await deliverablesAPI.updateAssignment(deliverable.id, !assignedToCurrentUser);
      await loadSprints(selectedProjectId);
      setFeedback(assignedToCurrentUser ? 'Unassigned' : 'Assigned to you');
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to update assignment.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setBusyDeliverableId(null);
    }
  };

  const handleCompletionToggle = async (deliverable: DeliverableItem) => {
    if (!selectedProjectId) return;

    const assignedToCurrentUser = Boolean(
      deliverable.assignees?.some(
        (assignee) => assignee.email?.toLowerCase() === currentEmail,
      ),
    );
    const canToggle = canManage || assignedToCurrentUser;
    if (!canToggle) return;

    setBusyDeliverableId(deliverable.id);
    try {
      await deliverablesAPI.updateCompletion(deliverable.id, !deliverable.completed);
      await loadSprints(selectedProjectId);
      setFeedback(deliverable.completed ? 'Marked incomplete' : 'Marked complete');
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to update completion.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setBusyDeliverableId(null);
    }
  };

  const handleManagerAssignment = async (deliverable: DeliverableItem) => {
    const assigneeId = assignmentTargets[deliverable.id];

    if (!selectedProjectId || !assigneeId) return;

    setBusyDeliverableId(deliverable.id);
    try {
      const assigneeAlreadyAssigned = Boolean(
        deliverable.assignees?.some((assignee) => assignee.id === assigneeId),
      );

      await deliverablesAPI.updateAssignment(
        deliverable.id,
        !assigneeAlreadyAssigned,
        assigneeId,
      );
      await loadSprints(selectedProjectId);
      setAssignmentTargets((current) => ({
        ...current,
        [deliverable.id]: '',
      }));

      const target = teamMembers.find((member) => member.id === assigneeId);
      const targetLabel = target ? formatPerson(target) : 'Team member';
      setFeedback(
        assigneeAlreadyAssigned
          ? `${targetLabel} unassigned`
          : `${targetLabel} assigned`,
      );
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to assign team member.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setBusyDeliverableId(null);
    }
  };

  const handleSubmitLink = async (deliverable: DeliverableItem) => {
    if (!selectedProjectId) return;
    const link = (submitLinks[deliverable.id] ?? '').trim();

    if (!link) {
      setLoadError('Add a submission link first.');
      return;
    }

    const assignedToCurrentUser = Boolean(
      deliverable.assignees?.some(
        (assignee) => assignee.email?.toLowerCase() === currentEmail,
      ),
    );
    if (!canManage && !assignedToCurrentUser) {
      setLoadError('Assign yourself to this deliverable before submitting.');
      return;
    }

    setBusyDeliverableId(deliverable.id);
    try {
      await deliverablesAPI.submitLink(deliverable.id, link);
      setSubmitLinks((current) => ({ ...current, [deliverable.id]: '' }));
      await loadSprints(selectedProjectId);
      setFeedback('Submission link saved');
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to submit link.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setBusyDeliverableId(null);
    }
  };

  const handleUpdateDeadline = async (deliverable: DeliverableItem) => {
    if (!selectedProjectId || !canManage) return;
    const nextDeadline = deadlineInputs[deliverable.id];
    if (!nextDeadline) return;

    setBusyDeliverableId(deliverable.id);
    try {
      await deliverablesAPI.updateDeadline(
        deliverable.id,
        new Date(nextDeadline).toISOString(),
      );
      await loadSprints(selectedProjectId);
      setFeedback('Due date updated');
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to update due date.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setBusyDeliverableId(null);
    }
  };

  const handleCreateSubtask = async (deliverable: DeliverableItem) => {
    if (!selectedProjectId || !canManage) return;
    const draft = newSubtasks[deliverable.id];
    if (!draft?.title.trim()) return;

    setCreatingSubtaskFor(deliverable.id);
    try {
      await deliverablesAPI.createSubtask(deliverable.id, {
        title: draft.title.trim(),
        dueDate: draft.dueDate ? new Date(draft.dueDate).toISOString() : undefined,
        assigneeId: draft.assigneeId || undefined,
      });
      await loadSprints(selectedProjectId);
      setFeedback('Subtask added');
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to create subtask.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setCreatingSubtaskFor(null);
    }
  };

  const handleUpdateSubtask = async (
    subtask: NonNullable<DeliverableItem['subtasks']>[number],
  ) => {
    if (!selectedProjectId) return;
    const edit = subtaskEdits[subtask.id];
    if (!edit?.title.trim()) return;

    setBusySubtaskId(subtask.id);
    try {
      await deliverablesAPI.updateSubtask(subtask.id, {
        title: edit.title.trim(),
        dueDate: edit.dueDate ? new Date(edit.dueDate).toISOString() : null,
        assigneeId: canManage ? edit.assigneeId || null : undefined,
        completed: edit.completed,
      });
      await loadSprints(selectedProjectId);
      setFeedback('Subtask updated');
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to update subtask.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setBusySubtaskId(null);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!selectedProjectId || !canManage) return;

    setBusySubtaskId(subtaskId);
    try {
      await deliverablesAPI.deleteSubtask(subtaskId);
      await loadSprints(selectedProjectId);
      setFeedback('Subtask deleted');
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to delete subtask.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setBusySubtaskId(null);
    }
  };

  const handleToggleSubtaskCompletion = async (
    subtask: NonNullable<DeliverableItem['subtasks']>[number],
  ) => {
    if (!selectedProjectId) return;

    setBusySubtaskId(subtask.id);
    try {
      await deliverablesAPI.updateSubtask(subtask.id, {
        completed: !subtask.completed,
      });
      await loadSprints(selectedProjectId);
      setFeedback(subtask.completed ? 'Subtask reopened' : 'Subtask completed');
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to update subtask.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setBusySubtaskId(null);
    }
  };

  if (session.loading || !session.isLoggedIn || loading) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      <AppNavbar role={role} currentPath="/deliverables" />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[var(--primary)]" />
                Deliverables
              </CardTitle>
              <CardDescription>
                {canManage
                  ? 'Assign non-slide deliverables to team members here. Consultants can still assign themselves after release.'
                  : 'Released execution work. Assign yourself, submit links for your tasks, and track completion here.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedProjectId}
                  onChange={(e) => void handleProjectChange(e.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              {loadError && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
                  {loadError}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {visibleSprints.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--foreground)]/60">
                    {canManage ? 'No non-slide deliverables yet.' : 'No released non-slide deliverables yet.'}
                  </div>
                ) : (
                  visibleSprints.map((sprint, index) => (
                    <button
                      key={sprint.id}
                      type="button"
                      onClick={() => setSelectedSprintId(sprint.id)}
                      className={cn(
                        'rounded-xl border px-4 py-2 text-sm font-medium transition-colors',
                        sprint.id === selectedSprint?.id
                          ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                          : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]/75 hover:bg-[var(--accent)]',
                      )}
                    >
                      {formatWeekLabel(sprint.label, index)}
                    </button>
                  ))
                )}
              </div>

              {selectedSprint && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--foreground)]">
                        {formatWeekLabel(
                          selectedSprint.label,
                          visibleSprints.findIndex((item) => item.id === selectedSprint.id),
                        )}
                      </h3>
                      <p className="text-sm text-[var(--foreground)]/60">
                        {new Date(selectedSprint.weekStartDate).toLocaleDateString()} - {new Date(selectedSprint.weekEndDate).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      {selectedSprint.status}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {(selectedSprint.deliverables ?? []).map((deliverable) => {
                      const assignedToCurrentUser = Boolean(
                        deliverable.assignees?.some(
                          (assignee) => assignee.email?.toLowerCase() === currentEmail,
                        ),
                      );
                      const canToggleCompletion = canManage || assignedToCurrentUser;
                      const canSubmit = canManage || assignedToCurrentUser;

                      return (
                        <div
                          key={deliverable.id}
                          className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/70 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[var(--foreground)]">
                                {normalizeWeekText(deliverable.title)}
                              </p>
                              <p className="mt-1 text-xs text-[var(--foreground)]/55">
                                Due {new Date(deliverable.deadline).toLocaleString()}
                              </p>
                            </div>
                            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] uppercase tracking-wide text-emerald-700">
                              {deliverable.status.replace(/_/g, ' ')}
                            </span>
                          </div>

                          <div className="mt-4 space-y-3">
                            <div>
                              <p className="text-xs font-medium text-[var(--foreground)]/70">Assigned</p>
                              <p className="text-sm text-[var(--foreground)]">{formatAssignees(deliverable.assignees)}</p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {canManage && (
                                <>
                                  <input
                                    type="datetime-local"
                                    value={deadlineInputs[deliverable.id] ?? ''}
                                    onChange={(e) =>
                                      setDeadlineInputs((current) => ({
                                        ...current,
                                        [deliverable.id]: e.target.value,
                                      }))
                                    }
                                    className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                      busyDeliverableId === deliverable.id ||
                                      !(deadlineInputs[deliverable.id] ?? '') ||
                                      deadlineInputs[deliverable.id] === toDateTimeLocalValue(deliverable.deadline)
                                    }
                                    onClick={() => void handleUpdateDeadline(deliverable)}
                                  >
                                    Save Due Date
                                  </Button>
                                </>
                              )}
                              {canManage && teamMembers.length > 0 && (
                                <>
                                  <select
                                    value={assignmentTargets[deliverable.id] ?? ''}
                                    onChange={(e) =>
                                      setAssignmentTargets((current) => ({
                                        ...current,
                                        [deliverable.id]: e.target.value,
                                      }))
                                    }
                                    className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"
                                  >
                                    <option value="">Assign to team member</option>
                                    {teamMembers.map((member) => (
                                      <option key={member.id} value={member.id}>
                                        {formatPerson(member)}
                                      </option>
                                    ))}
                                  </select>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                      busyDeliverableId === deliverable.id ||
                                      !(assignmentTargets[deliverable.id] ?? '')
                                    }
                                    onClick={() => void handleManagerAssignment(deliverable)}
                                  >
                                    {deliverable.assignees?.some(
                                      (assignee) => assignee.id === assignmentTargets[deliverable.id],
                                    )
                                      ? 'Remove Person'
                                      : 'Assign Person'}
                                  </Button>
                                </>
                              )}
                              <Button
                                size="sm"
                                variant={assignedToCurrentUser ? 'outline' : 'primary'}
                                disabled={busyDeliverableId === deliverable.id}
                                onClick={() => void handleAssignmentToggle(deliverable)}
                              >
                                {assignedToCurrentUser ? 'Unassign' : 'Assign To Me'}
                              </Button>
                              <button
                                type="button"
                                onClick={() => canToggleCompletion && void handleCompletionToggle(deliverable)}
                                disabled={!canToggleCompletion || busyDeliverableId === deliverable.id}
                                className={cn(
                                  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                                  canToggleCompletion
                                    ? 'border-[var(--border)] hover:bg-[var(--accent)]'
                                    : 'border-[var(--border)] opacity-50 cursor-not-allowed',
                                )}
                              >
                                {deliverable.completed ? (
                                  <CheckSquare className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <Square className="w-4 h-4 text-[var(--foreground)]/55" />
                                )}
                                {deliverable.completed ? 'Completed' : 'Complete'}
                              </button>
                            </div>

                            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                              <div className="flex items-center gap-2">
                                <LinkIcon className="w-4 h-4 text-[var(--primary)]" />
                                <p className="text-sm font-medium text-[var(--foreground)]">
                                  Submission Link
                                </p>
                              </div>
                              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                <input
                                  value={submitLinks[deliverable.id] ?? ''}
                                  onChange={(e) =>
                                    setSubmitLinks((current) => ({
                                      ...current,
                                      [deliverable.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="https://..."
                                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                                />
                                <Button
                                  size="sm"
                                  disabled={
                                    busyDeliverableId === deliverable.id ||
                                    !canSubmit ||
                                    !(submitLinks[deliverable.id] ?? '').trim()
                                  }
                                  onClick={() => void handleSubmitLink(deliverable)}
                                >
                                  Submit Link
                                </Button>
                              </div>
                              {!canSubmit && (
                                <p className="mt-2 text-xs text-[var(--foreground)]/60">
                                  Assign yourself first to submit this deliverable.
                                </p>
                              )}
                              {deliverable.latestSubmission && (
                                <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)]/60 p-3">
                                  <p className="text-xs font-medium text-[var(--foreground)]/70">
                                    Latest submission by {formatSubmitter(deliverable.latestSubmission.submitter)}
                                  </p>
                                  <a
                                    href={deliverable.latestSubmission.fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 block text-sm font-medium text-[var(--primary)] hover:underline"
                                  >
                                    View submission
                                  </a>
                                  <p className="mt-1 text-xs text-[var(--foreground)]/60">
                                    {new Date(deliverable.latestSubmission.submittedAt).toLocaleString()}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-[var(--foreground)]">Subtasks</p>
                                  <p className="text-xs text-[var(--foreground)]/60">
                                    Split the deliverable into smaller assigned steps.
                                  </p>
                                </div>
                                <span className="text-xs text-[var(--foreground)]/55">
                                  {(deliverable.subtasks ?? []).filter((subtask) => subtask.completed).length}/
                                  {(deliverable.subtasks ?? []).length} done
                                </span>
                              </div>

                              <div className="mt-3 space-y-3">
                                {(deliverable.subtasks ?? []).length === 0 && (
                                  <div className="rounded-lg border border-dashed border-[var(--border)] p-3 text-xs text-[var(--foreground)]/60">
                                    No subtasks yet.
                                  </div>
                                )}

                                {(deliverable.subtasks ?? []).map((subtask) => {
                                  const edit = subtaskEdits[subtask.id] ?? {
                                    title: subtask.title,
                                    dueDate: subtask.dueDate ? toDateTimeLocalValue(subtask.dueDate) : '',
                                    assigneeId: subtask.assigneeId ?? '',
                                    completed: subtask.completed,
                                  };
                                  const assignedToCurrentUserSubtask = Boolean(
                                    subtask.assignee?.email?.toLowerCase() === currentEmail,
                                  );

                                  return (
                                    <div
                                      key={subtask.id}
                                      className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/60 p-3"
                                    >
                                      {canManage ? (
                                        <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_180px_180px_auto_auto]">
                                          <input
                                            value={edit.title}
                                            onChange={(e) =>
                                              setSubtaskEdits((current) => ({
                                                ...current,
                                                [subtask.id]: { ...edit, title: e.target.value },
                                              }))
                                            }
                                            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                                          />
                                          <select
                                            value={edit.assigneeId}
                                            onChange={(e) =>
                                              setSubtaskEdits((current) => ({
                                                ...current,
                                                [subtask.id]: { ...edit, assigneeId: e.target.value },
                                              }))
                                            }
                                            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                                          >
                                            <option value="">Unassigned</option>
                                            {teamMembers.map((member) => (
                                              <option key={member.id} value={member.id}>
                                                {formatPerson(member)}
                                              </option>
                                            ))}
                                          </select>
                                          <input
                                            type="datetime-local"
                                            value={edit.dueDate}
                                            onChange={(e) =>
                                              setSubtaskEdits((current) => ({
                                                ...current,
                                                [subtask.id]: { ...edit, dueDate: e.target.value },
                                              }))
                                            }
                                            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                                          />
                                          <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                                            <input
                                              type="checkbox"
                                              checked={edit.completed}
                                              onChange={(e) =>
                                                setSubtaskEdits((current) => ({
                                                  ...current,
                                                  [subtask.id]: { ...edit, completed: e.target.checked },
                                                }))
                                              }
                                            />
                                            Done
                                          </label>
                                          <div className="flex gap-2">
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              disabled={busySubtaskId === subtask.id || !edit.title.trim()}
                                              onClick={() => void handleUpdateSubtask(subtask)}
                                            >
                                              Save
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              disabled={busySubtaskId === subtask.id}
                                              onClick={() => void handleDeleteSubtask(subtask.id)}
                                            >
                                              Delete
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div>
                                            <p className={cn('text-sm font-medium text-[var(--foreground)]', subtask.completed && 'line-through opacity-60')}>
                                              {subtask.title}
                                            </p>
                                            <p className="mt-1 text-xs text-[var(--foreground)]/60">
                                              {formatPerson(subtask.assignee)}
                                              {subtask.dueDate ? ` • Due ${new Date(subtask.dueDate).toLocaleString()}` : ''}
                                            </p>
                                          </div>
                                          {assignedToCurrentUserSubtask ? (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              disabled={busySubtaskId === subtask.id}
                                              onClick={() => void handleToggleSubtaskCompletion(subtask)}
                                            >
                                              {subtask.completed ? 'Mark Open' : 'Mark Done'}
                                            </Button>
                                          ) : (
                                            <span className="text-xs text-[var(--foreground)]/55">
                                              {subtask.completed ? 'Done' : 'Open'}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}

                                {canManage && (
                                  <div className="rounded-lg border border-dashed border-[var(--border)] p-3">
                                    <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_180px_180px_auto]">
                                      <input
                                        value={newSubtasks[deliverable.id]?.title ?? ''}
                                        onChange={(e) =>
                                          setNewSubtasks((current) => ({
                                            ...current,
                                            [deliverable.id]: {
                                              ...(current[deliverable.id] ?? { title: '', dueDate: '', assigneeId: '' }),
                                              title: e.target.value,
                                            },
                                          }))
                                        }
                                        placeholder="Add a subtask"
                                        className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                                      />
                                      <select
                                        value={newSubtasks[deliverable.id]?.assigneeId ?? ''}
                                        onChange={(e) =>
                                          setNewSubtasks((current) => ({
                                            ...current,
                                            [deliverable.id]: {
                                              ...(current[deliverable.id] ?? { title: '', dueDate: '', assigneeId: '' }),
                                              assigneeId: e.target.value,
                                            },
                                          }))
                                        }
                                        className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                                      >
                                        <option value="">Assign later</option>
                                        {teamMembers.map((member) => (
                                          <option key={member.id} value={member.id}>
                                            {formatPerson(member)}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        type="datetime-local"
                                        value={newSubtasks[deliverable.id]?.dueDate ?? ''}
                                        onChange={(e) =>
                                          setNewSubtasks((current) => ({
                                            ...current,
                                            [deliverable.id]: {
                                              ...(current[deliverable.id] ?? { title: '', dueDate: '', assigneeId: '' }),
                                              dueDate: e.target.value,
                                            },
                                          }))
                                        }
                                        className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                                      />
                                      <Button
                                        size="sm"
                                        disabled={
                                          creatingSubtaskFor === deliverable.id ||
                                          !(newSubtasks[deliverable.id]?.title ?? '').trim()
                                        }
                                        onClick={() => void handleCreateSubtask(deliverable)}
                                      >
                                        Add Subtask
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {feedback && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-white/15 bg-[var(--card)] px-4 py-3 shadow-xl">
          <p className="text-sm font-medium text-[var(--foreground)]">{feedback}</p>
        </div>
      )}
    </div>
  );
}
