import { Role } from '@prisma/client';

// Exact-match mapping of Slack profile titles to suggested CMS roles.
// Only human-readable titles are mapped; anything ambiguous falls through to null.
// ADMIN is intentionally absent: administrator access is only ever granted by a human,
// never suggested from a Slack profile.
const SLACK_TITLE_ROLE_MAP: Readonly<Record<string, Role>> = {
  'consultant': Role.CONSULTANT,
  'senior consultant': Role.CONSULTANT,
  'lead consultant': Role.LC,
  'lc': Role.LC,
  'project manager': Role.PM,
  'pm': Role.PM,
  'partner': Role.PARTNER,
  'executive': Role.EXECUTIVE,
  'executive board': Role.EXECUTIVE,
};

// Lowercase, replace anything that is not a-z0-9 or space with a space, collapse whitespace.
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function suggestRoleFromSlackTitle(title: string | null | undefined): Role | null {
  if (typeof title !== 'string') return null;
  const normalized = normalizeTitle(title);
  if (!normalized) return null;
  // Exact match only — no substring or fuzzy matching, so titles like
  // 'Former Project Manager' or 'Project Manager Intern' resolve to null.
  if (!Object.prototype.hasOwnProperty.call(SLACK_TITLE_ROLE_MAP, normalized)) return null;
  return SLACK_TITLE_ROLE_MAP[normalized];
}
