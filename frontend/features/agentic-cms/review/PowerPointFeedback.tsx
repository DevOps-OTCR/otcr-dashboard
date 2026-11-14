import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { POWERPOINT_RESULTS } from './copy';
import type { SeverityFilter } from './feedback';
import { FeedbackList } from './ReviewFeedback';
import type { Review, ReviewSubmission } from './types';

/** Displays mock deck-level posting outcomes; never reads, edits or uploads a file. */
export function PowerPointFeedback({ review, submission, mocked, canRetry, onRetryPosting, filter, onFilter }: {
  review: Review;
  submission: ReviewSubmission;
  mocked: boolean;
  canRetry: boolean;
  onRetryPosting: (id: string) => Promise<void>;
  filter: SeverityFilter;
  onFilter: (filter: SeverityFilter) => void;
}) {
  const [error, setError] = useState('');
  const [startingRetry, setStartingRetry] = useState(false);
  const result = review.powerPoint;
  if (!result) return null;
  const unposted = review.comments.filter((comment) => comment.placement !== 'native');
  const posted = review.comments.length - unposted.length;
  const copy = POWERPOINT_RESULTS[result.outcome === 'comments_live' && unposted.length ? 'partial' : result.outcome];
  const busy = startingRetry || result.postingInProgress;
  const retryPosting = async () => {
    setError('');
    setStartingRetry(true);
    try { await onRetryPosting(review.id); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not retry posting. Try again.'); }
    finally { setStartingRetry(false); }
  };
  const buttonClass = 'inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)]';

  return (
    <section aria-label="Summary" className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
      <h4 className="font-semibold">Summary</h4>
      <p className="text-sm leading-relaxed">{review.summary?.overview}</p>
      <div className="space-y-1 text-sm" role="status">
        <p className="font-semibold">{mocked && 'Demo result: '}{busy ? 'Posting comments…' : copy.title}</p>
        {!busy && <p>{posted} comments added to PowerPoint.{unposted.length > 0 && ` ${unposted.length} available in CMS.`}</p>}
        <p>{copy.nextStep}</p>
      </div>
      {mocked ? (
        <button type="button" disabled className={`${buttonClass} cursor-not-allowed opacity-60`}>
          Open in PowerPoint <ExternalLink className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <a href={submission.fileUrl} target="_blank" rel="noreferrer" className={buttonClass}>
          Open in PowerPoint <ExternalLink className="h-4 w-4" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
      {unposted.length > 0 && (
        <details key={review.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">Comments not added to PowerPoint ({unposted.length})</summary>
          <div className="mt-3 space-y-3">
            {result.outcome === 'stale' && <p className="text-sm font-medium">Feedback from an earlier deck snapshot; it may not match the latest version.</p>}
            <FeedbackList review={{ ...review, comments: unposted }} submission={submission} filter={filter} onFilter={onFilter} />
          </div>
        </details>
      )}
      {canRetry && ['locked', 'error'].includes(result.outcome) && (
        <button type="button" disabled={busy} onClick={() => void retryPosting()} className="rounded border border-[var(--border)] px-3 py-2 text-sm font-medium disabled:opacity-60">
          {busy ? 'Posting comments…' : 'Retry posting comments'}
        </button>
      )}
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      <p className="text-xs text-[var(--text-muted)]">
        Simulated coverage: {result.inspection === 'visual' ? 'slide text and visual layout.' : 'text only; visual layout was not assessed.'}
      </p>
      <p className="break-all text-xs text-[var(--text-muted)]">Reviewed snapshot: <code>{result.reviewedETag}</code></p>
      {review.summary?.skipped.length ? <p className="text-xs text-[var(--text-muted)]">Not read (hidden or confidential): {review.summary.skipped.join(', ')}</p> : null}
      {review.summary?.notCheckable.map((note) => <p key={note} className="text-xs text-[var(--text-muted)]">{note}</p>)}
      {mocked && <p className="text-xs text-[var(--text-muted)]">Demo only: no real deck is linked, changed or uploaded. Comments and posting retries are simulated.</p>}
      <p className="text-xs text-[var(--text-muted)]">Review is complete; final approval remains with your LC or PM.</p>
    </section>
  );
}
