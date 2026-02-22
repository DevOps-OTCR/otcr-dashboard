'use client';

import { useEffect, useMemo, useState } from 'react';
import { Layers, Upload } from 'lucide-react';
import { PMNavbar } from '@/components/PMNavbar';
import { LCPartnerNavbar } from '@/components/LCPartnerNavbar';
import { AppNavbar } from '@/components/AppNavbar';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getEffectiveRole } from '@/lib/permissions';
import { tasksAPI, slideSubmissionsAPI, setAuthToken } from '@/lib/api';
import type { TaskFromApi } from '@/lib/task-utils';
import { addNotification } from '@/lib/notifications-storage';
import { useAuth } from '@/components/AuthContext';
import type { AppRole } from '@/lib/permissions';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';

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
    return (
      /\.(ppt|pptx|doc|docx)(?:$|[/?#&])/i.test(normalized) ||
      /\b(powerpoint|word)\b/i.test(normalized) ||
      normalized.includes('powerpoint.office.com') ||
      normalized.includes('word.office.com')
    );
  } catch {
    return false;
  }
}

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

function getSubmissionStatusMeta(status: string): {
  label: string;
  variant: 'success' | 'warning' | 'info' | 'danger' | 'default';
} {
  switch (status) {
    case 'APPROVED':
      return { label: 'Approved', variant: 'success' };
    case 'REQUIRES_RESUBMISSION':
      return { label: 'Revision requested', variant: 'danger' };
    case 'REJECTED':
      return { label: 'Rejected', variant: 'danger' };
    case 'PENDING_REVIEW':
      return { label: 'Pending review', variant: 'warning' };
    default:
      return { label: status.replace(/_/g, ' ').toLowerCase(), variant: 'info' };
  }
}

