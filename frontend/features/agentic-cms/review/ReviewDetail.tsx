import { ExternalLink, FileText, Presentation } from 'lucide-react';
import { FAILURES, LEVELS, SUBMISSION_KINDS } from './copy';
import { formatRelative, type QueueRow } from './queue';
import { StateBadge } from './ReviewBadges';
import { ReviewStatusCard } from './ReviewStatusCard';

export function ReviewDetail({ row, now }: { row: QueueRow; now: number }) {
  const { submission, current, history, earlierVersionReviewed } = row;
  const Icon = submission.format === 'slides' ? Presentation : FileText;
  const lastEarlier = history[0];

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

      {current ? (
        <ReviewStatusCard review={current} now={now} />
      ) : (
        <section aria-label="Review status" className="space-y-1 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-4 text-sm">
          <p className="font-semibold">Version {submission.version} hasn’t had an AI review yet.</p>
          {earlierVersionReviewed && lastEarlier && (
            <p className="text-[var(--text-muted)]">
              Version {lastEarlier.submissionVersion} had a {LEVELS[lastEarlier.level].label} review {formatRelative(lastEarlier.requestedAt, now)}. That
              feedback may not apply to this version.
            </p>
          )}
        </section>
      )}

      {history.length > (current ? 1 : 0) && (
        <section aria-labelledby="review-history-title" className="space-y-2">
          <h4 id="review-history-title" className="text-sm font-semibold">Review history</h4>
          <ol className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
            {history.map((review) => (
              <li key={review.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  {LEVELS[review.level].label} · v{review.submissionVersion}
                  {review.retryOf && ' · retry'}
                  {review.id === current?.id && <span className="text-[var(--text-muted)]"> (current)</span>}
                  <span className="block text-xs text-[var(--text-muted)]">
                    {review.requestedBy} · {formatRelative(review.requestedAt, now)}
                    {review.failure && ` · ${FAILURES[review.failure.kind].title}`}
                  </span>
                </span>
                <StateBadge state={review.status} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
