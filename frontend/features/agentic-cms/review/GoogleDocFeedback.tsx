import { ExternalLink } from 'lucide-react';
import type { SeverityFilter } from './feedback';
import { FeedbackList } from './ReviewFeedback';
import type { Review, ReviewSubmission } from './types';

/** Presentation of simulated Google Docs comments. This component never posts comments. */
export function GoogleDocFeedback({ review, submission, mocked, filter, onFilter }: {
  review: Review;
  submission: ReviewSubmission;
  mocked: boolean;
  filter: SeverityFilter;
  onFilter: (filter: SeverityFilter) => void;
}) {
  const unposted = review.comments.filter((comment) => comment.placement !== 'native');
  const posted = review.comments.length - unposted.length;
  const buttonClass = 'inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)]';

  return (
    <section aria-label="Summary" className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
      <h4 className="font-semibold">Summary</h4>
      <p className="text-sm leading-relaxed">{review.summary?.overview}</p>
      <p className="text-sm font-medium">
        {mocked && 'Demo result: '}{posted} {posted === 1 ? 'comment' : 'comments'} added to Google Docs.
        {unposted.length > 0 && ` ${unposted.length} couldn’t be added; view them below.`}
      </p>
      {mocked ? (
        <button type="button" disabled className={`${buttonClass} cursor-not-allowed opacity-60`}>
          Open in Google Docs <ExternalLink className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <a href={submission.fileUrl} target="_blank" rel="noreferrer" className={buttonClass}>
          Open in Google Docs <ExternalLink className="h-4 w-4" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
      {unposted.length > 0 && (
        <details key={review.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">Comments not added to Google Docs ({unposted.length})</summary>
          <div className="mt-3 space-y-3">
            <p className="text-sm text-[var(--text-muted)]">The review finished. These comments are available here because they couldn’t be attached to the document.</p>
            <FeedbackList review={{ ...review, comments: unposted }} submission={submission} filter={filter} onFilter={onFilter} />
          </div>
        </details>
      )}
      {mocked && <p className="text-xs text-[var(--text-muted)]">Demo only: no real document is linked and no comments were posted.</p>}
      <p className="text-xs text-[var(--text-muted)]">AI review is complete. Final approval remains with your LC or PM.</p>
      {review.summary && (review.summary.skipped.length > 0 || review.summary.notCheckable.length > 0) && (
        <div className="space-y-1 text-xs text-[var(--text-muted)]">
          {review.summary.skipped.length > 0 && <p>Not read (hidden or confidential): {review.summary.skipped.join(', ')}</p>}
          {review.summary.notCheckable.map((note) => <p key={note}>{note}</p>)}
        </div>
      )}
    </section>
  );
}
