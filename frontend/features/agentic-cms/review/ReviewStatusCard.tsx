import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { FAILURES, LEVELS, SEVERITIES, STATUSES } from './copy';
import { formatDuration, formatRelative } from './queue';
import { LevelBadge } from './ReviewBadges';
import type { Review, Severity } from './types';

const STEPS = ['AWAITING', 'IN_PROGRESS', 'DONE'] as const;

function stepIndex(review: Review): number {
  return review.status === 'AWAITING' ? 0 : review.status === 'IN_PROGRESS' ? 1 : 2;
}

/** Awaiting review → In progress → Completed or Failed. */
function Stepper({ review }: { review: Review }) {
  const current = stepIndex(review);
  const failed = review.status === 'FAILED';
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Review progress">
      {STEPS.map((step, index) => {
        const label = step === 'DONE' ? (failed ? STATUSES.FAILED.label : STATUSES.COMPLETED.label) : STATUSES[step].label;
        const done = index < current || (index === current && review.status === 'COMPLETED');
        const isCurrent = index === current;
        const tone = isCurrent && failed
          ? 'border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]'
          : done
            ? 'border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]'
            : isCurrent
              ? 'border-[var(--primary)] text-[var(--primary)]'
              : 'border-[var(--border)] text-[var(--text-muted)]';
        return (
          <li key={step} className="flex min-w-0 flex-1 items-center gap-2" aria-current={isCurrent ? 'step' : undefined}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${tone}`} aria-hidden>
              {isCurrent && failed ? <X className="h-3.5 w-3.5" /> : done ? <Check className="h-3.5 w-3.5" /> : isCurrent && step === 'IN_PROGRESS' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : index + 1}
            </span>
            <span className={`truncate ${isCurrent ? 'font-semibold text-[var(--foreground)]' : 'text-[var(--text-muted)]'}`}>{label}</span>
            {index < STEPS.length - 1 && <span className="hidden h-px flex-1 bg-[var(--border)] sm:block" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

export function ReviewStatusCard({ review, now }: { review: Review; now: number }) {
  const failure = review.failure && FAILURES[review.failure.kind];
  const counts = review.summary?.counts;
  return (
    <section aria-label="Review status" className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LevelBadge level={review.level} />
        <span className="text-xs text-[var(--text-muted)]">
          Requested by {review.requestedBy} · {formatRelative(review.requestedAt, now)}
        </span>
      </div>

      <Stepper review={review} />

      <div role="status" aria-live="polite" className="text-sm">
        <span className="font-semibold">{STATUSES[review.status].label}.</span>{' '}
        {review.status === 'IN_PROGRESS' && review.progress
          ? `${review.progress.label} (step ${review.progress.step} of ${review.progress.total}).`
          : review.status === 'COMPLETED' && review.finishedAt
            ? `Finished ${formatRelative(review.finishedAt, now)}${review.startedAt ? ` in ${formatDuration(review.startedAt, review.finishedAt)}` : ''}.`
            : review.status === 'AWAITING'
              ? `${STATUSES.AWAITING.description} ${LEVELS[review.level].label} reviews take ${LEVELS[review.level].estimate.toLowerCase()}.`
              : null}
      </div>

      {review.status === 'IN_PROGRESS' && review.progress && (
        <div
          role="progressbar"
          aria-label="Review progress"
          aria-valuemin={0}
          aria-valuemax={review.progress.total}
          aria-valuenow={review.progress.step - 1}
          className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"
        >
          <div className="h-full bg-[var(--primary)] transition-[width] duration-500" style={{ width: `${((review.progress.step - 1) / review.progress.total) * 100}%` }} />
        </div>
      )}

      {failure && (
        <div className="flex gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{failure.title}</p>
            <p>
              <span className="font-semibold">Next step:</span> {failure.nextStep}
            </p>
          </div>
        </div>
      )}

      {counts && (
        <p className="text-sm text-[var(--text-muted)]">
          {(Object.keys(SEVERITIES) as Severity[]).map((severity) => `${counts[severity]} ${SEVERITIES[severity].label}`).join(' · ')}
          {review.revisionId && <> · reviewed revision <code className="text-xs">{review.revisionId}</code></>}
        </p>
      )}

      {review.focusNote && (
        <p className="text-sm">
          <span className="text-[var(--text-muted)]">Focus requested:</span> {review.focusNote}
        </p>
      )}
    </section>
  );
}
