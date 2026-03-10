'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { projectsAPI, setAuthToken, slideSubmissionsAPI } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import FullScreenLoader from '@/components/AuthContext/LoadingScreen';
import { GoogleCalendarPanel } from '@/components/GoogleCalendarPanel';
import { AppNavbar } from '@/components/AppNavbar';

type ProjectOption = {
  id: string;
  name: string;
};

type SprintDeliverable = {
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
};

type SprintItem = {
  id: string;
  label: string;
  status: string;
  deliverables?: SprintDeliverable[];
};

type SubmissionItem = {
  id: string;
  deliverableId: string;
  status: string;
  submittedAt: string;
  reviewedAt?: string | null;
};

type AssignmentItem = {
  id: string;
  title: string;
  projectName: string;
  weekLabel: string;
  deadline: string;
  completed: boolean;
  consultantTaskStatus: string | null;
};

function normalizeWeekLabel(value: string) {
  const normalized = value.replace(/\bSprint\s+(\d+)\b/gi, 'Week $1').trim();
  const weekMatch = normalized.match(/\bWeek\s+\d+\b/i);
  return weekMatch ? weekMatch[0].replace(/^week/i, 'Week') : 'Other';
}

function getConsultantStatusMeta(status?: string | null): {
  label: string;
  variant: 'default' | 'info' | 'warning' | 'success' | 'danger';
} | null {
  if (!status) return null;
  switch (status) {
    case 'SUBMITTED':
      return { label: 'Submitted', variant: 'warning' };
    case 'COMMENTS_ADDED':
      return { label: 'Comments added', variant: 'info' };
    case 'REVISION_REQUESTED':
      return { label: 'Revision requested', variant: 'danger' };
    case 'APPROVED':
      return { label: 'Approved', variant: 'success' };
    default:
      return { label: status.replace(/_/g, ' ').toLowerCase(), variant: 'default' };
  }
}

