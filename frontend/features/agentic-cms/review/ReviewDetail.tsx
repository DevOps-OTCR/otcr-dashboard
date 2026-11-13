import { useEffect, useState } from 'react';
import { ExternalLink, FileText, History, Presentation } from 'lucide-react';
import { FAILURES, LEVELS, SUBMISSION_KINDS } from './copy';
import { FEEDBACK_MODE, type SeverityFilter } from './feedback';
import { formatRelative, type QueueRow } from './queue';
import { StateBadge } from './ReviewBadges';
import { FeedbackList, FeedbackSummary, focusComment } from './ReviewFeedback';
import { ReviewStatusCard } from './ReviewStatusCard';
import type { Review } from './types';

const runLabel = (review: Review) => `${LEVELS[review.level].label} review of version ${review.submissionVersion}`;

/** Remount per submission (key it by submission id) so the viewed run and filters reset. */
export function ReviewDetail({ row, now }: { row: QueueRow; now: number }) {
  const { submission, current, history, earlierVersionReviewed } = row;
  const Icon = submission.format === 'slides' ? Presentation : FileText;
  // Which run's status and feedback are shown: the current one unless an earlier run is chosen.
  const [viewedId, setViewedId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<SeverityFilter>('ALL');
  // A new object per click, so jumping to the same comment twice scrolls again.
  const [jumpTarget, setJumpTarget] = useState<{ id: string } | null>(null);
  const viewed = history.find((review) => review.id === viewedId);
  const shown = viewed ?? current;
  const viewingEarlier = Boolean(viewed && viewed.id !== current?.id);

  const view = (id: string | null) => {
    setViewedId(id);
    setSeverity('ALL');
  };
  // A top issue may be hidden by the severity filter: clear it, then jump once rendered.
  const jump = (commentId: string) => {
    setSeverity('ALL');
    setJumpTarget({ id: commentId });
  };
  useEffect(() => {
    if (jumpTarget) focusComment(jumpTarget.id);
  }, [jumpTarget]);

  return (
    <article aria-labelledby="review-detail-title" className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-start gap-3">
          <Icon className="mt-1 h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <h3 id="review-detail-title" className="text-lg font-semibold leading-snug">{submission.deliverableTitle}</h3>
            <p className="text-sm text-[var(--text-muted)]">
              {SUBMISSION_KINDS[submission.kind]} · Version {submission.version} · {submission.workstreamLabel}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-[var(--text-muted)]">Submitted by</dt>
          <dd>{submission.submitterName}</dd>
          <dt className="text-[var(--text-muted)]">Submitted</dt>
          <dd>
            <time dateTime={submission.submittedAt} title={new Date(submission.submittedAt).toLocaleString()}>
              {formatRelative(submission.submittedAt, now)}
            </time>
          </dd>
          <dt className="text-[var(--text-muted)]">File</dt>
          <dd className="min-w-0">
            <a href={submission.fileUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 font-medium text-[var(--primary)] hover:underline">
              <span className="truncate">{submission.fileName}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </dd>
        </dl>
      </header>

      {viewed && viewingEarlier && (
        <div role="note" className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm">
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              Viewing an earlier run: {runLabel(viewed)}, {formatRelative(viewed.requestedAt, now)}.
              {viewed.submissionVersion !== submission.version && ` The current version is ${submission.version}, so this feedback may be out of date.`}
            </span>
          </span>
          <button type="button" onClick={() => view(null)} className="rounded border border-[var(--border)] px-3 py-1 font-medium">
            {current ? 'Back to current review' : 'Close'}
          </button>
        </div>
      )}

      {shown ? (
        <>
          <ReviewStatusCard review={shown} now={now} />
          {shown.status === 'COMPLETED' && (
            <>
              <FeedbackSummary review={shown} submission={submission} mode={FEEDBACK_MODE} onJump={jump} />
              {FEEDBACK_MODE === 'cms' && <FeedbackList review={shown} submission={submission} filter={severity} onFilter={setSeverity} />}
            </>
          )}
        </>
      ) : (
        <section aria-label="Review status" className="space-y-1 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-4 text-sm">
          <p className="font-semibold">Version {submission.version} hasn’t had an AI review yet.</p>
          {earlierVersionReviewed && history[0] && (
            <p className="text-[var(--text-muted)]">
              Version {history[0].submissionVersion} had a {LEVELS[history[0].level].label} review {formatRelative(history[0].requestedAt, now)}. That
              feedback may not apply to this version; open it from the review history below.
            </p>
          )}
        </section>
      )}

      {history.length > (current ? 1 : 0) && (
        <section aria-labelledby="review-history-title" className="space-y-2">
          <h4 id="review-history-title" className="text-sm font-semibold">Review history</h4>
          <ol className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
            {history.map((review) => {
              const isShown = review.id === shown?.id;
              return (
                <li key={review.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm ${isShown ? 'bg-[var(--surface-muted)]' : ''}`}>
                  <span className="min-w-0">
                    {LEVELS[review.level].label} · v{review.submissionVersion}
                    {review.retryOf && ' · retry'}
                    {review.id === current?.id && <span className="text-[var(--text-muted)]"> (current)</span>}
                    <span className="block text-xs text-[var(--text-muted)]">
                      {review.requestedBy} · {formatRelative(review.requestedAt, now)}
                      {review.failure && ` · ${FAILURES[review.failure.kind].title}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StateBadge state={review.status} />
                    {isShown ? (
                      <span className="text-xs text-[var(--text-muted)]">Showing</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => view(review.id === current?.id ? null : review.id)}
                        aria-label={`${review.status === 'COMPLETED' ? 'View feedback from' : 'View'} ${runLabel(review)}, ${formatRelative(review.requestedAt, now)}`}
                        className="rounded border border-[var(--border)] px-2 py-0.5 text-xs font-medium hover:bg-[var(--surface-muted)]"
                      >
                        {review.status === 'COMPLETED' ? 'View feedback' : 'View'}
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </article>
  );
}
