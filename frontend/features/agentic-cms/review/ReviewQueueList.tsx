import { FileText, Presentation } from 'lucide-react';
import { SUBMISSION_KINDS } from './copy';
import { FILTERS, formatRelative, type QueueFilter, type QueueRow } from './queue';
import { StateBadge } from './ReviewBadges';

type Props = {
  rows: QueueRow[];
  counts: Record<QueueFilter, number>;
  filter: QueueFilter;
  onFilter: (filter: QueueFilter) => void;
  selectedId: string;
  onSelect: (submissionId: string) => void;
  now: number;
};

export function ReviewQueueList({ rows, counts, filter, onFilter, selectedId, onSelect, now }: Props) {
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Filter by review status" className="flex flex-wrap gap-1.5">
        {FILTERS.map(({ id, label }) => (
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
            {label} <span className="tabular-nums">({counts[id]})</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--text-muted)]">
          No submissions match this filter.
        </p>
      ) : (
        <ul aria-label="Submissions" className="space-y-2">
          {rows.map(({ submission, current, state, earlierVersionReviewed }) => {
            const selected = submission.id === selectedId;
            const Icon = submission.format === 'slides' ? Presentation : FileText;
            return (
              <li key={submission.id}>
                <button
                  type="button"
                  onClick={() => onSelect(submission.id)}
                  aria-current={selected ? 'true' : undefined}
                  className={`w-full rounded-[var(--radius-md)] border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                    selected ? 'border-[var(--primary)] bg-[var(--surface-muted)]' : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--surface-muted)]'
                  }`}
                >
                  <span className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{submission.deliverableTitle}</span>
                      <span className="block text-xs text-[var(--text-muted)]">
                        {SUBMISSION_KINDS[submission.kind]} · v{submission.version} · {submission.submitterName} · {formatRelative(submission.submittedAt, now)}
                      </span>
                    </span>
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                    <StateBadge state={state} level={current?.level} />
                    {earlierVersionReviewed && <span className="text-xs text-[var(--text-muted)]">An earlier version was reviewed</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
