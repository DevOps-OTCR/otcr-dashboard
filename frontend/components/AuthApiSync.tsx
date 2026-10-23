'use client';

import { useAuth } from './AuthContext';
import { useEffect } from 'react';
import { authAPI, setAuthToken } from '@/lib/api';
import { cmsSessionRevision, readCmsSession } from '@/lib/cms-session';
import { useMsal } from '@azure/msal-react';

/**
 * Sync API auth header and persist MSAL profile fields to backend User table.
 */
export function AuthApiSync() {
  const session = useAuth();
  const { instance } = useMsal();

  useEffect(() => {
    let cancelled = false;
    const revision = cmsSessionRevision();
    const isCurrent = () => !cancelled && !readCmsSession()?.signedOut && revision === cmsSessionRevision();
    const sync = async () => {
      if (session.isLoggedIn) {
        try {
          const token = await session.getToken();
          if (!isCurrent()) return;
          // An expired or signed-out session must not fall back to an email credential.
          const authValue = token;
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

          if (isCurrent() && typeof window !== 'undefined') {
            sessionStorage.setItem(storageKey, syncFingerprint);
          }
        } catch {
          if (isCurrent()) setAuthToken(null);
        }
      } else {
        setAuthToken(null);
      }
    };
    void sync();
    return () => { cancelled = true; };
  }, [instance, session.isLoggedIn, session?.user?.email, session?.user?.name, session]);

  return null;
}
