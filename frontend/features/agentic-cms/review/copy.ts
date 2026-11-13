import type { ReviewFailureKind, ReviewLevel, ReviewStatus, Severity, SubmissionKind } from './types';

export const LEVELS: Record<ReviewLevel, { label: string; tagline: string; checks: string; estimate: string }> = {
  BASIC: {
    label: 'Basic',
    tagline: 'Formatting and consistency',
    checks: 'Layout and fonts, action titles, source lines, numbers that differ between slides or sections, terminology and typos.',
    estimate: 'About 1–2 minutes',
  },
  ADVANCED: {
    label: 'Advanced',
    tagline: 'Content, evidence and alignment',
    checks: 'Storyline, quality of evidence, whether recommendations are supported, and alignment with the client, SOW and workstream.',
    estimate: 'About 5–8 minutes',
  },
};

export const STATUSES: Record<ReviewStatus, { label: string; description: string }> = {
  AWAITING: { label: 'Awaiting review', description: 'Queued. The review starts shortly.' },
  IN_PROGRESS: { label: 'In progress', description: 'The reviewer is reading the submission.' },
  COMPLETED: { label: 'Completed', description: 'Feedback is ready.' },
  FAILED: { label: 'Failed', description: 'The review did not finish.' },
};

/** Shown for a submission that has never been reviewed. */
export const NOT_REVIEWED = 'Not reviewed';

export const FAILURES: Record<ReviewFailureKind, { title: string; nextStep: string; retryable: boolean }> = {
  file_access: {
    title: 'We couldn’t open this file.',
    nextStep: 'Check that the SharePoint or OneDrive link is shared with OTCR, then retry.',
    retryable: true,
  },
  unsupported_file: {
    title: 'Only PowerPoint and Word files can be reviewed.',
    nextStep: 'Ask the consultant to resubmit a PowerPoint or Word link, then request a new review.',
    retryable: false,
  },
  rate_limit: {
    title: 'The reviewer is busy right now.',
    nextStep: 'Retry in a few minutes. Nothing was lost.',
    retryable: true,
  },
  model: {
    title: 'The review timed out before it finished.',
    nextStep: 'Retry. If it fails again, try a Basic review or contact the Agentic CMS team.',
    retryable: true,
  },
  config: {
    title: 'AI review isn’t set up on this server.',
    nextStep: 'Contact an Agentic CMS admin. Retrying won’t help until it is fixed.',
    retryable: false,
  },
};

export const SEVERITIES: Record<Severity, { label: string; action: string }> = {
  BLOCKING: { label: 'Blocking', action: 'Must fix before submission' },
  MATERIAL: { label: 'Material', action: 'Should fix before client delivery' },
  MINOR: { label: 'Minor', action: 'Fix if time allows' },
};

export const SUBMISSION_KINDS: Record<SubmissionKind, string> = {
  INITIAL_SLIDES: 'Initial slides',
  FINAL_SLIDES: 'Final slides',
  INITIAL_WHITEPAPER: 'Initial whitepaper',
  FINAL_WHITEPAPER: 'Final whitepaper',
  CUSTOM: 'Submission',
};
