/**
 * Shared GET responses for dashboard pages. This module is the cache policy:
 *
 * - Memory only. Entries live for the signed-in browser session and are never persisted.
 * - Freshness: a response is fresh for FRESHNESS.standard (2 min), or FRESHNESS.live (30 s) for
 *   attendance and When2Meet. Within that window, returning to a page reuses the response
 *   without a request, which throttles return-visit refreshes. After it, the response is kept;
 *   pages render their navigation snapshot immediately and the next request refreshes it in the
 *   background. A `maxAge` of 0 bypasses freshness but still shares a pending request.
 * - Concurrent requests for the same path share one in-flight promise.
 * - Failed requests are never stored, so the next visit or refresh retries.
 * - Scope: keys include the signed-in email and the development role override.
 * - Generation: writes, account changes, and sign-out bump the generation, so responses that
 *   started earlier cannot repopulate the cache.
 *
 * In development, `window.__otcrResourceCache.inspect()` lists entries and their ages.
 */
export const FRESHNESS = { standard: 120000, live: 30000 } as const;

const responses = new Map<string, { savedAt: number; maxAge: number; response: unknown }>();
const pending = new Map<string, Promise<unknown>>();
let scope = '';
let generation = 0;

export function clearResourceCache(): void {
  generation += 1;
  responses.clear();
  pending.clear();
}

export function setResourceCacheScope(email?: string): void {
  const next = email?.toLowerCase() ?? '';
  if (scope !== next) clearResourceCache();
  scope = next;
}

function cacheKey(path: string): string {
  const role = typeof window === 'undefined' ? '' : localStorage.getItem('otcr_dev_role_override');
  return JSON.stringify([scope, role, path]);
}

export function readResource<T>(path: string): T | undefined {
  return responses.get(cacheKey(path))?.response as T | undefined;
}

export function cachedRequest<T>(path: string, fetch: () => Promise<T>, maxAge: number = FRESHNESS.standard): Promise<T> {
  const key = cacheKey(path);
  const cached = responses.get(key);
  if (cached && Date.now() - cached.savedAt < maxAge) return Promise.resolve(cached.response as T);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight as Promise<T>;
  const startedGeneration = generation;
  const request = fetch().then(response => {
    // A write or account change must also invalidate requests already in flight.
    if (generation === startedGeneration) responses.set(key, { savedAt: Date.now(), maxAge, response });
    return response;
  }).finally(() => {
    if (pending.get(key) === request) pending.delete(key);
  });
  pending.set(key, request);
  return request;
}

/** Development aid: trace whether a displayed value came from this cache. */
export function inspectResourceCache(): Array<{ key: string; ageMs: number; fresh: boolean; pending: boolean }> {
  const now = Date.now();
  const keys = new Set([...responses.keys(), ...pending.keys()]);
  return Array.from(keys, key => {
    const entry = responses.get(key);
    return { key, ageMs: entry ? now - entry.savedAt : -1,
      fresh: Boolean(entry && now - entry.savedAt < entry.maxAge), pending: pending.has(key) };
  });
}

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as unknown as Record<string, unknown>).__otcrResourceCache = {
    policy: FRESHNESS, inspect: inspectResourceCache, clear: clearResourceCache,
  };
}
