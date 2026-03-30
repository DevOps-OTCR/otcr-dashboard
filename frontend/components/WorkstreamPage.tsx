'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, RefreshCw, FileText } from 'lucide-react';
import { AppNavbar } from '@/components/AppNavbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { deliverablesAPI, projectsAPI, setAuthToken } from '@/lib/api';
import { getEffectiveRole, type AppRole } from '@/lib/permissions';
import { parseDashPrefixedDeliverables } from '@/lib/deliverables-parser';
import { dispatchNotificationsRefresh } from '@/lib/notification-events';
import { buildSprintDeadlineInChicago } from '@/lib/sprint-deadlines';

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

type DeliverableSubtask = {
  id: string;
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  completed: boolean;
  assigneeId?: string | null;
  assignee?: TeamMemberOption | null;
};

type DeliverableItem = {
  id: string;
  sprintId?: string;
  title: string;
  deadline: string;
  templateKind?: string;
  completed?: boolean;
  assignees?: Array<{
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  }>;
  subtasks?: DeliverableSubtask[];
};

type SprintItem = {
  id: string;
  label: string;
  status: string;
  weekStartDate: string;
  weekEndDate: string;
  configSnapshot?: {
    defaultDueTime?: string;
    generalNotes?: string | null;
  } | null;
  deliverables?: DeliverableItem[];
};

function formatAssignees(assignees?: DeliverableItem['assignees']) {
  if (!assignees || assignees.length === 0) return 'Unassigned';
  return assignees
    .map((assignee) => {
      const fullName = [assignee.firstName, assignee.lastName].filter(Boolean).join(' ').trim();
      return fullName || 'Assigned';
    })
    .join(', ');
}

function formatPerson(person?: TeamMemberOption | null) {
  if (!person) return 'Unassigned';
  const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  return fullName || person.email || 'Unassigned';
}

function normalizeWeekText(value: string) {
  return value.replace(/\bSprint\s+(\d+)\b/gi, 'Week $1');
}

function formatWeekLabel(value: string, fallbackIndex?: number) {
  const normalized = normalizeWeekText(value).trim();
  if (normalized) return normalized;
  if (fallbackIndex != null) return `Week ${fallbackIndex + 1}`;
  return 'Week';
}

function extractWeekNumber(value: string, fallbackIndex?: number) {
  const match = formatWeekLabel(value, fallbackIndex).match(/\bWeek\s+(\d+)\b/i);
  return match?.[1] ?? String((fallbackIndex ?? 0) + 1);
}

function isDeliverableInSelectedWeek(
  deliverable: DeliverableItem,
  selected: SprintItem,
  selectedIndex: number,
) {
  if (deliverable.sprintId) {
    return deliverable.sprintId === selected.id;
  }
  const selectedWeek = extractWeekNumber(selected.label, selectedIndex);
  const deliverableWeek = extractWeekNumber(deliverable.title, selectedIndex);
  return selectedWeek === deliverableWeek;
}

function buildDraftDeliverableDeadline(sprint: SprintItem) {
  return buildSprintDeadlineInChicago(
    sprint.weekEndDate,
    sprint.configSnapshot?.defaultDueTime ?? '23:59',
  );
}

