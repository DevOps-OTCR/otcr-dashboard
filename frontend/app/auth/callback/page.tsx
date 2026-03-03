'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { InteractionStatus } from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { useAuth } from '@/components/AuthContext';
import { getDefaultDashboardPathForUser } from '@/lib/permissions';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { inProgress } = useMsal();
  const { isLoggedIn, loading, user, getToken } = useAuth();

  useEffect(() => {
    if (loading || inProgress !== InteractionStatus.None) return;

    if (!isLoggedIn || !user?.email) {
      router.replace('/sign-in');
      return;
    }

    const redirectToRoleDashboard = async () => {
      const token = await getToken();
      const target = await getDefaultDashboardPathForUser(token, user.email);
      router.replace(target);
    };

    void redirectToRoleDashboard();
  }, [getToken, inProgress, isLoggedIn, loading, router, user?.email]);

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0a1628]">
      <div className="relative z-10 animate-spin rounded-full h-12 w-12 border-b-2 border-white/30 border-t-white" />
    </div>
  );
}
