'use client';

import { InteractionStatus } from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { RoleDashboardRedirect } from '@/components/RoleDashboardRedirect';

export default function AuthCallbackPage() {
  const { inProgress } = useMsal();

  if (inProgress === InteractionStatus.None) return <RoleDashboardRedirect />;

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0a1628]">
      <div className="relative z-10 animate-spin rounded-full h-12 w-12 border-b-2 border-white/30 border-t-white" />
    </div>
  );
}
