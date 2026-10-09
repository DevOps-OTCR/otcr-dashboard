'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthContext';
import { getDefaultDashboardPathForUser } from '@/lib/permissions';

/** Shared role-lookup recovery for dashboard redirects and page initialization. */
export function RoleDashboardRedirect() {
  const router = useRouter();
  const { isLoggedIn, user, loading, getToken } = useAuth();
  const [failedEmail, setFailedEmail] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const email = user?.email;

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn || !email) {
      router.replace('/sign-in');
      return;
    }

    let cancelled = false;
    const redirect = async () => {
      try {
        const token = await getToken();
        if (cancelled) return;
        const target = await getDefaultDashboardPathForUser(token, email);
        if (!cancelled) router.replace(target);
      } catch {
        if (!cancelled) setFailedEmail(email);
      }
    };
    void redirect();
    return () => { cancelled = true; };
  }, [attempt, email, getToken, isLoggedIn, loading, router]);

  const failed = !loading && isLoggedIn && email && failedEmail === email;
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0a1628] px-6 text-white">
      {failed ? (
        <section className="w-full max-w-md rounded-2xl border border-white/15 bg-white/5 p-8 shadow-xl">
          <div role="alert">
            <h1 className="text-2xl font-semibold">Unable to load your dashboard</h1>
            <p className="mt-3 text-sm leading-6 text-white/75">
              We couldn’t confirm your role. Please try again to open your dashboard.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFailedEmail(null);
              setAttempt(value => value + 1);
            }}
            className="mt-6 w-full rounded-xl bg-[#FF5F05] px-6 py-3 font-medium hover:bg-[#e55604] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            Retry
          </button>
        </section>
      ) : (
        <p role="status" className="text-sm text-white/80">Loading your dashboard…</p>
      )}
    </main>
  );
}
