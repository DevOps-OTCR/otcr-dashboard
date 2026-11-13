import type { ReviewComment, ReviewLocation, Severity, SubmissionFormat } from './types';

/**
 * Where detailed feedback is shown. 'cms' lists every comment on this page.
 * 'native' is for when comments are posted into the PowerPoint/Word file itself:
 * the CMS then shows only status and the summary, and links to the file.
 * The decision is pending (Week 2 LC report §5 item 3), so the demo uses 'cms'.
 */
export type FeedbackMode = 'cms' | 'native';
export const FEEDBACK_MODE: FeedbackMode = 'cms';

export const SEVERITY_ORDER: Severity[] = ['BLOCKING', 'MATERIAL', 'MINOR'];
const rank = (severity: Severity) => SEVERITY_ORDER.indexOf(severity);

export type SeverityFilter = 'ALL' | Severity;

export type CommentGroup = { key: string; label: string; comments: ReviewComment[] };

export function locationKey(location: ReviewLocation): string {
  return location.type === 'slide' ? `slide:${location.slide}` : location.type === 'section' ? `section:${location.section}` : 'general';
}

export function locationLabel(location: ReviewLocation, format: SubmissionFormat): string {
  if (location.type === 'slide') return location.title ? `Slide ${location.slide} · ${location.title}` : `Slide ${location.slide}`;
  if (location.type === 'section') return location.section;
  return format === 'slides' ? 'Whole deck' : 'Whole document';
}

/**
 * Groups comments by where they apply. Slides are in slide order and sections in
 * the order the reviewer first mentions them; whole-file comments come last.
 * Within a group, the most severe comments come first.
 */
export function groupComments(comments: ReviewComment[], format: SubmissionFormat, filter: SeverityFilter = 'ALL'): CommentGroup[] {
  const groups = new Map<string, CommentGroup & { order: number }>();
  comments.forEach((comment, index) => {
    if (filter !== 'ALL' && comment.severity !== filter) return;
    const key = locationKey(comment.location);
    const location = comment.location;
    const order = location.type === 'slide' ? location.slide : location.type === 'general' ? Number.MAX_SAFE_INTEGER : index;
    const group = groups.get(key) ?? { key, label: locationLabel(location, format), comments: [], order };
    group.comments.push(comment);
    groups.set(key, group);
  });
  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ key, label, comments: grouped }) => ({ key, label, comments: [...grouped].sort((a, b) => rank(a.severity) - rank(b.severity)) }));
}

/** The most severe comments, keeping the reviewer's order within a severity. */
export function topIssues(comments: ReviewComment[], limit = 3): ReviewComment[] {
  return comments
    .map((comment, index) => ({ comment, index }))
    .sort((a, b) => rank(a.comment.severity) - rank(b.comment.severity) || a.index - b.index)
    .slice(0, limit)
    .map(({ comment }) => comment);
}

export function countBySeverity(comments: ReviewComment[]): Record<SeverityFilter, number> {
  const counts: Record<SeverityFilter, number> = { ALL: comments.length, BLOCKING: 0, MATERIAL: 0, MINOR: 0 };
  for (const comment of comments) counts[comment.severity] += 1;
  return counts;
}
