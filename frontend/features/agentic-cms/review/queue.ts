import type { Review, ReviewQueue, ReviewStatus, ReviewSubmission } from './types';

/** A submission's review state: one of the four statuses, or never reviewed. */
export type QueueState = ReviewStatus | 'NOT_REVIEWED';

export type QueueFilter = 'ALL' | QueueState;

export type QueueRow = {
  submission: ReviewSubmission;
  /** The newest review of the submission's current version. */
  current?: Review;
  /** Every review of this submission, newest first, including earlier versions. */
  history: Review[];
  /** An earlier version was reviewed, but the current one has not been. */
  earlierVersionReviewed: boolean;
  state: QueueState;
};

export const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'NOT_REVIEWED', label: 'Not reviewed' },
  { id: 'AWAITING', label: 'Awaiting review' },
  { id: 'IN_PROGRESS', label: 'In progress' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'FAILED', label: 'Failed' },
];

// Work that needs the PM's attention first: failures, then running reviews.
const ORDER: Record<QueueState, number> = { FAILED: 0, IN_PROGRESS: 1, AWAITING: 2, NOT_REVIEWED: 3, COMPLETED: 4 };

export function isActive(state: QueueState | undefined): boolean {
  return state === 'AWAITING' || state === 'IN_PROGRESS';
}

export function buildQueue({ submissions, reviews }: ReviewQueue): QueueRow[] {
  const rows = submissions.map((submission): QueueRow => {
    const history = reviews
      .filter((review) => review.submissionId === submission.id)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    const current = history.find((review) => review.submissionVersion === submission.version);
    return {
      submission,
      current,
      history,
      earlierVersionReviewed: !current && history.length > 0,
      state: current?.status ?? 'NOT_REVIEWED',
    };
  });
  return rows.sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.submission.submittedAt.localeCompare(a.submission.submittedAt));
}

export function filterRows(rows: QueueRow[], filter: QueueFilter): QueueRow[] {
  return filter === 'ALL' ? rows : rows.filter((row) => row.state === filter);
}

export function countByFilter(rows: QueueRow[]): Record<QueueFilter, number> {
  const counts: Record<QueueFilter, number> = { ALL: rows.length, NOT_REVIEWED: 0, AWAITING: 0, IN_PROGRESS: 0, COMPLETED: 0, FAILED: 0 };
  for (const row of rows) counts[row.state] += 1;
  return counts;
}

export function formatRelative(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function formatDuration(fromIso: string, toIso: string): string {
  const seconds = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}
