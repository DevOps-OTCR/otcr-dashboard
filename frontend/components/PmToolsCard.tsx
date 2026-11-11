'use client';

import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageLoading } from './PageLoading';
import type { PmProjectSummary } from '@/lib/pm-tools';

type PmToolsCardProps = {
  summaries: PmProjectSummary[];
  loading: boolean;
};

function formatNextDeadline(deadline: Date): string {
  const weekday = deadline.toLocaleDateString(undefined, { weekday: 'short' });
  const date = deadline.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = deadline.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${weekday}, ${date}, ${time}`;
}

export function PmToolsCard({ summaries, loading }: PmToolsCardProps) {
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-[var(--primary)]" />
          PM tools
        </CardTitle>
        <CardDescription>
          What needs your attention across the projects you manage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <PageLoading />
        ) : summaries.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--foreground)]/60">
            No projects to manage yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {summaries.map((project) => {
              const hasIssues =
                project.overdue > 0 || project.dueThisWeek > 0 || project.draftSprints > 0;

              return (
                <li
                  key={project.id}
                  className="p-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/80"
                >
                  <div className="font-semibold text-[var(--foreground)] break-words">
                    {project.name}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {!hasIssues ? (
                      <span className="text-sm text-[var(--foreground)]/60">All clear</span>
                    ) : (
                      <>
                        {project.overdue > 0 && (
                          <Badge variant="danger" size="sm">
                            {project.overdue} overdue
                          </Badge>
                        )}
                        {project.dueThisWeek > 0 && (
                          <Badge variant="warning" size="sm">
                            {project.dueThisWeek} due this week
                          </Badge>
                        )}
                        {project.draftSprints > 0 && (
                          <Badge variant="info" size="sm">
                            {project.draftSprints} unreleased sprint
                            {project.draftSprints === 1 ? '' : 's'}
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                  {project.nextDeadline && (
                    <p className="mt-2 text-sm text-[var(--foreground)]/70 break-words">
                      Next: {project.nextDeadline.title} ·{' '}
                      {formatNextDeadline(project.nextDeadline.deadline)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap gap-4 border-t border-[var(--border)] pt-4">
          <Link
            href="/workstream"
            className="text-sm font-medium text-[var(--primary)] hover:underline"
          >
            Release sprints in Workstream
          </Link>
          <Link
            href="/attendance"
            className="text-sm font-medium text-[var(--primary)] hover:underline"
          >
            Schedule an event
          </Link>
          <Link
            href="/when2meet"
            className="text-sm font-medium text-[var(--primary)] hover:underline"
          >
            Find a meeting time
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
