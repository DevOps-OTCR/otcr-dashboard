// MOCK. Simulates review jobs in the browser so the review workflow can be
// demonstrated before the review-job API, review skills and document comments
// exist. It makes no network requests, reads no files and calls no model.
//
// Status is derived from the time since a review was requested, so there are
// no timers to cancel: the UI polls list(), as it will against the real API.
// State lives in memory and resets when the page reloads.

import { FAILURES } from './copy';
import { DEMO_FEEDBACK, DEMO_SEED, DOC_ALL_NATIVE, demoSubmissions } from './mock-fixtures';
import { MAX_FOCUS_NOTE } from './types';
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
  PowerPointDemoResult,
} from './types';

export const QUEUE_MS = 2_000;
export const POSTING_RETRY_MS = 2_000;
export const STEP_MS: Record<ReviewLevel, number> = { BASIC: 1_200, ADVANCED: 1_800 };

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
  cmsFeedback?: boolean;
  powerPointResult?: PowerPointDemoResult;
  postingRetry?: { at: number; result: PowerPointDemoResult };
};

export type MockReviewClient = ReviewClient & {
  /** Demo control: make the next requested or retried review fail with this kind. */
  setNextFailure(projectId: string, kind: ReviewFailureKind | null): void;
  nextFailure(projectId: string): ReviewFailureKind | null;
  setNextPowerPointResult(projectId: string, result: PowerPointDemoResult | null): void;
  nextPowerPointResult(projectId: string): PowerPointDemoResult | null;
  retryPowerPointPosting(projectId: string, reviewId: string): Promise<Review>;
};

/** Stands in for the opaque revision id Group 3's document tooling will attach. */
export function mockRevisionId(submissionId: string, version: number): string {
  let hash = 5381;
  for (const char of `${submissionId}@${version}`) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  return `rev-${hash.toString(16).padStart(8, '0').slice(-7)}`;
}

type ProjectReviewClient = {
  list(): Promise<ReviewQueue>;
  request(input: RequestReviewInput): Promise<Review>;
  retry(reviewId: string): Promise<Review>;
  setNextFailure(kind: ReviewFailureKind | null): void;
  nextFailure(): ReviewFailureKind | null;
  setNextPowerPointResult(result: PowerPointDemoResult | null): void;
  nextPowerPointResult(): PowerPointDemoResult | null;
  retryPowerPointPosting(reviewId: string): Promise<Review>;
};

/** Seed one configured project; other projects start empty. */
export function createMockReviewClient(options: { now?: () => number; viewerName?: string; demoProjectId?: string } = {}): MockReviewClient {
  const projects = new Map<string, ProjectReviewClient>();
  const project = (projectId: string): ProjectReviewClient => {
    if (!projectId.trim()) throw new Error('Choose a project before reviewing submissions.');
    let client = projects.get(projectId);
    if (!client) {
      client = createProjectReviewClient({ ...options, projectId, populated: projectId === options.demoProjectId });
      projects.set(projectId, client);
    }
    return client;
  };
  return {
    mocked: true,
    list: (projectId) => project(projectId).list(),
    request: (input) => project(input.projectId).request(input),
    retry: (projectId, reviewId) => project(projectId).retry(reviewId),
    retryPowerPointPosting: (projectId, reviewId) => project(projectId).retryPowerPointPosting(reviewId),
    setNextFailure: (projectId, kind) => project(projectId).setNextFailure(kind),
    nextFailure: (projectId) => project(projectId).nextFailure(),
    setNextPowerPointResult: (projectId, result) => project(projectId).setNextPowerPointResult(result),
    nextPowerPointResult: (projectId) => project(projectId).nextPowerPointResult(),
  };
}

