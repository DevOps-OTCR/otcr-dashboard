// Keep recently visited page data in memory. Each visit still revalidates it.
const MAX_AGE_MS = 2 * 60 * 1000;
const snapshots = new Map<string, { savedAt: number; data: unknown }>();

export function readNavigationSnapshot<T>(key: string): T | undefined {
  const entry = snapshots.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.savedAt >= MAX_AGE_MS) {
    snapshots.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function writeNavigationSnapshot<T>(key: string, data: T): void {
  snapshots.set(key, { savedAt: Date.now(), data });
}

export function clearNavigationSnapshots(): void {
  snapshots.clear();
}
