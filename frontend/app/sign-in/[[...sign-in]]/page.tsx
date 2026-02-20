'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthContext'; // Using your MSAL-based context
import { useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import Image from 'next/image';

export default function SignInPage() {
  const { login, logout, user, isLoggedIn } = useAuth();
  const { inProgress } = useMsal();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [accessDeniedError, setAccessDeniedError] = useState<string | null>(null);

  // Helper to clear cookies if MSAL gets stuck
  const clearAllDomainCookies = () => {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    }
  };

  // 1. Handle URL Error Parsing
  useEffect(() => {
    const error = searchParams?.get('error');
    if (error && (error.toLowerCase() === 'unauthorized' || error.toLowerCase() === 'accessdenied')) {
      setAccessDeniedError('Your email address is not authorized to access this application.');
    } else {
      setAccessDeniedError(null);
    }
  }, [searchParams]);

  // 2. Redirect to dashboard if MSAL reports authenticated
  useEffect(() => {
    if (isLoggedIn && user && !accessDeniedError) {
      router.push('/dashboard');
    }
  }, [isLoggedIn, user, router, accessDeniedError]);

  const handleAzureSignIn = async () => {
    // If MSAL is stuck in a redirect loop or "interaction_in_progress"
    if (inProgress !== InteractionStatus.None) {
      clearAllDomainCookies();
    }

    try {
      await login();
    } catch (error) {
      console.error("Login failed:", error);
      setAccessDeniedError("An unexpected error occurred. Please clear your cookies and try again.");
    }
  };

  // Loading State (MSAL Startup)
  if (inProgress !== InteractionStatus.None && !accessDeniedError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a1628]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white/30 border-t-white mx-auto mb-4"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a1628] relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-[rgb(0,51,96)]/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[rgb(0,51,96)]/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>
      
      <div className="w-full max-w-md px-6 relative z-10">
        {/* Access Denied Card */}
        {accessDeniedError && (
          <div className="mb-6 animate-fadeIn">
            <div className="bg-red-500/10 border-2 border-red-500/50 rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-red-400 mb-2">Access Denied</h3>
                  <p className="text-red-300/90 text-sm mb-4">{accessDeniedError}</p>
                  <button
                    onClick={() => logout()}
                    className="text-sm text-red-300 hover:text-red-200 underline transition-colors"
                  >
                    Try a different account
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Login Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Image src="/otcr-logo-white.webp" alt="OTCR Logo" width={200} height={80} className="object-contain" priority />
            </div>
            <p className="text-white/60 text-sm">Fast & Easy Project Management</p>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-white mb-2">Welcome Back!</h2>
          </div>

          {/* Sign In Button - Styled with UIUC Orange to match AcmLoginButton intent */}
          <button
            onClick={handleAzureSignIn}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#FF5F05] hover:bg-[#e55604] text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
          >
            {/* Microsoft Icon */}
            <svg className="w-5 h-5" viewBox="0 0 23 23">
              <path fill="#f3f3f3" d="M0 0h11v11H0z"/><path fill="#f3f3f3" d="M12 0h11v11H12z"/><path fill="#f3f3f3" d="M0 12h11v11H0z"/><path fill="#f3f3f3" d="M12 12h11v11H12z"/>
            </svg>
            <span>Sign in with NetID</span>
          </button>
        </div>
      </div>
    </div>
  );
}