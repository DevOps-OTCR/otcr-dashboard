import type { PowerPointDemoResult, ReviewFailureKind, ReviewLevel, ReviewStatus, Severity, SubmissionKind } from './types';

export const POWERPOINT_RESULTS: Record<PowerPointDemoResult, { label: string; title: string; nextStep: string }> = {
  comments_live: { label: 'All comments added', title: 'Comments added to PowerPoint.', nextStep: 'Read the feedback in the presentation.' },
  partial: { label: 'Some comments not added', title: 'Some comments couldn’t be added.', nextStep: 'Read the posted comments in PowerPoint and the remaining feedback below.' },
  stale: { label: 'Deck changed during review', title: 'The deck changed during review.', nextStep: 'These findings refer to an earlier snapshot. Review the latest version before applying them.' },
  locked: { label: 'Deck locked for editing', title: 'The deck is locked for editing.', nextStep: 'Close the deck in other editing sessions, wait 1–2 minutes, then retry posting. Your findings are kept below.' },
  legacy_format: { label: 'Older comment format', title: 'This deck uses an older comment format.', nextStep: 'Native comments weren’t added. Use the slide feedback below or submit a compatible deck.' },
  direct_download: { label: 'Direct download link (text only)', title: 'This link doesn’t support writing comments back.', nextStep: 'Use the feedback below. A OneDrive or SharePoint share link is needed to add native comments.' },
  error: { label: 'Comment upload error', title: 'Comments couldn’t be uploaded.', nextStep: 'Your review findings are kept below. Try posting again.' },
  no_comments_written: { label: 'No matching slide references', title: 'No comments were added.', nextStep: 'The slide references didn’t match the deck. Request another review or use the findings below.' },
};

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
