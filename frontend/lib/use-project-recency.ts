'use client';

import { useCallback } from 'react';

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
// Projects without recorded history sort after every remembered project while
// keeping their incoming order relative to each other.
const UNSET_RANK = Number.MAX_SAFE_INTEGER;

function buildStorageKey(userEmail: string | undefined): string | null {
  const scope = (userEmail ?? '').trim().toLowerCase();
  if (!scope) return null;
  return `${STORAGE_KEY_PREFIX}_${scope}`;
}

function safeReadRecency(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    // Corrupt JSON, non-array payloads, or unavailable storage — treat as no history.
    return [];
  }
}

function safeWriteRecency(key: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Quota or privacy-mode errors — silently ignore.
  }
}

export function useProjectRecency(userEmail: string | undefined) {
  const key = buildStorageKey(userEmail);

  const recordProject = useCallback((projectId: string) => {
    if (!key || !projectId) return;
    const existing = safeReadRecency(key);
    const filtered = existing.filter((id) => id !== projectId);
    filtered.unshift(projectId);
    safeWriteRecency(key, filtered);
  }, [key]);

  const orderProjects = useCallback(<T extends { id: string; name: string }>(projects: T[]): T[] => {
    if (!key || projects.length === 0) return projects;
    const order = safeReadRecency(key);
    if (order.length === 0) return projects;
    const rank = new Map(order.map((id, index) => [id, index]));
    // Sort a copy so cached API data is never mutated. Projects with no recorded
    // history keep their incoming order (stable sort), and remembered IDs are
    // only honoured while the project is still available to the user.
    return [...projects].sort((a, b) =>
      (rank.get(a.id) ?? UNSET_RANK) - (rank.get(b.id) ?? UNSET_RANK),
    );
  }, [key]);

  return { recordProject, orderProjects };
}
