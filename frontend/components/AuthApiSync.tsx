'use client';

import { useSession } from 'next-auth/react';
import { useAuth } from './AuthContext';
import { useEffect } from 'react';
import { setAuthToken } from '@/lib/api';

/**
 * Syncs NextAuth session to API client so requests (e.g. projects, deliverables)
 * send Authorization: Bearer <email> for backend user lookup.
 */
export function AuthApiSync() {
  const session = useAuth();

  useEffect(() => {
    const sync = async () => {
      if (session.isLoggedIn) {
        const token = await session.getToken();
        setAuthToken(token);
      } else {
        setAuthToken(null);
      }
    };
    sync();
  }, [session.isLoggedIn, session?.user?.email]);

  return null;
}
