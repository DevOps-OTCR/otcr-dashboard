'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { InteractionStatus } from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { useAuth } from '@/components/AuthContext';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { inProgress } = useMsal();
  const { isLoggedIn, loading } = useAuth();

  useEffect(() => {
    if (loading || inProgress !== InteractionStatus.None) return;

    router.replace(isLoggedIn ? '/dashboard' : '/sign-in');
  }, [inProgress, isLoggedIn, loading, router]);

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0a1628]">
      <div className="relative z-10 animate-spin rounded-full h-12 w-12 border-b-2 border-white/30 border-t-white" />
    </div>
  );
}
