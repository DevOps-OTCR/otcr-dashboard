'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  Users,
  Link2,
  Clock3,
} from 'lucide-react';
import { PMNavbar } from '@/components/PMNavbar';
import { LCPartnerNavbar } from '@/components/LCPartnerNavbar';
import { getLastDashboard } from '@/lib/dashboard-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { mockWorkstreamDeadlines } from '@/data/mockData';
import { tasksAPI, projectsAPI, deliverablesAPI, slideSubmissionsAPI } from '@/lib/api';
import type { TaskFromApi } from '@/lib/task-utils';
import { notifyTaskAssigned } from '@/lib/notifications-storage';
import { getEffectiveRole } from '@/lib/permissions';
import type { WorkstreamDeadline } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthContext';
import { AppRole } from '@/lib/permissions';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';


function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(value: string | Date): string {
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toLocalDateInput(value: string | Date): string {
  const d = new Date(value);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toLocalTimeInput(value: string | Date): string {
  const d = new Date(value);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

const SLIDE_DELIVERABLE_ID_PATTERN = /\[\[SLIDE_DELIVERABLE_ID:([^\]]+)\]\]/i;

function getSlideDeliverableId(description?: string | null): string | null {
  if (!description) return null;
  const match = description.match(SLIDE_DELIVERABLE_ID_PATTERN);
  return match?.[1] ?? null;
}

function isWordOrPowerPointLink(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const normalized = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
    const isSharePointOfficeLink =
      url.hostname.toLowerCase().includes('.sharepoint.com') &&
      /\/:(w|p):\//i.test(url.pathname);
    return (
      /\.(ppt|pptx|doc|docx)(?:$|[/?#&])/i.test(normalized) ||
      /\b(powerpoint|word)\b/i.test(normalized) ||
      isSharePointOfficeLink ||
      normalized.includes('powerpoint.office.com') ||
      normalized.includes('word.office.com')
    );
  } catch {
    return false;
  }
}

type ProjectSummary = {
  id: string;
  name: string;
  members?: { user: { email: string } }[];
};

type SlideSubmissionFromApi = {
  id: string;
  fileUrl: string;
  submittedAt: string;
  status: string;
  deliverableId: string;
  submitter?: {
    email?: string;
    firstName?: string | null;
    lastName?: string | null;
  };
};

export default function EngagementPage() {
  const session = useAuth();
  const router = useRouter();
  const [workstreams] = useState<WorkstreamDeadline[]>(mockWorkstreamDeadlines);
  const [tasks, setTasks] = useState<TaskFromApi[]>([]);
  const [slideSubmissions, setSlideSubmissions] = useState<SlideSubmissionFromApi[]>([]);
  const [hasMounted, setHasMounted] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [activeWorkstreamId, setActiveWorkstreamId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<TaskFromApi | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [allProjectMemberEmails, setAllProjectMemberEmails] = useState<string[]>([]);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitLinks, setSubmitLinks] = useState<Record<string, string>>({});
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    assignmentType: 'slide' as 'slide' | 'workstream',
    assignType: 'person' as 'person' | 'all_team',
    assigneeEmail: '',
    dueDate: '',
    dueTime: '23:59',
  });
  const [resolvedRole, setResolvedRole] = useState<AppRole>('CONSULTANT');
  const canEdit = resolvedRole === 'PM' || resolvedRole === 'ADMIN';
  const canSubmitSlides = resolvedRole === 'CONSULTANT' || resolvedRole === 'LC';
  const canReviewSubmissions = resolvedRole === 'PM' || resolvedRole === 'ADMIN';

  const loadTasks = () =>
    tasksAPI
      .getAll({ includeCompleted: true })
      .then((res) => setTasks(Array.isArray(res.data) ? res.data : []))
      .catch(() => setTasks([]));

  const loadSubmissions = () => {
    if (canReviewSubmissions) {
      return slideSubmissionsAPI
        .getAll()
        .then((res) => setSlideSubmissions(Array.isArray(res.data) ? res.data : []))
        .catch(() => setSlideSubmissions([]));
    }
    if (canSubmitSlides) {
      return slideSubmissionsAPI
        .getMine()
        .then((res) => setSlideSubmissions(Array.isArray(res.data) ? res.data : []))
        .catch(() => setSlideSubmissions([]));
    }
    setSlideSubmissions([]);
    return Promise.resolve();
  };

  useEffect(() => {
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in'); 
    }
  }, [session, router]);

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  useEffect(() => {
    const fetchRole = async () => {
      if (session) {
        const token = await session.getToken(); 
        const email = session.user?.email || '';
        
        const role = await getEffectiveRole(token, email);
        setResolvedRole(role);
      }
    };

    fetchRole();
  }, [session]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!session?.user?.email) return;
    loadTasks();
  }, [session?.user?.email]);

  useEffect(() => {
    if (!session?.user?.email) return;
    loadSubmissions();
  }, [session?.user?.email, canReviewSubmissions, canSubmitSlides]);

  useEffect(() => {
    projectsAPI
      .getAll({ includeMembers: true, limit: 100 })
      .then((res) => {
        const rawProjects: ProjectSummary[] = res.data?.projects ?? [];
        setProjects(rawProjects);
        const emails = Array.from(
          new Set(
            rawProjects.flatMap(
              (p) => p.members?.map((m) => m.user.email) ?? [],
            ),
          ),
        ).filter(Boolean) as string[];
        setAllProjectMemberEmails(emails);
      })
      .catch(() => {
        setProjects([]);
        setAllProjectMemberEmails([]);
      });
  }, [session?.user?.email]);

  const assignOptions = useMemo(
    () => [
      { value: 'all_team', label: 'All team members' },
      ...allProjectMemberEmails.map((email) => ({ value: email, label: email })),
    ],
    [allProjectMemberEmails],
  );

  const openAddModal = (workstreamId: string) => {
    setTaskError(null);
    setActiveWorkstreamId(workstreamId);
    setForm({
      title: '',
      assignmentType: 'slide',
      assignType: 'all_team',
      assigneeEmail: '',
      dueDate: '',
      dueTime: '23:59',
    });
    setAddModalOpen(true);
  };

  const openEditModal = (task: TaskFromApi) => {
    setEditingTask(task);
    setForm({
      title: task.taskName,
      assignmentType: getSlideDeliverableId(task.description) ? 'slide' : 'workstream',
      assignType:
        task.assigneeType === 'ALL' || task.assigneeType === 'ALL_TEAM'
          ? 'all_team'
          : 'person',
      assigneeEmail: task.assigneeEmail ?? '',
      dueDate: task.dueDate ? toLocalDateInput(task.dueDate) : '',
      dueTime: task.dueDate ? toLocalTimeInput(task.dueDate) : '23:59',
    });
    setEditModalOpen(true);
  };

  const handleAddAssignment = async () => {
    if (!activeWorkstreamId || !form.title.trim() || !form.dueDate) return;
    if (form.assignType === 'person' && !form.assigneeEmail) {
      setTaskError('Select a person for person-assigned assignments.');
      return;
    }
    setTaskError(null);

    const dueDateTime = `${form.dueDate}T${form.dueTime || '23:59'}:00`;

    const workstream =
      workstreams.find((w) => w.id === activeWorkstreamId)?.workstreamName ?? 'General';

    try {
      if (!projects.length) {
        setTaskError('No project found. Create a project/team first.');
        return;
      }

      const selectedProject = projects[0];
      const selectedProjectMemberEmails =
        selectedProject.members?.map((m) => m.user.email).filter(Boolean) ??
        allProjectMemberEmails;

      let description: string | undefined;
      if (form.assignmentType === 'slide') {
        let deliverableId: string | undefined;

        try {
          const deliverableRes = await deliverablesAPI.create({
            projectId: selectedProject.id,
            title: form.title.trim(),
            description: 'Slide assignment created from engagement.',
            type: 'PRESENTATION',
            deadline: dueDateTime,
          });
          deliverableId = deliverableRes.data?.id;
        } catch (err: any) {
          const message =
            err?.response?.data?.message ??
            err?.message ??
            'Failed to create deliverable for assignment.';
          setTaskError(Array.isArray(message) ? message.join(', ') : String(message));
          return;
        }

        if (!deliverableId) {
          setTaskError('Failed to create deliverable for assignment.');
          return;
        }

        description = `Slide assignment\n[[SLIDE_DELIVERABLE_ID:${deliverableId}]]`;
      } else {
        description = 'Workstream assignment';
      }

      const assigneeType: 'PERSON' | 'ALL' | 'ALL_TEAM' =
        form.assignType === 'all_team' ? 'ALL_TEAM' : 'PERSON';
      const assigneeEmail =
        form.assignType === 'person' ? form.assigneeEmail || undefined : undefined;
      const projectId = selectedProject.id;
      const projectName = selectedProject.name;

      await tasksAPI.create({
        taskName: form.title.trim(),
        description,
        dueDate: form.dueDate,
        dueTime: form.dueTime || '23:59',
        projectName,
        workstream,
        workstreamId: activeWorkstreamId,
        assigneeType,
        assigneeEmail,
        projectId,
      });

      setAddModalOpen(false);
      setActiveWorkstreamId(null);
      setForm({
        title: '',
        assignmentType: 'slide',
        assignType: 'all_team',
        assigneeEmail: '',
        dueDate: '',
        dueTime: '23:59',
      });

      if (form.assignType === 'person' && form.assigneeEmail) {
        notifyTaskAssigned(form.assigneeEmail, form.title.trim(), '');
      } else if (form.assignType === 'all_team') {
        selectedProjectMemberEmails.forEach((email) =>
          notifyTaskAssigned(email, form.title.trim(), ''),
        );
      }

      await loadTasks();
    } catch (err: any) {
      const message =
        err.response?.data?.message ??
        err.message ??
        'Failed to create assignment. Is the backend running?';
      setTaskError(message);
    }
  };

  const handleUpdateTask = () => {
    if (!editingTask) return;
    if (!form.title.trim() || !form.dueDate) return;
    const assigneeType =
      form.assignType === 'all_team' ? 'ALL_TEAM' : 'PERSON';
    tasksAPI
      .update(editingTask.id, {
        taskName: form.title.trim(),
        dueDate: form.dueDate,
        dueTime: form.dueTime || '23:59',
        assigneeType,
        assigneeEmail:
          form.assignType === 'person' ? form.assigneeEmail || undefined : undefined,
      })
      .then(() => loadTasks())
      .then(() => {
        setEditModalOpen(false);
        setEditingTask(null);
      })
      .catch(() => {});
  };

  const handleDeleteTask = (id: string) => {
    if (!confirm('Delete this assignment?')) return;
    tasksAPI
      .delete(id)
      .then(() => loadTasks())
      .catch(() => {});
  };

  const handleSubmitSlides = async (task: TaskFromApi) => {
    const deliverableId = getSlideDeliverableId(task.description);
    if (!deliverableId) return;

    const link = (submitLinks[task.id] ?? '').trim();
    if (!link) {
      setSubmissionError('Please paste a PowerPoint or Word link before submitting.');
      return;
    }

    if (!isWordOrPowerPointLink(link)) {
      setSubmissionError('Submission link must be a Microsoft PowerPoint or Word link.');
      return;
    }

    setSubmissionError(null);
    setSubmittingTaskId(task.id);
    try {
      await slideSubmissionsAPI.submit({
        deliverableId,
        presentationLink: link,
        fileName: `${task.taskName}.url`,
      });
      setSubmitLinks((prev) => ({ ...prev, [task.id]: '' }));
      await loadSubmissions();
    } catch (err: any) {
      const message =
        err.response?.data?.message ?? err.message ?? 'Failed to submit slides.';
      setSubmissionError(message);
    } finally {
      setSubmittingTaskId(null);
    }
  };

  const getTasksForWorkstream = (workstreamId: string) =>
    tasks.filter((t) => t.workstreamId === workstreamId);

  const getAssigneeLabel = (task: TaskFromApi) =>
    task.assigneeType === 'ALL' || task.assigneeType === 'ALL_TEAM'
      ? 'All team members'
      : (task.assigneeEmail ?? '—');

  const getSubmissionsForTask = (task: TaskFromApi) => {
    const deliverableId = getSlideDeliverableId(task.description);
    if (!deliverableId) return [];
    return slideSubmissions
      .filter((s) => s.deliverableId === deliverableId)
      .sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      );
  };

  if (session.loading || !hasMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="animate-pulse text-[var(--foreground)]/70">Loading...</div>
      </div>
    );
  }

  if (!session.isLoggedIn) {
    router.replace('/sign-in');
    return null;
  }

  const lastDashboard = hasMounted ? getLastDashboard() : null;
  const showLCNavbar =
    resolvedRole === 'LC' ||
    (resolvedRole !== 'PM' && resolvedRole !== 'ADMIN' && lastDashboard === '/lc');
  const showPartnerNavbar =
    resolvedRole === 'PARTNER' ||
    resolvedRole === 'EXECUTIVE' ||
    (resolvedRole !== 'PM' && resolvedRole !== 'ADMIN' && lastDashboard === '/partner');
  const showPMNavbar =
    resolvedRole === 'PM' ||
    resolvedRole === 'ADMIN' ||
    (!showLCNavbar && !showPartnerNavbar);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      {showPMNavbar && <PMNavbar currentPath="/engagement" />}
      {showLCNavbar && <LCPartnerNavbar role="LC" currentPath="/engagement" />}
      {showPartnerNavbar && (
        <LCPartnerNavbar role="PARTNER" currentPath="/engagement" />
      )}

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 overflow-y-auto">
        <div className="max-w-[1800px] mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--foreground)]">
              Engagement — Workstreams & Assignments
            </h1>
          </div>

          {submissionError && (
            <div className="rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-700 dark:text-rose-300 px-3 py-2 text-sm">
              {submissionError}
            </div>
          )}

          <div className="grid gap-6">
            {workstreams.map((ws) => {
              const workstreamTasks = getTasksForWorkstream(ws.id);
              const completedCount = workstreamTasks.filter((task) => task.completed).length;
              const progressPercent = workstreamTasks.length
                ? Math.round((completedCount / workstreamTasks.length) * 100)
                : 0;
              const overallDueDate =
                workstreamTasks.length > 0
                  ? new Date(
                      Math.max(
                        ...workstreamTasks.map((task) =>
                          new Date(task.dueDate).getTime(),
                        ),
                      ),
                    )
                  : null;
              const daysRemaining = overallDueDate
                ? Math.ceil(
                    (overallDueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                  )
                : null;
              return (
                <Card key={ws.id} className="shadow-lg">
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="w-5 h-5 text-[var(--primary)]" />
                          {ws.workstreamName}
                        </CardTitle>
                        <CardDescription>{ws.description}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            ws.status === 'on_track'
                              ? 'success'
                              : ws.status === 'at_risk'
                                ? 'warning'
                                : 'danger'
                          }
                          size="sm"
                        >
                          {ws.status.replace('_', ' ')}
                        </Badge>
                        <span className="text-xs text-[var(--foreground)]/60">
                          {daysRemaining != null ? `${daysRemaining}d left` : 'No due date'} ·{' '}
                          {progressPercent}%
                        </span>
                        <span className="text-xs text-[var(--foreground)]/60">
                          Overall due: {overallDueDate ? formatDate(overallDueDate) : '—'}
                        </span>
                        {canEdit && (
                          <Button size="sm" onClick={() => openAddModal(ws.id)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add assignment
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="h-2 bg-[var(--accent)] rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full bg-[var(--primary)]"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {workstreamTasks.length === 0 ? (
                      <p className="text-sm text-[var(--foreground)]/60 py-4">
                        No assignments yet.{canEdit && ' Use "Add assignment" to create one.'}
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {workstreamTasks.map((task) => {
                          const isSlideTask = !!getSlideDeliverableId(task.description);
                          const submissions = getSubmissionsForTask(task);
                          return (
                            <li
                              key={task.id}
                              className={cn(
                                'p-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/80',
                              )}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-[var(--foreground)]">
                                      {task.taskName}
                                    </p>
                                    <Badge
                                      variant={task.completed ? 'success' : 'warning'}
                                      size="sm"
                                    >
                                      {task.completed
                                        ? isSlideTask
                                          ? 'Approved'
                                          : 'Completed'
                                        : task.status.replace('_', ' ').toLowerCase()}
                                    </Badge>
                                    {isSlideTask && (
                                      <Badge variant="info" size="sm">
                                        Slide assignment
                                      </Badge>
                                    )}
                                    {!isSlideTask && (
                                      <Badge variant="default" size="sm">
                                        Workstream assignment
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 text-xs text-[var(--foreground)]/70 flex-wrap">
                                    <span className="flex items-center gap-1">
                                      <Users className="w-3 h-3" />
                                      {getAssigneeLabel(task)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      Due {formatDateTime(task.dueDate)}
                                    </span>
                                  </div>
                                </div>
                                {canEdit && (
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openEditModal(task)}
                                      aria-label="Edit assignment"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-rose-600 hover:bg-rose-500/20"
                                      onClick={() => handleDeleteTask(task.id)}
                                      aria-label="Delete assignment"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>

                              {isSlideTask && canSubmitSlides && (
                                <div className="mt-3 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2">
                                  <input
                                    value={submitLinks[task.id] ?? ''}
                                    onChange={(e) =>
                                      setSubmitLinks((prev) => ({
                                        ...prev,
                                        [task.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Paste PowerPoint or Word link"
                                    className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                                  />
                                  <Button
                                    onClick={() => handleSubmitSlides(task)}
                                    disabled={submittingTaskId === task.id}
                                  >
                                    <Link2 className="w-4 h-4 mr-2" />
                                    {submittingTaskId === task.id ? 'Submitting...' : 'Submit link'}
                                  </Button>
                                </div>
                              )}

                              {isSlideTask && canReviewSubmissions && (
                                <div className="mt-3 space-y-2">
                                  <p className="text-xs font-semibold text-[var(--foreground)]/70 uppercase tracking-wide">
                                    Consultant submissions
                                  </p>
                                  {submissions.length === 0 ? (
                                    <p className="text-sm text-[var(--foreground)]/60">
                                      No submissions yet.
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      {submissions.map((submission) => {
                                        const submitterName =
                                          `${submission.submitter?.firstName || ''} ${submission.submitter?.lastName || ''}`.trim() ||
                                          submission.submitter?.email ||
                                          'Unknown';
                                        return (
                                          <div
                                            key={submission.id}
                                            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
                                          >
                                            <div>
                                              <p className="text-sm font-medium text-[var(--foreground)]">
                                                {submitterName}
                                              </p>
                                              <p className="text-xs text-[var(--foreground)]/70 flex items-center gap-1">
                                                <Clock3 className="w-3 h-3" />
                                                Submitted {formatDateTime(submission.submittedAt)}
                                              </p>
                                            </div>
                                            <a
                                              href={submission.fileUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="text-sm text-[var(--primary)] underline"
                                            >
                                              Open submission
                                            </a>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>

      <Modal
        isOpen={addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          setTaskError(null);
        }}
        title="Add assignment"
        size="md"
      >
        <div className="space-y-4">
          {taskError && (
            <div className="rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-700 dark:text-rose-300 px-3 py-2 text-sm">
              {taskError}
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
              Assignment title
            </label>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
              placeholder="e.g. Complete market analysis"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
              Assignment type
            </label>
            <select
              value={form.assignmentType}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  assignmentType: e.target.value as 'slide' | 'workstream',
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
            >
              <option value="slide">Slide assignment</option>
              <option value="workstream">Workstream assignment</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
              Assign to
            </label>
            <select
              value={
                form.assignType === 'all_team' ? 'all_team' : form.assigneeEmail
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'all_team') {
                  setForm((p) => ({
                    ...p,
                    assignType: 'all_team',
                    assigneeEmail: '',
                  }));
                } else {
                  setForm((p) => ({
                    ...p,
                    assignType: 'person',
                    assigneeEmail: v,
                  }));
                }
              }}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
            >
              {assignOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
                Due date
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
                Due time
              </label>
              <input
                type="time"
                value={form.dueTime}
                onChange={(e) => setForm((p) => ({ ...p, dueTime: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAssignment} disabled={!form.title.trim() || !form.dueDate}>
              <Plus className="w-4 h-4 mr-2" /> Add assignment
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit assignment"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
              Assignment title
            </label>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
              placeholder="e.g. Complete market analysis"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
              Assign to
            </label>
            <select
              value={form.assignType === 'all_team' ? 'all_team' : form.assigneeEmail}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'all_team')
                  setForm((p) => ({ ...p, assignType: 'all_team', assigneeEmail: '' }));
                else setForm((p) => ({ ...p, assignType: 'person', assigneeEmail: v }));
              }}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
            >
              {assignOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
                Due date
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
                Due time
              </label>
              <input
                type="time"
                value={form.dueTime}
                onChange={(e) => setForm((p) => ({ ...p, dueTime: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTask} disabled={!form.title.trim() || !form.dueDate}>
              Save changes
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