export default function SlidesPage() {
  const session = useAuth();
  const [resolvedRole, setResolvedRole] = useState<AppRole>('CONSULTANT');
  const canSeeAllSubmissions =
    resolvedRole === 'PM' ||
    resolvedRole === 'LC' ||
    resolvedRole === 'PARTNER' ||
    resolvedRole === 'ADMIN';
  const canModerateSubmissions =
    resolvedRole === 'PM' || resolvedRole === 'LC' || resolvedRole === 'ADMIN';
  const canNotifyComments =
    resolvedRole === 'PM' ||
    resolvedRole === 'LC' ||
    resolvedRole === 'PARTNER' ||
    resolvedRole === 'ADMIN';
  const canSubmitRevision = resolvedRole === 'CONSULTANT';

  const [tasks, setTasks] = useState<TaskFromApi[]>([]);
  const [submissions, setSubmissions] = useState<SlideSubmissionFromApi[]>([]);
  const [submitLinks, setSubmitLinks] = useState<Record<string, string>>({});
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const syncRole = async () => {
      if (!session.isLoggedIn) return;
      const token = await session.getToken();
      const email = session.user?.email || '';
      const role = await getEffectiveRole(token, email);
      setResolvedRole(role);
    };
    void syncRole();
  }, [session]);

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  const loadData = async () => {
    try {
      const token = await session.getToken();
      setAuthToken(token || session.user?.email || null);

      const [tasksRes, submissionsRes] = await Promise.all([
        tasksAPI.getAll({ includeCompleted: true }),
        canSeeAllSubmissions ? slideSubmissionsAPI.getAll() : slideSubmissionsAPI.getMine(),
      ]);
      setTasks(Array.isArray(tasksRes.data) ? tasksRes.data : []);
      setSubmissions(Array.isArray(submissionsRes.data) ? submissionsRes.data : []);
    } catch {
      setTasks([]);
      setSubmissions([]);
    }
  };

  useEffect(() => {
    if (!session.user?.email) return;
    void loadData();
  }, [session.user?.email, canSeeAllSubmissions]);

  const slideAssignments = useMemo(
    () => tasks.filter((task) => !!getSlideDeliverableId(task.description)),
    [tasks],
  );

  const getSubmissionsForTask = (task: TaskFromApi) => {
    const deliverableId = getSlideDeliverableId(task.description);
    if (!deliverableId) return [];
    return submissions
      .filter((submission) => submission.deliverableId === deliverableId)
      .sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      );
  };

  const notifyConsultantOfAction = (
    submissionId: string,
    actionText: string,
  ) => {
    const submission = submissions.find((item) => item.id === submissionId);
    const submitterEmail = submission?.submitter?.email;
    if (!submitterEmail) return;

    const relatedTask = slideAssignments.find(
      (task) => getSlideDeliverableId(task.description) === submission.deliverableId,
    );
    const assignmentName = relatedTask?.taskName || 'your slide assignment';

    const actor =
      session.user?.name?.trim() ||
      session.user?.email ||
      `${resolvedRole}`;

    addNotification({
      type: 'project_updated',
      title: 'Slides update',
      message: `${actor} has ${actionText} to ${assignmentName}`,
      assigneeEmail: submitterEmail,
      taskId: relatedTask?.id,
      taskTitle: assignmentName,
    });
  };

  const handleSubmitRevision = async (task: TaskFromApi) => {
    const deliverableId = getSlideDeliverableId(task.description);
    if (!deliverableId) return;
    const link = (submitLinks[task.id] ?? '').trim();
    if (!link) {
      setError('Add a PowerPoint or Word link before submitting.');
      return;
    }
    if (!isWordOrPowerPointLink(link)) {
      setError('Submission link must be a Microsoft PowerPoint or Word link.');
      return;
    }
    setError(null);
    setActioningId(task.id);
    try {
      const token = await session.getToken();
      setAuthToken(token || session.user?.email || null);
      await slideSubmissionsAPI.submit({
        deliverableId,
        presentationLink: link,
        fileName: `${task.taskName}.url`,
      });
      setSubmitLinks((prev) => ({ ...prev, [task.id]: '' }));
      await loadData();
    } catch (err: any) {
      const message =
        err?.response?.data?.message ?? err?.message ?? 'Failed to submit revision.';
      setError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setActioningId(null);
    }
  };

  const handleMarkCommented = async (submissionId: string) => {
    setActioningId(submissionId);
    try {
      const token = await session.getToken();
      setAuthToken(token || session.user?.email || null);
      await slideSubmissionsAPI.markCommented(submissionId);
      notifyConsultantOfAction(submissionId, 'added comments');
      await loadData();
    } finally {
      setActioningId(null);
    }
  };

  const handleApprove = async (submissionId: string) => {
    setActioningId(submissionId);
    try {
      const token = await session.getToken();
      setAuthToken(token || session.user?.email || null);
      await slideSubmissionsAPI.approve(submissionId);
      notifyConsultantOfAction(submissionId, 'approved');
      await loadData();
    } finally {
      setActioningId(null);
    }
  };

  const handleRequestRevision = async (submissionId: string) => {
    setActioningId(submissionId);
    try {
      const token = await session.getToken();
      setAuthToken(token || session.user?.email || null);
      await slideSubmissionsAPI.requestRevision(submissionId);
      notifyConsultantOfAction(submissionId, 'requested revision');
      await loadData();
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {(resolvedRole === 'PM' || resolvedRole === 'ADMIN') && (
        <PMNavbar currentPath="/slides" />
      )}
      {(resolvedRole === 'LC' || resolvedRole === 'PARTNER') && (
        <LCPartnerNavbar
          role={resolvedRole === 'PARTNER' ? 'PARTNER' : 'LC'}
          currentPath="/slides"
        />
      )}
      {resolvedRole === 'CONSULTANT' && <AppNavbar role="CONSULTANT" currentPath="/slides" />}

      <main className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-[1200px] mx-auto">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[var(--primary)]" />
                Slides
              </CardTitle>
              <CardDescription>
                {canModerateSubmissions
                  ? 'Review submissions for assigned slide work.'
                  : canSubmitRevision
                    ? 'Submit PowerPoint/Word links and add revisions for assigned slide work.'
                    : 'View and comment on slide submissions.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-700 dark:text-rose-300 px-3 py-2 text-sm">
                  {error}
                </div>
              )}
              {slideAssignments.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-[var(--foreground)]/60 text-sm">
                  No slide assignments yet.
                </div>
              ) : (
                slideAssignments.map((assignment) => {
                  const assignmentSubmissions = getSubmissionsForTask(assignment);
                  const latestSubmission = assignmentSubmissions[0];
                  const latestStatus = latestSubmission
                    ? getSubmissionStatusMeta(latestSubmission.status)
                    : null;
                  return (
                    <div
                      key={assignment.id}
                      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/80"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <h3 className="font-semibold">{assignment.taskName}</h3>
                          <p className="text-xs text-[var(--foreground)]/70">
                            {assignment.workstream} • Due {new Date(assignment.dueDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {latestStatus ? (
                            <Badge variant={latestStatus.variant} size="sm">
                              {latestStatus.label}
                            </Badge>
                          ) : (
                            <Badge
                              variant={assignment.completed ? 'success' : 'warning'}
                              size="sm"
                            >
                              {assignment.completed ? 'Approved' : 'Pending approval'}
                            </Badge>
                          )}
                          <Badge variant={assignmentSubmissions.length ? 'success' : 'warning'} size="sm">
                            {assignmentSubmissions.length} submission{assignmentSubmissions.length === 1 ? '' : 's'}
                          </Badge>
                        </div>
                      </div>

                      {canSubmitRevision && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                          <input
                            value={submitLinks[assignment.id] ?? ''}
                            onChange={(e) =>
                              setSubmitLinks((prev) => ({
                                ...prev,
                                [assignment.id]: e.target.value,
                              }))
                            }
                            placeholder="Paste PowerPoint or Word link"
                            className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
                          />
                          <Button
                            onClick={() => handleSubmitRevision(assignment)}
                            disabled={actioningId === assignment.id}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            {assignmentSubmissions.length > 0 ? 'Add revision' : 'Submit link'}
                          </Button>
                        </div>
                      )}

                      <div className="mt-3 space-y-2">
                        {assignmentSubmissions.length === 0 ? (
                          <p className="text-sm text-[var(--foreground)]/60">No submissions yet.</p>
                        ) : (
                          assignmentSubmissions.map((submission) => {
                            const submitterName =
                              `${submission.submitter?.firstName || ''} ${submission.submitter?.lastName || ''}`.trim() ||
                              submission.submitter?.email ||
                              'Unknown';
                            return (
                              <div
                                key={submission.id}
                                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                              >
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div>
                                    <p className="text-sm font-medium">{submitterName}</p>
                                    <p className="text-xs text-[var(--foreground)]/70">
                                      Submitted {new Date(submission.submittedAt).toLocaleString()}
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
                                {(canNotifyComments || canModerateSubmissions) && (
                                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                                    {canNotifyComments && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleMarkCommented(submission.id)}
                                        disabled={actioningId === submission.id}
                                      >
                                        Notify assignee comments added
                                      </Button>
                                    )}
                                    {canModerateSubmissions && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleRequestRevision(submission.id)}
                                          disabled={actioningId === submission.id}
                                        >
                                          Request revision
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() => handleApprove(submission.id)}
                                          disabled={actioningId === submission.id}
                                        >
                                          Approve
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
