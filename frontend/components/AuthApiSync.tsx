'use client';

import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { setAuthToken } from '@/lib/api';

/**
 * Syncs NextAuth session to API client so requests (e.g. projects, deliverables)
 * send Authorization: Bearer <email> for backend user lookup.
 */
export function AuthApiSync() {
  const { data: session } = useSession();
  useEffect(() => {
    setAuthToken(session?.user?.email ?? null);
  }, [session?.user?.email]);
  return null;
}
