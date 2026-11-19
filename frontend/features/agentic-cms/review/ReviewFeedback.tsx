import { Badge } from '@/components/ui/Badge';
import { docFallbackCopy, SEVERITIES } from './copy';
import { countBySeverity, groupComments, locationLabel, SEVERITY_ORDER, topIssues, type SeverityFilter } from './feedback';
import type { Review, ReviewComment, ReviewSubmission, Severity } from './types';

const SEVERITY_VARIANT = { BLOCKING: 'danger', MATERIAL: 'warning', MINOR: 'default' } as const;

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge variant={SEVERITY_VARIANT[severity]} size="sm">
      {SEVERITIES[severity].label}
    </Badge>
  );
}

const commentDomId = (id: string) => `feedback-${id}`;

/**
 * Google Docs posting notes: why a comment isn't (or may not be) in the document, or that Google
 * attached a posted comment to different text than the quote. Deck comments carry no reason.
 */
function PlacementNote({ comment }: { comment: ReviewComment }) {
  const quote = comment.quote && <blockquote className="break-words border-l-2 border-[var(--border)] pl-3 text-[var(--text-muted)]">“{comment.quote}”</blockquote>;
  if (comment.placement === 'fallback' && comment.fallbackReason) {
    const copy = docFallbackCopy(comment.fallbackReason);
    return (
      <>
        {quote}
        <p className={copy.kind === 'uncertain' ? 'text-xs font-medium text-[var(--warning)]' : 'text-xs text-[var(--text-muted)]'}>
          {copy.kind === 'uncertain' ? 'May already be in the document: ' : 'Not added: '}
          {copy.explanation} {copy.nextStep}
        </p>
      </>
    );
  }
  if (comment.placement === 'native' && comment.anchorVerified === false) {
    return (
      <div className="space-y-1 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[var(--warning-bg)] p-2 text-xs text-[var(--warning)]">
        <p className="font-semibold">Added, but attached to different text than quoted.</p>
        {comment.quote && <p className="break-words">Quoted: “{comment.quote}”</p>}
        {comment.anchoredText && <p className="break-words">Attached to: “{comment.anchoredText}”</p>}
        <p>Check where this comment sits in the document and move it if needed.</p>
      </div>
    );
  }
  return null;
}

/** Scrolls to a comment card and moves focus to it, so keyboard users land there too. */
export function focusComment(id: string) {
  const target = document.getElementById(commentDomId(id));
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target?.focus({ preventScroll: true });
}

/** Summary and top issues for slide reviews; Docs use GoogleDocFeedback. */
export function FeedbackSummary({ review, submission, onJump }: { review: Review; submission: ReviewSubmission; onJump: (commentId: string) => void }) {
  const summary = review.summary;
  if (!summary) return null;
  const top = topIssues(review.comments);
  return (
    <section aria-labelledby="feedback-summary-title" className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
      <h4 id="feedback-summary-title" className="font-semibold">Summary</h4>
      <p className="text-sm leading-relaxed">{summary.overview}</p>

      <ul aria-label="Comments by severity" className="grid grid-cols-3 gap-2">
        {SEVERITY_ORDER.map((severity) => (
          <li key={severity} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)] p-2">
            <span className="block text-xl font-semibold tabular-nums">{summary.counts[severity]}</span>
            <span className="block text-xs font-semibold">{SEVERITIES[severity].label}</span>
            <span className="block text-xs text-[var(--text-muted)]">{SEVERITIES[severity].action}</span>
          </li>
        ))}
      </ul>

      {top.length > 0 && (
        <div className="space-y-1">
          <h5 className="text-sm font-semibold">Top issues</h5>
          <ol className="space-y-1 text-sm">
            {top.map((comment) => (
              <li key={comment.id} className="flex items-start gap-2">
                <SeverityBadge severity={comment.severity} />
                <button type="button" onClick={() => onJump(comment.id)} className="min-w-0 text-left hover:underline">
                  <span className="text-[var(--text-muted)]">{locationLabel(comment.location, submission.format)}:</span> {comment.issue}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {summary.skipped.length > 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          <span className="font-semibold">Not read (hidden or confidential):</span> {summary.skipped.join(', ')}
        </p>
      )}
      {summary.notCheckable.length > 0 && (
        <div className="text-sm text-[var(--text-muted)]">
          <p className="font-semibold">Not checkable from this file</p>
          <ul className="list-disc pl-5">
            {summary.notCheckable.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Every comment, grouped by the slide or section it applies to. */
export function FeedbackList({ review, submission, filter, onFilter }: {
  review: Review;
  submission: ReviewSubmission;
  filter: SeverityFilter;
  onFilter: (filter: SeverityFilter) => void;
}) {
  const counts = countBySeverity(review.comments);
  const groups = groupComments(review.comments, submission.format, filter);
  const filters: SeverityFilter[] = ['ALL', ...SEVERITY_ORDER];

  return (
    <section aria-labelledby="feedback-list-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id="feedback-list-title" className="font-semibold">Feedback ({review.comments.length})</h4>
        <div role="group" aria-label="Filter feedback by severity" className="flex flex-wrap gap-1.5">
          {filters.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => onFilter(id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === id
                  ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]'
              }`}
            >
              {id === 'ALL' ? 'All' : SEVERITIES[id].label} <span className="tabular-nums">({counts[id]})</span>
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No {filter === 'ALL' ? '' : `${SEVERITIES[filter as Severity].label.toLowerCase()} `}comments.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-labelledby={`group-${review.id}-${group.key}`} className="space-y-2">
            <h5 id={`group-${review.id}-${group.key}`} className="text-sm font-semibold text-[var(--text-muted)]">{group.label}</h5>
            {group.comments.map((comment) => (
              <article
                key={comment.id}
                id={commentDomId(comment.id)}
                tabIndex={-1}
                aria-label={`${SEVERITIES[comment.severity].label}: ${comment.issue}`}
                className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={comment.severity} />
                  <span className="text-xs text-[var(--text-muted)]">{SEVERITIES[comment.severity].action}</span>
                </div>
                <PlacementNote comment={comment} />
                <p className="font-medium">{comment.issue}</p>
                <dl className="space-y-1">
                  <div>
                    <dt className="inline font-semibold">Why it matters: </dt>
                    <dd className="inline">{comment.significance}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">Suggested fix: </dt>
                    <dd className="inline">{comment.fix}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>
        ))
      )}
    </section>
  );
}
