// Shapes shared by the AI review UI and its data client. The mock client
// implements them this week; the review-job API will return the same shapes.

export type ReviewLevel = 'BASIC' | 'ADVANCED';

export type ReviewStatus = 'AWAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

/** Why a review failed. Each kind has its own message and next step in copy.ts. */
export type ReviewFailureKind = 'file_access' | 'unsupported_file' | 'rate_limit' | 'model' | 'config';

/** Same scale as the skills' review-comment format (otcr-quality-standards §3). */
export type Severity = 'BLOCKING' | 'MATERIAL' | 'MINOR';

export type SubmissionKind = 'INITIAL_SLIDES' | 'FINAL_SLIDES' | 'INITIAL_WHITEPAPER' | 'FINAL_WHITEPAPER' | 'CUSTOM';

/** Slides are located by slide number; documents by section heading. */
export type SubmissionFormat = 'slides' | 'document';

export type ReviewSubmission = {
  id: string;
  deliverableId: string;
  deliverableTitle: string;
  kind: SubmissionKind;
  format: SubmissionFormat;
  version: number;
  fileName: string;
  fileUrl: string;
  submittedAt: string;
  submitterName: string;
  workstreamLabel: string;
};

export type ReviewLocation =
  | { type: 'slide'; slide: number; title?: string }
  | { type: 'section'; section: string }
  | { type: 'general' };

export type ReviewComment = {
  id: string;
  level: ReviewLevel;
  severity: Severity;
  location: ReviewLocation;
  /** What is wrong. */
  issue: string;
  /** Why it matters. */
  significance: string;
  /** At most one sentence; the reviewer never rewrites the file. */
  fix: string;
  /** The file revision this comment was written against. */
  revisionId: string;
};

export type ReviewSummary = {
  overview: string;
  counts: Record<Severity, number>;
  /** Hidden or confidential slides/sections the reviewer did not read, e.g. "Slide 11". */
  skipped: string[];
  notCheckable: string[];
};

export type ReviewProgress = { step: number; total: number; label: string };

export type Review = {
  id: string;
  submissionId: string;
  submissionVersion: number;
  level: ReviewLevel;
  status: ReviewStatus;
  requestedBy: string;
  requestedAt: string;
  startedAt?: string;
  finishedAt?: string;
  focusNote?: string;
  /** Set while IN_PROGRESS. */
  progress?: ReviewProgress;
  /** Set when FAILED. */
  failure?: { kind: ReviewFailureKind };
  /** The id of the failed run this one retries. */
  retryOf?: string;
  /** Set when COMPLETED. */
  revisionId?: string;
  summary?: ReviewSummary;
  comments: ReviewComment[];
};

export type ReviewQueue = { submissions: ReviewSubmission[]; reviews: Review[] };

export type RequestReviewInput = {
  projectId: string;
  submissionId: string;
  level: ReviewLevel;
  focusNote?: string;
};

export interface ReviewClient {
  /** True while reviews are simulated in the browser rather than run by the backend. */
  readonly mocked: boolean;
  list(projectId: string): Promise<ReviewQueue>;
  request(input: RequestReviewInput): Promise<Review>;
  retry(reviewId: string): Promise<Review>;
}