function toDateInputValue(value: string) {
  return new Date(value).toISOString().slice(0, 10);
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

export default function WorkstreamPage() {
  const session = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<AppRole>('CONSULTANT');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [sprints, setSprints] = useState<SprintItem[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyDeliverableId, setBusyDeliverableId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [draftInput, setDraftInput] = useState('');
  const [addWhitepaperSubmission, setAddWhitepaperSubmission] = useState(false);
  const [newSprintStartDate, setNewSprintStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [generalNotesInput, setGeneralNotesInput] = useState('');
  const [sprintDateInput, setSprintDateInput] = useState('');
  const [deadlineInputs, setDeadlineInputs] = useState<Record<string, string>>({});
  const [updatingSprintDate, setUpdatingSprintDate] = useState(false);
  const [subtaskEdits, setSubtaskEdits] = useState<
    Record<string, { title: string; dueDate: string; assigneeId: string; completed: boolean }>
  >({});
  const [newSubtasks, setNewSubtasks] = useState<
    Record<string, { title: string; dueDate: string; assigneeId: string }>
  >({});
  const [busySubtaskId, setBusySubtaskId] = useState<string | null>(null);
  const [creatingSubtaskFor, setCreatingSubtaskFor] = useState<string | null>(null);

  const canManage = role === 'PM' || role === 'LC' || role === 'ADMIN';

  const loadSprints = useCallback(async (projectId: string) => {
    try {
      setLoadError(null);
      const res = await projectsAPI.getSprints(projectId);
      const sprintList = (res.data ?? []) as SprintItem[];
      setSprints(sprintList);
      setSelectedSprintId((current) => {
        return current && sprintList.some((item) => item.id === current)
          ? current
          : sprintList[0]?.id ?? '';
      });
    } catch (error: any) {
      setSprints([]);
      setSelectedSprintId('');
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to load workstream weeks.';
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
      if (project.pm?.id) nextMembers.set(project.pm.id, project.pm);
      (project.members ?? []).forEach((member) => {
        if (member.user?.id) nextMembers.set(member.user.id, member.user);
      });
      setTeamMembers(Array.from(nextMembers.values()));
    } catch {
      setTeamMembers([]);
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
      } catch (error: any) {
        setProjects([]);
        setSprints([]);
        setSelectedProjectId('');
        setSelectedSprintId('');
        const message =
          error?.response?.data?.message ??
          error?.message ??
          'Unable to load the Workstream page right now.';
        setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
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

  const selectedSprint = useMemo(
    () => sprints.find((sprint) => sprint.id === selectedSprintId) ?? null,
    [sprints, selectedSprintId],
  );
  
  useEffect(() => {
    setGeneralNotesInput(selectedSprint?.configSnapshot?.generalNotes ?? '');
  }, [selectedSprintId, selectedSprint?.configSnapshot?.generalNotes]);

  useEffect(() => {
    setSprintDateInput(selectedSprint ? toDateInputValue(selectedSprint.weekStartDate) : '');
    setDeadlineInputs(
      Object.fromEntries(
        (selectedSprint?.deliverables ?? []).map((deliverable) => [
          deliverable.id,
          toDateTimeLocalValue(deliverable.deadline),
        ]),
      ),
    );
    setSubtaskEdits(
      Object.fromEntries(
        (selectedSprint?.deliverables ?? [])
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
        (selectedSprint?.deliverables ?? []).map((deliverable) => [
          deliverable.id,
          { title: '', dueDate: '', assigneeId: '' },
        ]),
      ),
    );
  }, [selectedSprint]);

  
  const parsedDrafts = useMemo(() => parseDashPrefixedDeliverables(draftInput), [draftInput]);
  const sprintIndex = useMemo(
    () => sprints.findIndex((item) => item.id === selectedSprintId),
    [selectedSprintId, sprints],
  );
  const whitepaperPreviewItems = useMemo(() => {
    if (!selectedSprint || !addWhitepaperSubmission) return [];

    const weekNumber = extractWeekNumber(selectedSprint.label, sprintIndex);
    const existingTemplateKinds = new Set(
      (selectedSprint.deliverables ?? []).map((deliverable) => deliverable.templateKind),
    );
    const items: string[] = [];

    if (!existingTemplateKinds.has('INITIAL_WHITEPAPER')) {
      items.push(`Initial Whitepaper Submission - Week ${weekNumber}`);
    }
    if (!existingTemplateKinds.has('FINAL_WHITEPAPER')) {
      items.push(`Final Whitepaper Submission - Week ${weekNumber}`);
    }

    return items;
  }, [addWhitepaperSubmission, selectedSprint, sprintIndex]);
  const selectedSprintDeliverables = useMemo(() => {
    if (!selectedSprint) return [];
    return (selectedSprint.deliverables ?? []).filter((deliverable) =>
      isDeliverableInSelectedWeek(deliverable, selectedSprint, sprintIndex),
    );
  }, [selectedSprint, sprintIndex]);

  const handleProjectChange = async (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedSprintId('');
    setAddWhitepaperSubmission(false);
    setNewSprintStartDate(new Date().toISOString().slice(0, 10));
    if (!projectId) {
      setSprints([]);
      setTeamMembers([]);
      return;
    }

    setLoading(true);
    try {
      await Promise.all([loadSprints(projectId), loadTeamMembers(projectId)]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSprint = async () => {
    if (!selectedProjectId || !newSprintStartDate) return;
    setGenerating(true);
    try {
      setLoadError(null);
      const response = await projectsAPI.generateNextSprint(selectedProjectId, {
        startDate: newSprintStartDate,
      });
      const createdSprint = response.data as SprintItem | undefined;

      if (createdSprint?.id) {
        setSprints((current) => {
          const withoutCreated = current.filter((item) => item.id !== createdSprint.id);
          return [createdSprint, ...withoutCreated];
        });
        setSelectedSprintId(createdSprint.id);
      }

      await loadSprints(selectedProjectId);
      setFeedback('New draft sprint created');
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to generate sprint.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setGenerating(false);
    }
  };

  const handleSprintStatusToggle = async () => {
    if (!selectedProjectId || !selectedSprint || !canManage) return;
    const nextStatus = selectedSprint.status === 'RELEASED' ? 'DRAFT' : 'RELEASED';
    try {
      await projectsAPI.updateSprintStatus(selectedProjectId, selectedSprint.id, nextStatus);
      await loadSprints(selectedProjectId);
      setFeedback(nextStatus === 'RELEASED' ? 'Sprint released' : 'Sprint moved back to draft');
      if (nextStatus === 'RELEASED') {
        dispatchNotificationsRefresh();
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to update sprint.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    }
  };

  const handleSaveDrafts = async () => {
    if (!selectedProjectId || !selectedSprint) return;
    if (parsedDrafts.length === 0 && !addWhitepaperSubmission) return;

    try {
      const requests = parsedDrafts.map((item) =>
        deliverablesAPI.create({
          projectId: selectedProjectId,
          sprintId: selectedSprint.id,
          title: item.title,
          description: 'Draft deliverable created from the Workstream page.',
          type: 'OTHER',
          deadline: buildDraftDeliverableDeadline(selectedSprint),
        }),
      );

      if (addWhitepaperSubmission) {
        const weekNumber = extractWeekNumber(selectedSprint.label, sprintIndex);
        const existingTemplateKinds = new Set(
          selectedSprintDeliverables.map((deliverable) => deliverable.templateKind),
        );
        const initialSlides = selectedSprintDeliverables.find(
          (deliverable) => deliverable.templateKind === 'INITIAL_SLIDES',
        );
        const finalSlides = selectedSprintDeliverables.find(
          (deliverable) => deliverable.templateKind === 'FINAL_SLIDES',
        );

        if (!existingTemplateKinds.has('INITIAL_WHITEPAPER')) {
          requests.push(
            deliverablesAPI.create({
              projectId: selectedProjectId,
              sprintId: selectedSprint.id,
              title: `Initial Whitepaper Submission - Week ${weekNumber}`,
              description: `Auto-assigned initial whitepaper submission for Week ${weekNumber}.`,
              type: 'DOCUMENT',
              templateKind: 'INITIAL_WHITEPAPER',
              assignProjectMembers: true,
              deadline: initialSlides?.deadline ?? selectedSprint.weekEndDate,
            }),
          );
        }

        if (!existingTemplateKinds.has('FINAL_WHITEPAPER')) {
          requests.push(
            deliverablesAPI.create({
              projectId: selectedProjectId,
              sprintId: selectedSprint.id,
              title: `Final Whitepaper Submission - Week ${weekNumber}`,
              description: `Auto-assigned final whitepaper submission for Week ${weekNumber}.`,
              type: 'DOCUMENT',
              templateKind: 'FINAL_WHITEPAPER',
              assignProjectMembers: true,
              deadline: finalSlides?.deadline ?? selectedSprint.weekEndDate,
            }),
          );
        }
      }

      await Promise.all(requests);
      setDraftInput('');
      setAddWhitepaperSubmission(false);
      await loadSprints(selectedProjectId);
      setFeedback('Draft deliverables saved');
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to save draft deliverables.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    }
  };

  const handleDeleteSprint = async () => {
    if (!selectedProjectId || !selectedSprint || !canManage) return;
    const confirmed = window.confirm(
      `Delete ${normalizeWeekText(selectedSprint.label)}? This will also delete the deliverables saved in this week.`,
    );
    if (!confirmed) return;

    try {
      await projectsAPI.deleteSprint(selectedProjectId, selectedSprint.id);
      await loadSprints(selectedProjectId);
      setFeedback('Week deleted');
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to delete week.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    }
  };

  const handleDeleteDeliverable = async (deliverable: DeliverableItem) => {
    if (!selectedProjectId || !canManage) return;
    const confirmed = window.confirm(
      `Delete "${normalizeWeekText(deliverable.title)}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    setBusyDeliverableId(deliverable.id);
    try {
      await deliverablesAPI.delete(deliverable.id);
      await loadSprints(selectedProjectId);
      setFeedback('Deliverable deleted');
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to delete deliverable.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setBusyDeliverableId(null);
    }
  };

  const handleUpdateSprintDate = async () => {
    if (!selectedProjectId || !selectedSprint || !canManage || !sprintDateInput) return;

    setUpdatingSprintDate(true);
    try {
      setLoadError(null);
      await projectsAPI.updateSprint(selectedProjectId, selectedSprint.id, {
        weekStartDate: sprintDateInput,
      });
      await loadSprints(selectedProjectId);
      setFeedback('Workstream updated');
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to update workstream.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setUpdatingSprintDate(false);
    }
  };

  const handleUpdateDeliverableDeadline = async (deliverable: DeliverableItem) => {
    if (!selectedProjectId || !canManage) return;
    const nextDeadline = deadlineInputs[deliverable.id];
    if (!nextDeadline) return;

    setBusyDeliverableId(deliverable.id);
    try {
      setLoadError(null);
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
      setLoadError(null);
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

  const handleUpdateSubtask = async (subtask: DeliverableSubtask) => {
    if (!selectedProjectId || !canManage) return;
    const edit = subtaskEdits[subtask.id];
    if (!edit?.title.trim()) return;

    setBusySubtaskId(subtask.id);
    try {
      setLoadError(null);
      await deliverablesAPI.updateSubtask(subtask.id, {
        title: edit.title.trim(),
        dueDate: edit.dueDate ? new Date(edit.dueDate).toISOString() : null,
        assigneeId: edit.assigneeId || null,
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
      setLoadError(null);
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

  const handleSaveGeneralNotes = async () => {
    if (!selectedProjectId || !selectedSprint || !canManage) return;
    try {
      setLoadError(null);
      await projectsAPI.updateSprintNotes(selectedProjectId, selectedSprint.id, {
        generalNotes: generalNotesInput,
      });
      await loadSprints(selectedProjectId);
      setFeedback('Week notes saved');
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Failed to save week notes.';
      setLoadError(Array.isArray(message) ? message.join(', ') : String(message));
    }
  };

  if (session.loading || !session.isLoggedIn || loading) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      <AppNavbar role={role} currentPath="/workstream" />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[var(--primary)]" />
                Workstream
              </CardTitle>
              <CardDescription>
                {canManage
                  ? 'Create a week, paste draft deliverables, review the parsed list, and change the whole week between draft and released.'
                  : 'View released weeks and review assigned work.'}
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
                <span className="text-sm text-[var(--foreground)]/60">
                  {canManage
                    ? 'Create draft sprints, add deliverables, and release a week when it is ready.'
                    : 'Draft weeks are visible here, but work stays locked until released.'}
                </span>
                {canManage && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--foreground)]/55">
                      Due Date Week
                    </span>
                    <input
                      type="date"
                      value={newSprintStartDate}
                      onChange={(e) => setNewSprintStartDate(e.target.value)}
                      className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"
                      aria-label="New workstream due date week"
                    />
                  </div>
                )}
                {canManage && sprints.length > 0 && (
                  <select
                    value={selectedSprintId}
                    onChange={(e) => setSelectedSprintId(e.target.value)}
                    className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"
                  >
                    {sprints.map((sprint, index) => (
                      <option key={sprint.id} value={sprint.id}>
                        {formatWeekLabel(sprint.label, index)}
                      </option>
                    ))}
                  </select>
                )}
                {canManage && (
                  <Button
                    size="sm"
                    onClick={() => void handleGenerateSprint()}
                    disabled={!selectedProjectId || !newSprintStartDate || generating}
                  >
                    <RefreshCw className={cn('w-4 h-4 mr-2', generating && 'animate-spin')} />
                    Create new Workstream
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {loadError && (
                  <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
                    {loadError}
                  </div>
                )}
                {sprints.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--foreground)]/60">
                    <p>{canManage ? 'No sprints yet.' : 'No weeks yet.'}</p>
                    {canManage && (
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--foreground)]/55">
                            Due Date Week
                          </span>
                          <input
                            type="date"
                            value={newSprintStartDate}
                            onChange={(e) => setNewSprintStartDate(e.target.value)}
                            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"
                            aria-label="First workstream due date week"
                          />
                        </label>
                        <Button
                          size="sm"
                          onClick={() => void handleGenerateSprint()}
                          disabled={!selectedProjectId || !newSprintStartDate || generating}
                        >
                          Create First Workstream
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  sprints.map((sprint, index) => (
                    <button
                      key={sprint.id}
                      type="button"
                      onClick={() => setSelectedSprintId(sprint.id)}
                      className={cn(
                        'rounded-xl border px-4 py-2 text-sm font-medium transition-colors',
                        sprint.id === selectedSprintId
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
                          sprints.findIndex((item) => item.id === selectedSprint.id),
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

                  {canManage && (
                    <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60 p-4">
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--foreground)]/55">
                          Workstream Week Start
                        </span>
                        <input
                          type="date"
                          value={sprintDateInput}
                          onChange={(e) => setSprintDateInput(e.target.value)}
                          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"
                        />
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleUpdateSprintDate()}
                        disabled={
                          updatingSprintDate ||
                          !sprintDateInput ||
                          sprintDateInput === toDateInputValue(selectedSprint.weekStartDate)
                        }
                      >
                        Save Workstream Date
                      </Button>
                    </div>
                  )}

                  <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60 p-4">
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      General Notes / Links
                    </p>
                    <p className="mt-1 text-xs text-[var(--foreground)]/60">
                      Week-level context for this workstream (updates, links, reminders).
                    </p>
                    {canManage ? (
                      <>
                        <textarea
                          value={generalNotesInput}
                          onChange={(e) => setGeneralNotesInput(e.target.value)}
                          rows={4}
                          placeholder={'Weekly context...\n- Link: https://...\n- Notes: ...'}
                          className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                        />
                        <div className="mt-3 flex justify-end">
                          <Button size="sm" onClick={() => void handleSaveGeneralNotes()}>
                            Save Notes
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-3 text-sm text-[var(--foreground)]/75 whitespace-pre-wrap">
                        {selectedSprint.configSnapshot?.generalNotes?.trim()
                          ? selectedSprint.configSnapshot.generalNotes
                          : 'No general notes added for this week yet.'}
                      </div>
                    )}
                  </div>

                  {canManage && (
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60 p-4">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[var(--primary)]" />
                          <p className="text-sm font-semibold text-[var(--foreground)]">Add Draft Deliverables</p>
                        </div>
                        <p className="mt-1 text-xs text-[var(--foreground)]/60">
                          Paste lines that start with `-`. Each one becomes a deliverable in this sprint.
                        </p>
                        <textarea
                          value={draftInput}
                          onChange={(e) => setDraftInput(e.target.value)}
                          rows={5}
                          placeholder={'- Add week function\n- Get it hosted\n- Redesign deliverables'}
                          className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                        />
                        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--foreground)]">
                          <input
                            type="checkbox"
                            checked={addWhitepaperSubmission}
                            onChange={(e) => setAddWhitepaperSubmission(e.target.checked)}
                            className="h-4 w-4 rounded border border-[var(--border)]"
                          />
                          Add whitepaper submission
                        </label>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <span className="text-xs text-[var(--foreground)]/60">{parsedDrafts.length} parsed</span>
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => void handleDeleteSprint()}>
                              Delete Week
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void handleSprintStatusToggle()}>
                              {selectedSprint.status === 'RELEASED' ? 'Move To Draft' : 'Release Sprint'}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => void handleSaveDrafts()}
                              disabled={parsedDrafts.length === 0 && !addWhitepaperSubmission}
                            >
                              Save Deliverables
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60 p-4">
                        <p className="text-sm font-semibold text-[var(--foreground)]">Parsed Deliverables</p>
                        <p className="mt-1 text-xs text-[var(--foreground)]/60">
                          This is the UI preview of what will be saved into the selected week.
                        </p>
                        <div className="mt-3 space-y-2">
                          {parsedDrafts.length === 0 && whitepaperPreviewItems.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-sm text-[var(--foreground)]/60">
                              Paste lines starting with `-` to preview deliverables.
                            </div>
                          ) : (
                            <>
                              {parsedDrafts.map((item, index) => (
                                <div
                                  key={`${item.title}-${index}`}
                                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                                >
                                  <p className="text-sm font-medium text-[var(--foreground)]">{item.title}</p>
                                  <p className="mt-1 text-[11px] uppercase tracking-wide text-amber-700">
                                    Draft
                                  </p>
                                </div>
                              ))}
                              {whitepaperPreviewItems.map((title) => (
                                <div
                                  key={title}
                                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                                >
                                  <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
                                  <p className="mt-1 text-[11px] uppercase tracking-wide text-sky-700">
                                    Auto-assigned
                                  </p>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={cn('mt-5 grid gap-3', canManage ? 'md:grid-cols-2' : 'md:grid-cols-1')}>
                    {selectedSprintDeliverables.map((deliverable) => (
                      <div
                        key={deliverable.id}
                        className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/70 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[var(--foreground)]">
                              {normalizeWeekText(deliverable.title)}
                            </p>
                            <p className="text-xs text-[var(--foreground)]/55 mt-1">
                              Due {new Date(deliverable.deadline).toLocaleString()}
                            </p>
                          </div>
                          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] uppercase tracking-wide text-emerald-700">
                            {selectedSprint.status === 'RELEASED' ? 'final' : 'draft'}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium text-[var(--foreground)]/70">Assigned</p>
                            <p className="text-sm text-[var(--foreground)]">{formatAssignees(deliverable.assignees)}</p>
                          </div>
                          {canManage ? (
                            <div className="flex flex-wrap items-center gap-2 justify-end">
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
                                onClick={() => void handleUpdateDeliverableDeadline(deliverable)}
                              >
                                Save Due Date
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busyDeliverableId === deliverable.id}
                                onClick={() => void handleDeleteDeliverable(deliverable)}
                              >
                                Delete
                              </Button>
                            </div>
                          ) : (
                            <p className="text-xs text-[var(--foreground)]/60">
                              Read-only until this week is released.
                            </p>
                          )}
                        </div>

                        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[var(--foreground)]">Subtasks</p>
                              <p className="text-xs text-[var(--foreground)]/60">
                                Break large work into smaller assignable steps.
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

                              return (
                                <div
                                  key={subtask.id}
                                  className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/50 p-3"
                                >
                                  {canManage ? (
                                    <>
                                      <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_180px_180px_auto_auto]">
                                        <input
                                          value={edit.title}
                                          onChange={(e) =>
                                            setSubtaskEdits((current) => ({
                                              ...current,
                                              [subtask.id]: { ...edit, title: e.target.value },
                                            }))
                                          }
                                          placeholder="Subtask title"
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
                                    </>
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
                                      <span className="text-xs text-[var(--foreground)]/55">
                                        {subtask.completed ? 'Done' : 'Open'}
                                      </span>
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
                    ))}

                    {selectedSprintDeliverables.length === 0 && (
                      <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--foreground)]/60">
                        {canManage ? 'No deliverables in this week yet.' : 'No deliverables in this week.'}
                      </div>
                    )}
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