/** Each project owns its fixtures, runs and demo controls for the lifetime of the page. */
function createProjectReviewClient(options: { now?: () => number; viewerName?: string; projectId: string; populated: boolean }): ProjectReviewClient {
  const now = options.now ?? (() => Date.now());
  const viewerName = options.viewerName?.trim() || 'You';
  const createdAt = now();
  const submissions = options.populated ? demoSubmissions(createdAt) : [];
  const runs: Run[] = [];
  let counter = 0;
  let pendingFailure: ReviewFailureKind | null = null;
  let pendingPowerPointResult: PowerPointDemoResult | null = null;

  const newId = () => `${options.projectId}:demo-review-${++counter}`;
  const submissionById = (id: string) => submissions.find((s) => s.id === id);

  for (const seed of options.populated ? DEMO_SEED : []) {
    runs.push({
      id: newId(),
      submissionId: seed.submissionId,
      submissionVersion: seed.submissionVersion,
      level: seed.level,
      requestedBy: seed.requestedBy,
      requestedAt: createdAt - seed.agoMs,
      focusNote: seed.focusNote,
      failure: seed.failure,
      cmsFeedback: seed.cmsFeedback,
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
    const postingInProgress = Boolean(run.postingRetry && now() - run.postingRetry.at < POSTING_RETRY_MS);
    const deckResult = !postingInProgress && run.postingRetry ? run.postingRetry.result : run.powerPointResult ?? 'comments_live';
    const powerPoint: Review['powerPoint'] = submission.format === 'slides' && !run.cmsFeedback ? {
      outcome: deckResult === 'partial' ? 'comments_live' : deckResult,
      inspection: deckResult === 'direct_download' ? 'text_only' : 'visual',
      reviewedETag: `demo-etag-${run.id}`,
      postingInProgress,
    } : undefined;
    const revisionId = mockRevisionId(run.submissionId, run.submissionVersion);
    const sourceComments = feedback.comments.filter((comment) => powerPoint?.inspection !== 'text_only' || !comment.requiresVisual);
    const comments: ReviewComment[] = sourceComments.map((comment, index) => {
      const document = submission.format === 'document';
      const fallback = document && !DOC_ALL_NATIVE.includes(submission.id) && (index === 1 || index === sourceComments.length - 1);
      return {
        ...comment,
        id: `${run.id}-c${index + 1}`,
        level: run.level,
        revisionId,
        ...(document ? {
          placement: fallback ? 'fallback' as const : 'native' as const,
          fallbackReason: fallback ? (index === 1 ? 'ambiguous' as const : 'not-found' as const) : undefined,
        } : {}),
        ...(powerPoint ? {
          placement: deckResult === 'comments_live' || (deckResult === 'partial' && index < sourceComments.length - 2) ? 'native' as const : 'fallback' as const,
        } : {}),
      };
    });
    const counts: Record<Severity, number> = { BLOCKING: 0, MATERIAL: 0, MINOR: 0 };
    for (const comment of comments) counts[comment.severity] += 1;
    return {
      ...base,
      status: 'COMPLETED',
      startedAt: iso(QUEUE_MS),
      finishedAt: iso(doneAt),
      revisionId,
      summary: {
        overview: feedback.overview,
        counts,
        skipped: [...feedback.skipped],
        notCheckable: powerPoint?.inspection === 'text_only'
          ? ['Text-only review: visual layout, fonts, spacing and overflow were not assessed.']
          : [...feedback.notCheckable],
      },
      powerPoint,
      comments,
    };
  };

  const isActive = (run: Run) => {
    const status = toReview(run).status;
    return status === 'AWAITING' || status === 'IN_PROGRESS' || Boolean(toReview(run).powerPoint?.postingInProgress);
  };

  const start = (run: Pick<Run, 'submissionId' | 'submissionVersion' | 'level' | 'focusNote' | 'retryOf'>): Review => {
    const slides = submissionById(run.submissionId)?.format === 'slides';
    const firstRun = !runs.some((existing) => existing.submissionId === run.submissionId);
    const defaultResult = firstRun && run.submissionId === 'demo-sub-pptx-stale' ? 'stale'
      : firstRun && run.submissionId === 'demo-sub-pptx-locked' ? 'locked' : 'comments_live';
    const created: Run = {
      ...run, id: newId(), requestedBy: viewerName, requestedAt: now(), failure: pendingFailure ?? undefined,
      powerPointResult: slides ? pendingPowerPointResult ?? defaultResult : undefined,
    };
    pendingFailure = null;
    if (slides) pendingPowerPointResult = null;
    runs.push(created);
    return toReview(created);
  };

  return {
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
    setNextPowerPointResult(result) {
      pendingPowerPointResult = result;
    },
    nextPowerPointResult() {
      return pendingPowerPointResult;
    },
    async retryPowerPointPosting(reviewId) {
      const run = runs.find((item) => item.id === reviewId);
      const review = run && toReview(run);
      if (!run || !review?.powerPoint || review.status !== 'COMPLETED' || !['locked', 'error'].includes(review.powerPoint.outcome)) {
        throw new Error('Only a locked deck or posting error can retry posting.');
      }
      if (runs.some((item) => item.submissionId === run.submissionId && isActive(item))) {
        throw new Error('A review or comment posting is already running for this submission.');
      }
      run.postingRetry = { at: now(), result: pendingPowerPointResult ?? 'comments_live' };
      pendingPowerPointResult = null;
      return toReview(run);
    },
  };
}
