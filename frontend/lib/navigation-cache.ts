// Retain visited content for this session while pages revalidate shared resources.
const snapshots = new Map<string, unknown>();

export function readNavigationSnapshot<T>(key: string): T | undefined {
  return snapshots.get(key) as T | undefined;
}

export function writeNavigationSnapshot<T>(key: string, data: T): void {
  snapshots.set(key, data);
}

export function clearNavigationSnapshots(): void {
  snapshots.clear();
}
