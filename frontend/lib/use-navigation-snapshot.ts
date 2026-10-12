'use client';

import { useCallback, useMemo } from 'react';
import { getDevRoleOverride } from './permissions';
import { readNavigationSnapshot, writeNavigationSnapshot } from './navigation-cache';

export function useNavigationSnapshot<T>(page: string, email?: string) {
  const key = JSON.stringify([page, email?.toLowerCase(), getDevRoleOverride()]);
  const snapshot = useMemo(() => email ? readNavigationSnapshot<T>(key) : undefined, [email, key]);
  const saveSnapshot = useCallback((data: T) => {
    if (email) writeNavigationSnapshot(key, data);
  }, [email, key]);
  return { snapshot, saveSnapshot };
}
