'use client';

import { useAuth } from './AuthContext';
import { useEffect } from 'react';
import { authAPI, setAuthToken } from '@/lib/api';
import { useMsal } from '@azure/msal-react';

/**
 * Sync API auth header and persist MSAL profile fields to backend User table.
 */
export function AuthApiSync() {
  const session = useAuth();
  const { instance } = useMsal();

  useEffect(() => {
    const sync = async () => {
      if (session.isLoggedIn) {
        try {
          const token = await session.getToken();
          // Prefer access token; fall back to email so backend legacy auth still works.
          const authValue = token || session.user?.email || null;
          setAuthToken(authValue);

          const account = instance.getActiveAccount();
          const email = session.user?.email?.trim().toLowerCase();
          const displayName =
            session.user?.name?.trim() ||
            (typeof account?.name === 'string' ? account.name.trim() : '');
          const googleId =
            (account?.idTokenClaims as any)?.oid ||
            (account?.idTokenClaims as any)?.sub ||
            account?.localAccountId ||
            account?.homeAccountId;

          if (!authValue || !email || !googleId) return;

          const syncFingerprint = `${email}|${googleId}|${displayName}`;
          const storageKey = 'otcr_profile_sync_fingerprint';
          const prevFingerprint =
            typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) : null;
          if (prevFingerprint === syncFingerprint) return;

          await authAPI.syncUser({
            googleId,
            email,
            name: displayName || undefined,
          });

          if (typeof window !== 'undefined') {
            sessionStorage.setItem(storageKey, syncFingerprint);
          }
        } catch {
          setAuthToken(session.user?.email || null);
        }
      } else {
        setAuthToken(null);
      }
    };
    void sync();
  }, [instance, session.isLoggedIn, session?.user?.email, session?.user?.name, session]);

  return null;
}
