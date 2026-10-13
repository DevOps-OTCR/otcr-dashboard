// Shared GET responses live only for the signed-in browser session.
const responses = new Map<string, { savedAt: number; response: unknown }>();
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

export function cachedRequest<T>(path: string, fetch: () => Promise<T>, maxAge = 120000): Promise<T> {
  const key = cacheKey(path);
  const cached = responses.get(key);
  if (cached && Date.now() - cached.savedAt < maxAge) return Promise.resolve(cached.response as T);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight as Promise<T>;
  const startedGeneration = generation;
  const request = fetch().then(response => {
    // A write or account change must also invalidate requests already in flight.
    if (generation === startedGeneration) responses.set(key, { savedAt: Date.now(), response });
    return response;
  }).finally(() => {
    if (pending.get(key) === request) pending.delete(key);
  });
  pending.set(key, request);
  return request;
}