export default function ConsultantDashboard() {
  const session = useAuth();
  const router = useRouter();
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('All Weeks');

  useEffect(() => {
    if (!session.loading && !session.isLoggedIn) {
      router.replace('/sign-in');
    }
  }, [session, router]);

  useEffect(() => {
    const loadAssignments = async () => {
      if (!session.isLoggedIn || !session.user?.email) return;
      try {
        const token = await session.getToken();
        setAuthToken(token || session.user.email);

        const [projectsRes, submissionsRes] = await Promise.all([
          projectsAPI.getAll({ includeMembers: true, limit: 100 }),
          slideSubmissionsAPI.getMine(),
        ]);

        const projects = (projectsRes.data?.projects ?? []) as ProjectOption[];
        const submissions = (Array.isArray(submissionsRes.data) ? submissionsRes.data : []) as SubmissionItem[];

        const latestSubmissionByDeliverable = new Map<string, SubmissionItem>();
        submissions
          .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
          .forEach((submission) => {
            if (!latestSubmissionByDeliverable.has(submission.deliverableId)) {
              latestSubmissionByDeliverable.set(submission.deliverableId, submission);
            }
          });

        const sprintResponses = await Promise.all(
          projects.map((project) =>
            projectsAPI
              .getSprints(project.id)
              .then((res) => ({ project, sprints: (res.data ?? []) as SprintItem[] }))
              .catch(() => ({ project, sprints: [] as SprintItem[] })),
          ),
        );

        const currentEmail = session.user.email.toLowerCase();
        const nextAssignments: AssignmentItem[] = [];

        sprintResponses.forEach(({ project, sprints }) => {
          sprints
            .filter((sprint) => sprint.status === 'RELEASED')
            .forEach((sprint) => {
              (sprint.deliverables ?? []).forEach((deliverable) => {
                const isAssignedToCurrentUser = Boolean(
                  deliverable.assignees?.some(
                    (assignee) => assignee.email?.toLowerCase() === currentEmail,
                  ),
                );

                const isSlideDeliverable =
                  deliverable.templateKind === 'INITIAL_SLIDES' ||
                  deliverable.templateKind === 'FINAL_SLIDES' ||
                  deliverable.templateKind === 'INITIAL_WHITEPAPER' ||
                  deliverable.templateKind === 'FINAL_WHITEPAPER';

                if (!isAssignedToCurrentUser && !isSlideDeliverable) return;

                const latestSubmission = latestSubmissionByDeliverable.get(deliverable.id);
                const consultantTaskStatus = (() => {
                  if (!latestSubmission) return null;
                  if (latestSubmission.status === 'APPROVED') return 'APPROVED';
                  if (
                    latestSubmission.status === 'REQUIRES_RESUBMISSION' ||
                    latestSubmission.status === 'REJECTED'
                  ) {
                    return 'REVISION_REQUESTED';
                  }
                  if (latestSubmission.status === 'PENDING_REVIEW') {
                    return latestSubmission.reviewedAt ? 'COMMENTS_ADDED' : 'SUBMITTED';
                  }
                  return latestSubmission.status;
                })();

                nextAssignments.push({
                  id: deliverable.id,
                  title: deliverable.title,
                  projectName: project.name,
                  weekLabel: normalizeWeekLabel(sprint.label),
                  deadline: deliverable.deadline,
                  completed: Boolean(deliverable.completed),
                  consultantTaskStatus,
                });
              });
            });
        });

        setAssignments(
          nextAssignments.sort(
            (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
          ),
        );
      } catch {
        setAssignments([]);
      }
    };

    void loadAssignments();
  }, [session, session.isLoggedIn, session.user?.email]);

  const availableWeeks = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((item) => {
      set.add(item.weekLabel);
    });
    const values = Array.from(set);
    return values.sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      const aNum = Number(a.match(/\d+/)?.[0] ?? 0);
      const bNum = Number(b.match(/\d+/)?.[0] ?? 0);
      return aNum - bNum;
    });
  }, [assignments]);

  useEffect(() => {
    if (availableWeeks.length === 0) {
      if (selectedWeek !== 'All Weeks') setSelectedWeek('All Weeks');
      return;
    }
    if (selectedWeek !== 'All Weeks' && !availableWeeks.includes(selectedWeek)) {
      setSelectedWeek(availableWeeks[availableWeeks.length - 1] ?? 'All Weeks');
    }
    if (selectedWeek === 'All Weeks') {
      setSelectedWeek(availableWeeks[availableWeeks.length - 1] ?? 'All Weeks');
    }
  }, [availableWeeks, selectedWeek]);

  const visibleActionItems = useMemo(() => {
    if (selectedWeek === 'All Weeks') return assignments;
    return assignments.filter((item) => item.weekLabel === selectedWeek);
  }, [assignments, selectedWeek]);

  const pendingActions = useMemo(
    () => visibleActionItems.filter((a) => !a.completed).length,
    [visibleActionItems],
  );

  if (session.loading || !session.isLoggedIn) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      <AppNavbar role="CONSULTANT" currentPath="/consultant" />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <Card className="shadow-lg h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Assignments</CardTitle>
                  <CardDescription>
                    Tasks assigned to you, including slide and whitepaper submissions for the selected week.
                  </CardDescription>
                </div>
                <Badge variant="info" size="sm">
                  {pendingActions} open
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[560px] overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedWeek('All Weeks')}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs border transition',
                    selectedWeek === 'All Weeks'
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                      : 'border-[var(--border)] text-[var(--foreground)]/70 hover:border-[var(--primary)]/50',
                  )}
                >
                  All Weeks
                </button>
                {availableWeeks.map((week) => (
                  <button
                    key={week}
                    type="button"
                    onClick={() => setSelectedWeek(week)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs border transition',
                      selectedWeek === week
                        ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                        : 'border-[var(--border)] text-[var(--foreground)]/70 hover:border-[var(--primary)]/50',
                    )}
                  >
                    {week}
                  </button>
                ))}
              </div>

              {visibleActionItems.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--foreground)]/60">
                  No assignments yet.
                </div>
              ) : (
                visibleActionItems.map((item) => {
                  const dueDate = new Date(item.deadline);
                  const isOverdue = dueDate < new Date() && !item.completed;
                  const consultantStatusMeta = getConsultantStatusMeta(item.consultantTaskStatus);
                  return (
                    <motion.div
                      key={item.id}
                      whileHover={{ y: -2 }}
                      className={cn(
                        'p-4 rounded-2xl border flex items-start gap-3',
                        isOverdue
                          ? 'border-red-400/70 bg-red-50'
                          : 'border-[var(--border)] bg-[var(--secondary)]/80',
                      )}
                    >
                      <div className="flex-1">
                        <h5
                          className={cn(
                            'font-semibold text-[var(--foreground)]',
                            item.completed && 'line-through opacity-50',
                          )}
                        >
                          {item.title}
                        </h5>
                        <p className="text-sm text-[var(--foreground)]/70 mt-1">
                          {item.projectName} • {item.weekLabel}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {consultantStatusMeta && (
                            <Badge variant={consultantStatusMeta.variant} size="sm">
                              {consultantStatusMeta.label}
                            </Badge>
                          )}
                          {item.completed && (
                            <Badge variant="success" size="sm">
                              Completed
                            </Badge>
                          )}
                          <Badge variant={isOverdue ? 'danger' : 'info'} size="sm">
                            {dueDate.toLocaleDateString()}
                          </Badge>
                          {isOverdue && (
                            <Badge variant="danger" size="sm">
                              Overdue
                            </Badge>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <GoogleCalendarPanel
            className="shadow-lg h-full"
            title="Google Calendar"
            description="Upcoming dates and deadlines"
          />
        </div>
      </main>
    </div>
  );
}
