import type { DocFallbackReason, GoogleDocsDemoResult, PowerPointDemoResult, ReviewFailureKind, ReviewLevel, ReviewStatus, Severity, SubmissionKind } from './types';

export type PowerPointResultCopy = {
  label: string;
  title: string;
  nextStep: string;
  /** Which comments are in the deck: 'unknown' when an upload was not confirmed either way. */
  inDeck: 'all' | 'some' | 'none' | 'unknown';
  /** 'check_first': the earlier write may have succeeded, so retry only after checking the deck. */
  retry: 'none' | 'retry' | 'check_first';
};

export const POWERPOINT_RESULTS: Record<PowerPointDemoResult, PowerPointResultCopy> = {
  comments_live: { label: 'All comments added', title: 'Comments added to PowerPoint.', nextStep: 'Read the feedback in the presentation.', inDeck: 'all', retry: 'none' },
  partial: { label: 'Some comments not added', title: 'Some comments couldn’t be added.', nextStep: 'Read the posted comments in PowerPoint and the remaining feedback below.', inDeck: 'some', retry: 'none' },
  stale: { label: 'Deck changed during review', title: 'The deck changed during review.', nextStep: 'These findings refer to an earlier snapshot. Review the latest version before applying them.', inDeck: 'none', retry: 'none' },
  locked: { label: 'Deck locked for editing', title: 'The deck is locked for editing.', nextStep: 'Close the deck in other editing sessions, wait 1–2 minutes, then retry posting. Your findings are kept below.', inDeck: 'none', retry: 'retry' },
  invalid_anchor: {
    label: 'Slide or shape no longer in the deck',
    title: 'A slide or shape these comments point to is no longer in the deck.',
    nextStep: 'No comments were posted. Review the latest version so the comments point to slides that exist; the findings are kept below.',
    inDeck: 'none',
    retry: 'none',
  },
  unsupported_format: {
    label: 'Unsupported comment format',
    title: 'This deck has comments in an older or unsupported format.',
    nextStep: 'Nothing in the deck was changed and no comments were posted. Apply the findings below by hand.',
    inDeck: 'none',
    retry: 'none',
  },
  already_posted: {
    label: 'Comments already in the deck',
    title: 'These comments are already in the deck.',
    nextStep: 'No duplicates were added. Open the deck to read them.',
    inDeck: 'all',
    retry: 'none',
  },
  error: {
    label: 'Upload not confirmed',
    title: 'We couldn’t confirm whether the comments were saved.',
    nextStep: 'Open the deck and look for the comments first. Retry posting only if they aren’t there, so they aren’t added twice.',
    inDeck: 'unknown',
    retry: 'check_first',
  },
};

const UNKNOWN_POWERPOINT_RESULT: PowerPointResultCopy = {
  label: 'Unrecognized result',
  title: 'Comment posting returned a result this page doesn’t recognize.',
  nextStep: 'Open the deck to check which comments were added, and use the findings below for any that are missing.',
  inDeck: 'unknown',
  retry: 'none',
};

/** Never undefined: an outcome added on the server later gets cautious generic copy. */
export function powerPointResultCopy(outcome: string): PowerPointResultCopy {
  return Object.prototype.hasOwnProperty.call(POWERPOINT_RESULTS, outcome) ? POWERPOINT_RESULTS[outcome as PowerPointDemoResult] : UNKNOWN_POWERPOINT_RESULT;
}

export type DocFallbackCopy = {
  /** 'uncertain': Google may already have saved the comment, so it must not be re-added blindly. */
  kind: 'not_added' | 'uncertain';
  explanation: string;
  nextStep: string;
};

// The first two keep the wording Stefan's demo and tests already use.
export const DOC_FALLBACKS: Record<DocFallbackReason, DocFallbackCopy> = {
  ambiguous: { kind: 'not_added', explanation: 'this passage appears more than once, so the comment could not be attached reliably.', nextStep: 'Add it by hand at the right place.' },
  'not-found': { kind: 'not_added', explanation: 'the quoted passage could not be found in the document.', nextStep: 'Add it by hand next to the passage it refers to.' },
  'no-comment-access': {
    kind: 'not_added',
    explanation: 'the review bot can view this document but not comment on it.',
    nextStep: 'Ask the owner to share it with the review bot as Commenter, then request another review, or add the comment by hand.',
  },
  'document-changed': {
    kind: 'not_added',
    explanation: 'the document changed while comments were being added.',
    nextStep: 'Check that it still applies to the latest version, or request another review.',
  },
  'comment-failed': { kind: 'not_added', explanation: 'it wasn’t posted to Google Docs.', nextStep: 'Add it by hand, or request another review to post it.' },
  'comment-uncertain': {
    kind: 'uncertain',
    explanation: 'Google may already have saved this comment, but didn’t confirm it.',
    nextStep: 'Check the document before adding it again, so it isn’t duplicated.',
  },
};

const UNKNOWN_DOC_FALLBACK: DocFallbackCopy = {
  kind: 'uncertain',
  explanation: 'Google Docs returned a result this page doesn’t recognize.',
  nextStep: 'Check the document before adding this comment by hand.',
};

/** Never undefined; an unrecognized reason is treated as uncertain so nothing is re-added blindly. */
export function docFallbackCopy(reason: string | undefined): DocFallbackCopy {
  return reason && Object.prototype.hasOwnProperty.call(DOC_FALLBACKS, reason) ? DOC_FALLBACKS[reason as DocFallbackReason] : UNKNOWN_DOC_FALLBACK;
}

/** Demo controls for simulated Google Docs posting; each mirrors how #198 ends a batch. */
export const GOOGLE_DOCS_RESULTS: Record<GoogleDocsDemoResult, string> = {
  all_native: 'All comments added',
  mixed: 'Two quotes not found or repeated',
  misplaced: 'One comment attached to different text',
  uncertain: 'One save unconfirmed, rest not attempted',
  document_changed: 'Document changed during posting',
  no_access: 'Bot has view-only access',
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
