// MOCK. Simulates review jobs in the browser so the review workflow can be
// demonstrated before the review-job API, review skills and document comments
// exist. It makes no network requests, reads no files and calls no model.
//
// Status is derived from the time since a review was requested, so there are
// no timers to cancel: the UI polls list(), as it will against the real API.
// State lives in memory and resets when the page reloads.

import { FAILURES } from './copy';
import { DEMO_FEEDBACK, DEMO_SEED, demoSubmissions } from './mock-fixtures';
import type {
  RequestReviewInput,
  Review,
  ReviewClient,
  ReviewComment,
  ReviewFailureKind,
  ReviewLevel,
  ReviewQueue,
  ReviewSubmission,
  Severity,
  SubmissionFormat,
} from './types';

export const QUEUE_MS = 2_000;
export const STEP_MS: Record<ReviewLevel, number> = { BASIC: 1_200, ADVANCED: 1_800 };
export const MAX_FOCUS_NOTE = 500;

export function reviewSteps(level: ReviewLevel, format: SubmissionFormat): string[] {
  const read = format === 'slides' ? 'Reading the slides' : 'Reading the document';
  return level === 'BASIC'
    ? ['Opening the file', read, 'Checking formatting and layout', 'Checking numbers and terminology', 'Writing feedback']
    : [
        'Opening the file',
        read,
        'Loading the project overview and SOW',
        'Checking the storyline',
        'Checking evidence and sources',
        'Checking alignment with the client and workstream',
        'Writing feedback',
      ];
}

/** When each failure happens: before the review starts, while opening the file, or near the end. */
const FAILS_AT: Record<ReviewFailureKind, 'queue' | 'open' | 'late'> = {
  config: 'queue',
  rate_limit: 'queue',
  file_access: 'open',
  unsupported_file: 'open',
  model: 'late',
};

type Run = {
  id: string;
  submissionId: string;
  submissionVersion: number;
  level: ReviewLevel;
  requestedBy: string;
  requestedAt: number;
  focusNote?: string;
  failure?: ReviewFailureKind;
  retryOf?: string;
};

export type MockReviewClient = ReviewClient & {
  /** Demo control: make the next requested or retried review fail with this kind. */
  setNextFailure(kind: ReviewFailureKind | null): void;
  nextFailure(): ReviewFailureKind | null;
};

/** Stands in for the opaque revision id Group 3's document tooling will attach. */
export function mockRevisionId(submissionId: string, version: number): string {
  let hash = 5381;
  for (const char of `${submissionId}@${version}`) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  return `rev-${hash.toString(16).padStart(8, '0').slice(-7)}`;
}

