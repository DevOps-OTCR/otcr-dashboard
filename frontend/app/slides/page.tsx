'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Upload } from 'lucide-react';
import { AppNavbar } from '@/components/AppNavbar';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getEffectiveRole, type AppRole } from '@/lib/permissions';
import { projectsAPI, slideSubmissionsAPI, setAuthToken } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';

type ProjectOption = {
  id: string;
  name: string;
};

type DeliverableItem = {
  id: string;
  title: string;
  deadline: string;
  templateKind?: string;
  status: string;
  assignees?: Array<{
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  }>;
};

type SprintItem = {
  id: string;
  label: string;
  status: string;
  weekStartDate: string;
  weekEndDate: string;
  deliverables?: DeliverableItem[];
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

function formatAssignees(assignees?: DeliverableItem['assignees']) {
  if (!assignees || assignees.length === 0) return 'Unassigned';
  return assignees
    .map((assignee) => {
      const fullName = [assignee.firstName, assignee.lastName].filter(Boolean).join(' ').trim();
      return fullName || assignee.email || 'Assigned';
    })
    .join(', ');
}

function formatSubmitter(
  submitter?: SlideSubmissionFromApi['submitter'],
) {
  if (!submitter) return 'Unknown submitter';
  const fullName = [submitter.firstName, submitter.lastName].filter(Boolean).join(' ').trim();
  return fullName || submitter.email || 'Unknown submitter';
}

function formatWeekLabel(value: string, fallbackIndex?: number) {
  const normalized = value.replace(/\bSprint\s+(\d+)\b/gi, 'Week $1').trim();
  if (normalized) return normalized;
  if (fallbackIndex != null) return `Week ${fallbackIndex + 1}`;
  return 'Week';
}

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
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [sprints, setSprints] = useState<SprintItem[]>([]);
  const [submissions, setSubmissions] = useState<SlideSubmissionFromApi[]>([]);
  const [submitLinks, setSubmitLinks] = useState<Record<string, string>>({});
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canSeeAllSubmissions =
    resolvedRole === 'PM' ||
    resolvedRole === 'LC' ||
    resolvedRole === 'PARTNER' ||
    resolvedRole === 'EXECUTIVE' ||
    resolvedRole === 'ADMIN';
  const canModerateSubmissions =
    resolvedRole === 'PM' || resolvedRole === 'LC' || resolvedRole === 'ADMIN';
  const canSubmitRevision =
    resolvedRole === 'CONSULTANT' || resolvedRole === 'LC';
  const currentEmail = (session.user?.email ?? '').toLowerCase();

  const loadSprints = useCallback(async (projectId: string) => {
    const res = await projectsAPI.getSprints(projectId);
    setSprints((res.data ?? []) as SprintItem[]);
  }, []);

  const loadData = useCallback(async () => {
    if (!session.isLoggedIn || !session.user?.email) return;

    const token = await session.getToken();
    setAuthToken(token || session.user.email);

    const [projectsRes, submissionsRes] = await Promise.all([
      projectsAPI.getAll({ limit: 100 }),
      canSeeAllSubmissions ? slideSubmissionsAPI.getAll() : slideSubmissionsAPI.getMine(),
    ]);

    const nextProjects = ((projectsRes.data?.projects ?? []) as Array<{ id: string; name: string }>).map(
      (item) => ({ id: item.id, name: item.name }),
    );
    setProjects(nextProjects);

    const nextProjectId = selectedProjectId || nextProjects[0]?.id || '';
    setSelectedProjectId(nextProjectId);
    if (nextProjectId) {
      await loadSprints(nextProjectId);
    } else {
      setSprints([]);
    }

    setSubmissions(Array.isArray(submissionsRes.data) ? submissionsRes.data : []);
  }, [canSeeAllSubmissions, loadSprints, selectedProjectId, session]);

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

  useEffect(() => {
    const init = async () => {
      if (!session.isLoggedIn || !session.user?.email) return;
      try {
        await loadData();
      } catch {
        setProjects([]);
        setSprints([]);
        setSubmissions([]);
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [session.isLoggedIn, session.user?.email, loadData]);

  const visibleSprints = useMemo(
    () =>
      sprints
        .filter((sprint) => (canModerateSubmissions || canSeeAllSubmissions ? true : sprint.status === 'RELEASED'))
        .map((sprint) => ({
          ...sprint,
          deliverables: (sprint.deliverables ?? []).filter((deliverable) => {
            const isSlide =
              deliverable.templateKind === 'INITIAL_SLIDES' ||
              deliverable.templateKind === 'FINAL_SLIDES';
            if (!isSlide) return false;
            if (canModerateSubmissions || canSeeAllSubmissions) return true;
            return Boolean(
              deliverable.assignees?.some(
                (assignee) => assignee.email?.toLowerCase() === currentEmail,
              ),
            );
          }),
        }))
        .filter((sprint) => (sprint.deliverables ?? []).length > 0),
    [canModerateSubmissions, canSeeAllSubmissions, currentEmail, sprints],
  );

  const getSubmissionsForDeliverable = (deliverableId: string) =>
    submissions
      .filter((submission) => submission.deliverableId === deliverableId)
      .sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      );

  const handleProjectChange = async (projectId: string) => {
    setSelectedProjectId(projectId);
    if (!projectId) {
      setSprints([]);
      return;
    }

    setLoading(true);
    try {
      await loadSprints(projectId);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRevision = async (deliverable: DeliverableItem) => {
    const link = (submitLinks[deliverable.id] ?? '').trim();
    if (!link) {
      setError('Add a PowerPoint or Word link before submitting.');
      return;
    }

    setError(null);
    setActioningId(deliverable.id);
    try {
      const token = await session.getToken();
      setAuthToken(token || session.user?.email || null);
      await slideSubmissionsAPI.submit({
        deliverableId: deliverable.id,
        presentationLink: link,
        fileName: `${deliverable.title}.url`,
      });
      setSubmitLinks((prev) => ({ ...prev, [deliverable.id]: '' }));
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
      await loadData();
    } finally {
      setActioningId(null);
    }
  };

  if (session.loading || !session.isLoggedIn || loading) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AppNavbar role={resolvedRole} currentPath="/slides" />

      <main className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-[1200px] mx-auto">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[var(--primary)]" />
                Slides
              </CardTitle>
              <CardDescription>
                Each week now separates Initial Slides from Final Slides.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-700 px-3 py-2 text-sm">
                  {error}
                </div>
              )}

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
                  Slide deliverables are grouped by week below.
                </span>
              </div>

              {visibleSprints.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-[var(--foreground)]/60 text-sm">
                  No slide deliverables yet.
                </div>
              ) : (
                visibleSprints.map((sprint, index) => {
                  const initialSlides = (sprint.deliverables ?? []).filter(
                    (deliverable) => deliverable.templateKind === 'INITIAL_SLIDES',
                  );
                  const finalSlides = (sprint.deliverables ?? []).filter(
                    (deliverable) => deliverable.templateKind === 'FINAL_SLIDES',
                  );

                  const renderSlideColumn = (
                    title: string,
                    deliverables: DeliverableItem[],
                  ) => (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/70 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold">{title}</h3>
                        <Badge variant="info" size="sm">
                          {deliverables.length}
                        </Badge>
                      </div>
                      {deliverables.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-sm text-[var(--foreground)]/60">
                          No {title.toLowerCase()} this week.
                        </div>
                      ) : (
                        deliverables.map((deliverable) => {
                          const assignmentSubmissions = getSubmissionsForDeliverable(deliverable.id);
                          const latestSubmission = assignmentSubmissions[0];
                          const latestStatus = latestSubmission
                            ? getSubmissionStatusMeta(latestSubmission.status)
                            : null;
                          const assignedToCurrentUser = Boolean(
                            deliverable.assignees?.some(
                              (assignee) => assignee.email?.toLowerCase() === currentEmail,
                            ),
                          );

                          return (
                            <div
                              key={deliverable.id}
                              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3"
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div>
                                  <p className="font-semibold">{deliverable.title}</p>
                                  <p className="text-xs text-[var(--foreground)]/70">
                                    Due {new Date(deliverable.deadline).toLocaleString()}
                                  </p>
                                </div>
                                {latestStatus ? (
                                  <Badge variant={latestStatus.variant} size="sm">
                                    {latestStatus.label}
                                  </Badge>
                                ) : (
                                  <Badge variant="warning" size="sm">
                                    {deliverable.status.replace(/_/g, ' ')}
                                  </Badge>
                                )}
                              </div>

                              <p className="text-sm text-[var(--foreground)]/70">
                                Assigned: {formatAssignees(deliverable.assignees)}
                              </p>

                              {canSubmitRevision && assignedToCurrentUser && (
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <input
                                    value={submitLinks[deliverable.id] ?? ''}
                                    onChange={(e) =>
                                      setSubmitLinks((prev) => ({
                                        ...prev,
                                        [deliverable.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="https://powerpoint.office.com/..."
                                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => void handleSubmitRevision(deliverable)}
                                    disabled={
                                      actioningId === deliverable.id ||
                                      !(submitLinks[deliverable.id] ?? '').trim()
                                    }
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Submit
                                  </Button>
                                </div>
                              )}

                              {latestSubmission && (
                                <div className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/60 p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <p className="text-xs text-[var(--foreground)]/60">
                                      Latest submission
                                    </p>
                                    {(canModerateSubmissions || resolvedRole === 'PARTNER' || resolvedRole === 'EXECUTIVE') && (
                                      <span className="rounded-full bg-[var(--card)] px-2 py-1 text-[11px] font-medium text-[var(--foreground)]/75">
                                        {formatSubmitter(latestSubmission.submitter)}
                                      </span>
                                    )}
                                  </div>
                                  <a
                                    href={latestSubmission.fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 block text-sm font-medium text-[var(--primary)] hover:underline"
                                  >
                                    View submission
                                  </a>
                                  <p className="mt-1 text-xs text-[var(--foreground)]/60">
                                    {new Date(latestSubmission.submittedAt).toLocaleString()}
                                  </p>
                                  {canModerateSubmissions && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => void handleMarkCommented(latestSubmission.id)}
                                        disabled={actioningId === latestSubmission.id}
                                      >
                                        Mark Commented
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => void handleRequestRevision(latestSubmission.id)}
                                        disabled={actioningId === latestSubmission.id}
                                      >
                                        Request Revision
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => void handleApprove(latestSubmission.id)}
                                        disabled={actioningId === latestSubmission.id}
                                      >
                                        Approve
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  );

                  return (
                    <div key={sprint.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                      <div className="mb-4">
                        <h2 className="text-lg font-semibold">
                          {formatWeekLabel(sprint.label, index)}
                        </h2>
                        <p className="text-sm text-[var(--foreground)]/60">
                          {new Date(sprint.weekStartDate).toLocaleDateString()} - {new Date(sprint.weekEndDate).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        {renderSlideColumn('Initial Slides', initialSlides)}
                        {renderSlideColumn('Final Slides', finalSlides)}
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
