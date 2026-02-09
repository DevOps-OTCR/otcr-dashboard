'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';

// Helper function to get error from URL - handles malformed URLs with multiple ? characters
function getErrorFromURL(): string | null {
  if (typeof window === 'undefined') return null;
  
  // Check the full URL string (including hash) for error patterns
  const fullUrl = window.location.href;
  const search = window.location.search;
  
  let error = null;
  
  // Always check the full URL string first for malformed URLs
  // This handles cases like: ?error=unauthorized?error=AccessDenied
  const urlLower = fullUrl.toLowerCase();
  
  // Check for AccessDenied first (prioritize if both are present)
  if (urlLower.includes('error=accessdenied') || fullUrl.includes('error=AccessDenied')) {
    error = 'AccessDenied';
  } 
  // Then check for unauthorized
  else if (urlLower.includes('error=unauthorized')) {
    error = 'unauthorized';
  }
  // Also check search string specifically (in case full URL check missed it)
  else if (search.includes('error=AccessDenied') || search.toLowerCase().includes('error=accessdenied')) {
    error = 'AccessDenied';
  } else if (search.toLowerCase().includes('error=unauthorized')) {
    error = 'unauthorized';
  }
  
  // Fallback: try standard URLSearchParams parsing (for well-formed URLs)
  if (!error) {
    try {
      const urlParams = new URLSearchParams(search);
      const paramError = urlParams.get('error');
      if (paramError && (paramError.toLowerCase() === 'unauthorized' || paramError.toLowerCase() === 'accessdenied')) {
        error = paramError;
      }
    } catch (e) {
      // If URLSearchParams fails, we already have error from string matching above
    }
  }
  
  return error;
}

export default function SignInPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Initialize error state from URL on mount (using direct URL check since searchParams may not be ready)
  const [accessDeniedError, setAccessDeniedError] = useState<string | null>(() => {
    const error = getErrorFromURL();
    if (error && (error.toLowerCase() === 'unauthorized' || error.toLowerCase() === 'accessdenied')) {
      return 'Your email address is not authorized to access this application. Please contact an administrator.';
    }
    return null;
  });

  // Check for error from URL params - check both searchParams and window.location as fallback
  useEffect(() => {
    // Always check the full URL first (handles malformed URLs)
    let error = getErrorFromURL();
    
    // Also try searchParams as a fallback
    if (!error) {
      error = searchParams?.get('error');
    }
    
    // Debug logging
    if (error) {
      console.log('Error parameter detected:', error, 'from URL:', typeof window !== 'undefined' ? window.location.href : 'N/A');
    } else {
      console.log('No error found. Full URL:', typeof window !== 'undefined' ? window.location.href : 'N/A');
    }
    
    // Handle both 'unauthorized' and 'AccessDenied' errors (case-insensitive)
    if (error && (error.toLowerCase() === 'unauthorized' || error.toLowerCase() === 'accessdenied')) {
      setAccessDeniedError(
        'Your email address is not authorized to access this application. Please contact an administrator.'
      );
    } else {
      setAccessDeniedError(null);
    }
  }, [searchParams]);

  // Redirect to dashboard if authenticated
  useEffect(() => {
    if (status === 'authenticated' && session?.user && !accessDeniedError) {
      router.push('/dashboard');
    }
  }, [status, session, router, accessDeniedError]);

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl: '/dashboard' });
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a1628]">
        <div className="w-full max-w-md text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white/30 border-t-white mx-auto mb-4"></div>
          <p className="text-white/70">Loading...</p>
        </div>
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
                  <svg
                    className="w-6 h-6 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-red-400 mb-2">Access Denied</h3>
                  <p className="text-red-300/90 text-sm mb-4">{accessDeniedError}</p>
                  {session?.user?.email && (
                    <p className="text-red-200/70 text-xs mb-4">
                      Email: <span className="font-mono">{session.user.email}</span>
                    </p>
                  )}
                  <button
                    onClick={() => signOut({ callbackUrl: '/sign-in' })}
                    className="text-sm text-red-300 hover:text-red-200 underline transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Login Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl">
          {/* Logo and Branding */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Image
                src="/otcr-logo-white.webp"
                alt="OTCR Logo"
                width={200}
                height={80}
                className="object-contain"
                priority
              />
            </div>
            <p className="text-white/60 text-sm">Fast & Easy Project Management</p>
          </div>

          {/* Welcome Message */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-white mb-2">Welcome Back!</h2>
          </div>

          {/* Sign In Button */}
          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[rgb(0,51,96)] hover:bg-[rgb(0,51,96)]/90 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>Sign in with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
}
