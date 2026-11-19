import { ExternalLink } from 'lucide-react';
import { docFallbackCopy } from './copy';
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
  // Uncertain saves may already be in the document, so they are never counted as "couldn't be added".
  const fallbacks = review.comments.filter((comment) => comment.placement !== 'native');
  const uncertain = fallbacks.filter((comment) => docFallbackCopy(comment.fallbackReason).kind === 'uncertain').length;
  const notAdded = fallbacks.length - uncertain;
  const misplaced = review.comments.filter((comment) => comment.placement === 'native' && comment.anchorVerified === false).length;
  const posted = review.comments.length - fallbacks.length;
  const toCheck = review.comments.filter((comment) => comment.placement !== 'native' || comment.anchorVerified === false);
  const onlyNotAdded = uncertain === 0 && misplaced === 0;
  const buttonClass = 'inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)]';

  return (
    <section aria-label="Summary" className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
      <h4 className="font-semibold">Summary</h4>
      <p className="text-sm leading-relaxed">{review.summary?.overview}</p>
      <p className="text-sm font-medium">
        {mocked && 'Demo result: '}{posted} {posted === 1 ? 'comment' : 'comments'} added to Google Docs.
        {misplaced > 0 && ` ${misplaced} ${misplaced === 1 ? 'is' : 'are'} attached to different text; check where ${misplaced === 1 ? 'it sits' : 'they sit'}.`}
        {uncertain > 0 && ` ${uncertain} may already be in the document; check before adding ${uncertain === 1 ? 'it' : 'them'} again.`}
        {notAdded > 0 && ` ${notAdded} couldn’t be added; view them below.`}
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
      {toCheck.length > 0 && (
        <details key={review.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            {onlyNotAdded ? `Comments not added to Google Docs (${toCheck.length})` : `Comments to check in Google Docs (${toCheck.length})`}
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-sm text-[var(--text-muted)]">
              {onlyNotAdded
                ? 'The review finished. These comments are available here because they couldn’t be attached to the document.'
                : 'The review finished. Check each of these against the document before adding anything by hand, so no comment is duplicated.'}
            </p>
            <FeedbackList review={{ ...review, comments: toCheck }} submission={submission} filter={filter} onFilter={onFilter} />
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
