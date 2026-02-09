import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth-config';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ['/sign-in', '/sign-up', '/api/auth'];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  // Always allow API auth routes (including Google OAuth callbacks)
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Check authentication for protected routes
  if (!isPublicRoute) {
    try {
      const session = await auth();
      
      if (!session) {
        const signInUrl = new URL('/sign-in', request.url);
        signInUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(signInUrl);
      }
    } catch (error) {
      console.error('Middleware auth error:', error);
      // Allow request to continue if auth check fails
    }
  }

  // If accessing sign-in/sign-up while already authenticated, redirect to dashboard
  if ((pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up'))) {
    try {
      const session = await auth();
      if (session) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    } catch (error) {
      console.error('Middleware session check error:', error);
      // Allow sign-in page to load if session check fails
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes except auth
    '/(api|trpc)(.*)',
  ],
};
