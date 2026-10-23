'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckSquare, ChevronDown, Square, Users, Link as LinkIcon } from 'lucide-react';
import { AssigneeChecklist, projectAssignees } from '@/components/AssigneeChecklist';
import { AutosaveField, useAutosave, useRetainedDraft } from '@/components/Autosave';
import { DeadlineEditor, SubtaskEditors } from '@/components/RoutineEditors';
import { formatDateOnly } from '@/lib/autosave-validation';
import { AppNavbar } from '@/components/AppNavbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthContext';
import { RoleDashboardRedirect } from '@/components/RoleDashboardRedirect';
import { PageLoading } from '@/components/PageLoading';
import { useNavigationSnapshot } from '@/lib/use-navigation-snapshot';
import { deliverablesAPI, projectsAPI, setAuthToken } from '@/lib/api';
import { getEffectiveRole, getUserRole, type AppRole } from '@/lib/permissions';

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
  description?: string | null;
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
  submissions?: Array<NonNullable<DeliverableItem['latestSubmission']>>;
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

export default function DeliverablesPage() {
  const session = useAuth();
  const autosave = useAutosave();
  const { isLoggedIn, getToken } = session;
  const email = session.user?.email;
  const { snapshot, saveSnapshot } = useNavigationSnapshot<{
    role: AppRole; projects: ProjectOption[]; selectedProjectId: string;
    teamMembers: TeamMemberOption[]; sprints: SprintItem[]; selectedSprintId: string;
  }>('deliverables', email);
  const [roleLookupFailed, setRoleLookupFailed] = useState(false);
  const router = useRouter();
  const [role, setRole] = useState<AppRole>(() => snapshot?.role ?? getUserRole(email));
  const [projects, setProjects] = useState<ProjectOption[]>(snapshot?.projects ?? []);
  const [selectedProjectId, setSelectedProjectId] = useState(snapshot?.selectedProjectId ?? '');
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>(snapshot?.teamMembers ?? []);
  const [sprints, setSprints] = useState<SprintItem[]>(snapshot?.sprints ?? []);
  const [selectedSprintId, setSelectedSprintId] = useState(snapshot?.selectedSprintId ?? '');
  const [loading, setLoading] = useState(!snapshot);
  const [refreshing, setRefreshing] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyDeliverableId, setBusyDeliverableId] = useState<string | null>(null);
  const [submitLinks, setSubmitLinks] = useState<Record<string, string>>({});
  const [newSubtasks, setNewSubtasks] = useRetainedDraft<
    Record<string, { title: string; dueDate: string; assigneeId: string }>
  >('deliverables:newSubtasks', {});
  const [busySubtaskId, setBusySubtaskId] = useState<string | null>(null);
  const [creatingSubtaskFor, setCreatingSubtaskFor] = useState<string | null>(null);
  const [expandedSubtasks, setExpandedSubtasks] = useState<Record<string, boolean>>({});

  // A failed refresh keeps content that belongs to the selected project.
  const projectRef = useRef(selectedProjectId);
  const sprintRequest = useRef(0);
  const memberRequest = useRef(0);
  const cancelRequests = useCallback(() => { sprintRequest.current++; memberRequest.current++; }, []);
  const shownSprintsFor = useRef(snapshot?.selectedProjectId);
  const shownMembersFor = useRef(snapshot?.selectedProjectId);

  const canManage = role === 'PM' || role === 'LC' || role === 'ADMIN';
  const currentEmail = (session.user?.email ?? '').toLowerCase();

  const loadSprints = useCallback(async (projectId: string) => {
    const request = ++sprintRequest.current;
    try {
      setLoadError(null);
      const res = await autosave.readFresh(() => projectsAPI.getSprints(projectId));
      if (request !== sprintRequest.current || projectRef.current !== projectId) return;
      const sprintList = (res.data ?? []) as SprintItem[];
      shownSprintsFor.current = projectId;
      setSprints(sprintList);
      setSelectedSprintId((current) =>
        current && sprintList.some((item) => item.id === current) ? current : sprintList[0]?.id ?? '',
      );
    } catch (error: any) {
      if (request !== sprintRequest.current || projectRef.current !== projectId) return;
      if (shownSprintsFor.current !== projectId) {
        setSprints([]);
        setSelectedSprintId('');
      }
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to load deliverables.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    }
  }, [autosave]);

  const loadTeamMembers = useCallback(async (projectId: string) => {
    const request = ++memberRequest.current;
    try {
      const res = await projectsAPI.getById(projectId, { includeMembers: true });
      if (request !== memberRequest.current || projectRef.current !== projectId) return;
      const project = (res.data ?? {}) as {
        pm?: TeamMemberOption;
        members?: Array<{ user?: TeamMemberOption | null }>;
      };

      shownMembersFor.current = projectId;
      setTeamMembers(projectAssignees(project));
    } catch {
      if (request !== memberRequest.current || projectRef.current !== projectId) return;
      if (shownMembersFor.current !== projectId) {
        setTeamMembers([]);
      }
    }
  }, []);

  useEffect(() => {
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in');
    }
  }, [session.loading, session.isLoggedIn, router]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!isLoggedIn || !email || roleLookupFailed) return;
      setRefreshing(true);

      try {
        const token = await getToken();
        if (cancelled) return;
        setAuthToken(token || email);

        let nextRole: AppRole;
        try {
          nextRole = await getEffectiveRole(token, email);
        } catch {
          if (!cancelled) setRoleLookupFailed(true);
          return;
        }
        if (cancelled) return;
        setRole(nextRole);

        const projectsRes = await projectsAPI.getAll({ limit: 100 });
        if (cancelled) return;
        const nextProjects = ((projectsRes.data?.projects ?? []) as Array<{ id: string; name: string }>).map(
          (item) => ({ id: item.id, name: item.name }),
        );
        setProjects(nextProjects);

        const firstProjectId = nextProjects.some(project => project.id === projectRef.current)
          ? projectRef.current : nextProjects[0]?.id ?? '';
        projectRef.current = firstProjectId;
        setSelectedProjectId(firstProjectId);
        if (firstProjectId) {
          await Promise.all([loadSprints(firstProjectId), loadTeamMembers(firstProjectId)]);
        }
      } catch (error: any) {
        if (!cancelled) setLoadError(error?.message ?? 'Failed to load deliverables.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void init();
    return () => { cancelled = true; cancelRequests(); };
  }, [isLoggedIn, email, getToken, loadSprints, loadTeamMembers, roleLookupFailed, cancelRequests]);

  useEffect(() => {
    if (!loading && !refreshing && !loadError && !roleLookupFailed) {
      saveSnapshot({ role, projects, selectedProjectId, teamMembers, sprints, selectedSprintId });
    }
  }, [loading, refreshing, loadError, roleLookupFailed, role, projects, selectedProjectId, teamMembers, sprints, selectedSprintId, saveSnapshot]);

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

  const changeWeek = async (id: string) => {
    if (await autosave.flushAll()) setSelectedSprintId(id);
  };

  const handleProjectChange = async (projectId: string) => {
    if (!(await autosave.flushAll())) return;
    projectRef.current = projectId;
    setSelectedProjectId(projectId);
    setSelectedSprintId('');
    if (!projectId) {
      setSprints([]);
      setTeamMembers([]);
      return;
    }

    setLoading(true);
    try {
      await Promise.all([loadSprints(projectId), loadTeamMembers(projectId)]);
    } finally {
      if (projectRef.current === projectId) setLoading(false);
    }
  };

  const handleAssignmentToggle = async (deliverable: DeliverableItem) => {
    if (!(await autosave.flushAll())) return;
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
    if (!(await autosave.flushAll())) return;
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

  const handleSubmitLink = async (deliverable: DeliverableItem) => {
    if (!(await autosave.flushAll())) return;
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
      setNewSubtasks(current => current[deliverable.id] === draft
        ? { ...current, [deliverable.id]: { title: '', dueDate: '', assigneeId: '' } } : current);
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

  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!(await autosave.flushAll())) return;
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
    if (!(await autosave.flushAll())) return;
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

  if (session.loading || !session.isLoggedIn) {
    return <PageLoading />;
  }

  if (roleLookupFailed) return <RoleDashboardRedirect onRetry={() => setRoleLookupFailed(false)} />;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      <AppNavbar role={role} currentPath="/deliverables" />

      <main className="flex-1 overflow-y-auto">
        {loading ? <PageLoading /> : (
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
                  aria-label="Project"
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
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
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
                      onClick={() => void changeWeek(sprint.id)}
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
                        {formatDateOnly(selectedSprint.weekStartDate)} - {formatDateOnly(selectedSprint.weekEndDate)}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
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
                      const submissions = deliverable.submissions?.length
                        ? deliverable.submissions
                        : deliverable.latestSubmission ? [deliverable.latestSubmission] : [];
                      const submittedUserIds = new Set(submissions.map((submission) => submission.submitter?.id));
                      const nonSubmittingAssignees = (deliverable.assignees ?? []).filter(
                        (assignee) => !submittedUserIds.has(assignee.id),
                      );
                      const subtasksExpanded = Boolean(expandedSubtasks[deliverable.id]);
                      const subtasksPanelId = `deliverable-${deliverable.id}-subtasks`;

                      return (
                        <div
                          key={deliverable.id}
                          className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/70 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[var(--foreground)]">
                                {normalizeWeekText(deliverable.title)}
                              </p>
                              <p className="mt-1 text-xs text-[var(--foreground)]/55">
                                Due {new Date(deliverable.deadline).toLocaleString()}
                              </p>
                              {deliverable.description?.trim() ? (
                                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--foreground)]/80">
                                  {deliverable.description.trim()}
                                </p>
                              ) : null}
                            </div>
                            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                              {deliverable.status.replace(/_/g, ' ')}
                            </span>
                          </div>

                          <div className="mt-4 space-y-3">
                            <div>
                              <p className="text-xs font-medium text-[var(--foreground)]/70">Assigned</p>
                              <p className="text-sm text-[var(--foreground)]">{formatAssignees(deliverable.assignees)}</p>
                            </div>

                            {canManage && (
                              <div className="space-y-2">
                                <AutosaveField id={`deliverable:${deliverable.id}:assignees`} resource={`deliverable:${deliverable.id}:assignees`}
                                  label={`${deliverable.title} assignees`} href="/deliverables" delay={250}
                                  value={(deliverable.assignees ?? []).map(person => person.id).sort()}
                                  save={async ids => {
                                    const response = await deliverablesAPI.setAssignments(deliverable.id, ids);
                                    setSprints(current => current.map(sprint => ({ ...sprint,
                                      deliverables: sprint.deliverables?.map(item => item.id === deliverable.id ? { ...item, assignees: response.data } : item),
                                    })));
                                  }}>
                                  {({ value, change }) => <AssigneeChecklist
                                    options={Array.from(new Map([...(deliverable.assignees ?? []), ...teamMembers].map(person => [person.id, person])).values())}
                                    selected={value} onChange={ids => change([...ids].sort())} />}
                                </AutosaveField>
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-2">
                              {canManage && (
                                <DeadlineEditor id={deliverable.id} sprintId={selectedSprint.id} deadline={deliverable.deadline} href="/deliverables"
                                  onSaved={deadline => setSprints(current => current.map(sprint => ({ ...sprint,
                                    deliverables: sprint.deliverables?.map(item => item.id === deliverable.id ? { ...item, deadline } : item),
                                  })))} />
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
                                  <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
                              {submissions.length || nonSubmittingAssignees.length ? (
                                <div className="mt-3 space-y-2">
                                  {submissions.map((submission) => (
                                    <div
                                      key={submission.id}
                                      className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/60 p-3"
                                    >
                                      <p className="text-xs font-medium text-[var(--foreground)]/70">
                                        Submitted by {formatSubmitter(submission.submitter)}
                                      </p>
                                      <a
                                        href={submission.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-1 block text-sm font-medium text-[var(--primary)] hover:underline"
                                      >
                                        View submission
                                      </a>
                                      <p className="mt-1 text-xs text-[var(--foreground)]/60">
                                        {new Date(submission.submittedAt).toLocaleString()}
                                      </p>
                                    </div>
                                  ))}
                                  {nonSubmittingAssignees.map((assignee) => (
                                    <div
                                      key={assignee.id}
                                      className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/60 p-3"
                                    >
                                      <p className="text-xs font-medium text-[var(--foreground)]/70">
                                        {formatPerson(assignee)} - Not submitted
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                              <button
                                type="button"
                                aria-expanded={subtasksExpanded}
                                aria-controls={subtasksPanelId}
                                onClick={() =>
                                  setExpandedSubtasks((current) => ({
                                    ...current,
                                    [deliverable.id]: !current[deliverable.id],
                                  }))
                                }
                                className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg text-left"
                              >
                                <span className="min-w-0 text-sm font-medium text-[var(--foreground)]">
                                  Subtasks
                                  <span className="font-normal text-[var(--foreground)]/55">
                                    {' · '}
                                    {(deliverable.subtasks ?? []).filter((subtask) => subtask.completed).length}/
                                    {(deliverable.subtasks ?? []).length} done
                                  </span>
                                </span>
                                <ChevronDown
                                  aria-hidden="true"
                                  className={cn(
                                    'h-4 w-4 shrink-0 text-[var(--foreground)]/60 transition-transform',
                                    subtasksExpanded && 'rotate-180',
                                  )}
                                />
                              </button>

                              <div id={subtasksPanelId} hidden={!subtasksExpanded} className="mt-3 space-y-3">
                                <p className="text-xs text-[var(--foreground)]/60">
                                  Split the deliverable into smaller assigned steps.
                                </p>
                                {(deliverable.subtasks ?? []).length === 0 && (
                                  <div className="rounded-lg border border-dashed border-[var(--border)] p-3 text-xs text-[var(--foreground)]/60">
                                    No subtasks yet.
                                  </div>
                                )}

                                {(deliverable.subtasks ?? []).map((subtask) => {
                                  const assignedToCurrentUserSubtask = Boolean(
                                    subtask.assignee?.email?.toLowerCase() === currentEmail,
                                  );

                                  return (
                                    <div
                                      key={subtask.id}
                                      className="min-w-0 max-w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)]/60 p-3"
                                    >
                                      {canManage ? (
                                        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-2 [&>*]:min-w-0">
                                          <SubtaskEditors subtask={subtask} members={teamMembers}
                                            onSaved={patch => setSprints(current => current.map(sprint => ({ ...sprint,
                                              deliverables: sprint.deliverables?.map(item => ({ ...item,
                                                subtasks: item.subtasks?.map(task => task.id === subtask.id ? { ...task, ...patch } : task),
                                              })),
                                            })))} />
                                          <div className="flex flex-wrap gap-2">
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
                                  <div className="min-w-0 max-w-full rounded-lg border border-dashed border-[var(--border)] p-3">
                                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-2 [&>*]:min-w-0">
                                      <input
                                        aria-label="New subtask title"
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
                                        className="min-w-0 max-w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                                      />
                                      <select
                                        aria-label="New subtask assignee"
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
                                        className="min-w-0 max-w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
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
                                        aria-label="New subtask due date"
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
                                        className="min-w-0 max-w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
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
        )}
      </main>

      {feedback && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-white/15 bg-[var(--card)] px-4 py-3 shadow-xl">
          <p className="text-sm font-medium text-[var(--foreground)]">{feedback}</p>
        </div>
      )}
    </div>
  );
}