export function createMockReviewClient(options: { now?: () => number; viewerName?: string } = {}): MockReviewClient {
  const now = options.now ?? (() => Date.now());
  const viewerName = options.viewerName?.trim() || 'You';
  const createdAt = now();
  const submissions = demoSubmissions(createdAt);
  const runs: Run[] = [];
  let counter = 0;
  let pendingFailure: ReviewFailureKind | null = null;

  const newId = () => `demo-review-${++counter}`;
  const submissionById = (id: string) => submissions.find((s) => s.id === id);

  for (const seed of DEMO_SEED) {
    runs.push({
      id: newId(),
      submissionId: seed.submissionId,
      submissionVersion: seed.submissionVersion,
      level: seed.level,
      requestedBy: seed.requestedBy,
      requestedAt: createdAt - seed.agoMs,
      focusNote: seed.focusNote,
      failure: seed.failure,
    });
  }

  const toReview = (run: Run): Review => {
    const submission = submissionById(run.submissionId) as ReviewSubmission;
    const steps = reviewSteps(run.level, submission.format);
    const stepMs = STEP_MS[run.level];
    const doneAt = QUEUE_MS + stepMs * steps.length;
    const elapsed = now() - run.requestedAt;
    const iso = (offset: number) => new Date(run.requestedAt + offset).toISOString();
    const base: Review = {
      id: run.id,
      submissionId: run.submissionId,
      submissionVersion: run.submissionVersion,
      level: run.level,
      status: 'AWAITING',
      requestedBy: run.requestedBy,
      requestedAt: iso(0),
      focusNote: run.focusNote,
      retryOf: run.retryOf,
      comments: [],
    };

    if (run.failure) {
      const when = FAILS_AT[run.failure];
      const failAt = when === 'queue' ? QUEUE_MS : when === 'open' ? QUEUE_MS + stepMs : QUEUE_MS + stepMs * (steps.length - 1);
      if (elapsed >= failAt) {
        return {
          ...base,
          status: 'FAILED',
          startedAt: when === 'queue' ? undefined : iso(QUEUE_MS),
          finishedAt: iso(failAt),
          failure: { kind: run.failure },
        };
      }
    }
    if (elapsed < QUEUE_MS) return base;
    if (elapsed < doneAt) {
      const step = Math.min(steps.length, Math.floor((elapsed - QUEUE_MS) / stepMs) + 1);
      return { ...base, status: 'IN_PROGRESS', startedAt: iso(QUEUE_MS), progress: { step, total: steps.length, label: steps[step - 1] } };
    }

    const feedback = DEMO_FEEDBACK[submission.format][run.level];
    const revisionId = mockRevisionId(run.submissionId, run.submissionVersion);
    const comments: ReviewComment[] = feedback.comments.map((comment, index) => ({
      ...comment,
      id: `${run.id}-c${index + 1}`,
      level: run.level,
      revisionId,
    }));
    const counts: Record<Severity, number> = { BLOCKING: 0, MATERIAL: 0, MINOR: 0 };
    for (const comment of comments) counts[comment.severity] += 1;
    return {
      ...base,
      status: 'COMPLETED',
      startedAt: iso(QUEUE_MS),
      finishedAt: iso(doneAt),
      revisionId,
      summary: { overview: feedback.overview, counts, skipped: [...feedback.skipped], notCheckable: [...feedback.notCheckable] },
      comments,
    };
  };

  const isActive = (run: Run) => {
    const status = toReview(run).status;
    return status === 'AWAITING' || status === 'IN_PROGRESS';
  };

  const start = (run: Omit<Run, 'id' | 'requestedAt' | 'requestedBy' | 'failure'>): Review => {
    const created: Run = { ...run, id: newId(), requestedBy: viewerName, requestedAt: now(), failure: pendingFailure ?? undefined };
    pendingFailure = null;
    runs.push(created);
    return toReview(created);
  };

  return {
    mocked: true,

    async list(): Promise<ReviewQueue> {
      return {
        submissions: submissions.map((s) => ({ ...s })),
        reviews: runs.map(toReview).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
      };
    },

    async request(input: RequestReviewInput): Promise<Review> {
      const submission = submissionById(input.submissionId);
      if (!submission) throw new Error('This submission is no longer available.');
      if (input.level !== 'BASIC' && input.level !== 'ADVANCED') throw new Error('Choose Basic or Advanced review.');
      if (runs.some((run) => run.submissionId === submission.id && isActive(run))) {
        throw new Error('A review is already running for this submission.');
      }
      const focusNote = input.level === 'ADVANCED' ? input.focusNote?.trim() || undefined : undefined;
      if (focusNote && focusNote.length > MAX_FOCUS_NOTE) throw new Error(`Keep the focus note under ${MAX_FOCUS_NOTE} characters.`);
      return start({ submissionId: submission.id, submissionVersion: submission.version, level: input.level, focusNote });
    },

    async retry(reviewId: string): Promise<Review> {
      const run = runs.find((r) => r.id === reviewId);
      const review = run && toReview(run);
      if (!run || !review || review.status !== 'FAILED' || !review.failure) throw new Error('Only a failed review can be retried.');
      if (!FAILURES[review.failure.kind].retryable) throw new Error(FAILURES[review.failure.kind].nextStep);
      if (runs.some((r) => r.submissionId === run.submissionId && isActive(r))) {
        throw new Error('A review is already running for this submission.');
      }
      const submission = submissionById(run.submissionId) as ReviewSubmission;
      return start({ submissionId: run.submissionId, submissionVersion: submission.version, level: run.level, focusNote: run.focusNote, retryOf: run.id });
    },

    setNextFailure(kind) {
      pendingFailure = kind;
    },
    nextFailure() {
      return pendingFailure;
    },
  };
}
