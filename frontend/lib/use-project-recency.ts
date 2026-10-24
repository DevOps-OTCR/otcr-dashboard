'use client';

/**
 * Per-user project recency ordering.
 *
 * Stores a most-recently-used list of project IDs in localStorage, scoped to the
 * authenticated user (by email) so accounts never share preferences. Projects
 * are returned ordered most-recent-first across every page that shows a project
 * dropdown. Only intentional selections or explicit project contexts are
 * recorded — automatic fallback selection is left unrecorded.
 */
const STORAGE_KEY_PREFIX = 'otcr_project_recency';

function buildStorageKey(userEmail: string | undefined): string | null {
  const scope = (userEmail ?? '').toLowerCase();
  if (!scope) return null;
  return `${STORAGE_KEY_PREFIX}_${scope}`;
}

function safeReadLocales(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {
    // Corrupt or non-array data — reset on next write.
  }
  return [];
}

function safeWriteLocales(key: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Quota or privacy-mode errors — silently ignore.
  }
}

export function useProjectRecency(userEmail: string | undefined) {
  const key = buildStorageKey(userEmail);

  const recordProject = (projectId: string) => {
    if (!key || !projectId) return;
    const existing = safeReadLocales(key);
    const filtered = existing.filter((id) => id !== projectId);
    filtered.unshift(projectId);
    safeWriteLocales(key, filtered);
  };

  const orderProjects = <T extends { id: string; name: string }>(projects: T[]): T[] => {
    if (!key || projects.length === 0) return projects;
    const order = safeReadLocales(key);
    if (order.length === 0) return projects;
    const rank = new Map(order.map((id, index) => [id, index]));
    return [...projects].sort((a, b) => {
      const aRank = rank.has(a.id) ? rank.get(a.id)! : order.length;
      const bRank = rank.has(b.id) ? rank.get(b.id)! : order.length;
      return aRank - bRank;
    });
  };

  return { recordProject, orderProjects };
}
