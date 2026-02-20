'use client';

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
        try {
          const token = await session.getToken();
          // Prefer access token; fall back to email so backend legacy auth still works.
          setAuthToken(token || session.user?.email || null);
        } catch {
          setAuthToken(session.user?.email || null);
        }
      } else {
        setAuthToken(null);
      }
    };
    void sync();
  }, [session.isLoggedIn, session?.user?.email, session]);

  return null;
}
