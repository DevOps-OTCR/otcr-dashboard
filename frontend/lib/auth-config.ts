// Separate auth config for middleware (Edge Runtime compatible)
// This file doesn't import Prisma, so it can be used in middleware
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
  ],
  pages: {
    signIn: '/sign-in',
    error: '/sign-in?error=unauthorized',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log('signIn callback called:', { 
        hasUser: !!user, 
        hasAccount: !!account, 
        userEmail: user?.email,
        provider: account?.provider 
      });

      // Only proceed if we have user email and account (after Google auth completes)
      if (!user?.email) {
        console.error('No user email in signIn callback');
        return false;
      }

      if (!account?.providerAccountId) {
        console.error('No providerAccountId in signIn callback');
        return false;
      }

      // Check if email is allowed via API call (works in Edge Runtime)
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        console.log('Checking email:', user.email, 'with API:', API_URL);
        
        const response = await fetch(
          `${API_URL}/auth/check-email?email=${encodeURIComponent(user.email)}`,
          { 
            cache: 'no-store',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (!response.ok) {
          console.error('Email check API error:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('Error response:', errorText);
          throw new Error(`API returned ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Email check response:', data);
        
        if (!data.success || !data.allowed) {
          console.log('Email not allowed:', user.email);
          return false;
        }

        // Sync user with database via API (since we can't use Prisma in Edge Runtime)
        // The backend API will handle user creation/update
        try {
          const syncResponse = await fetch(`${API_URL}/auth/sync-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              googleId: account.providerAccountId,
              email: user.email,
              name: user.name,
            }),
            cache: 'no-store',
          });
          
          if (syncResponse.ok) {
            const syncData = await syncResponse.json();
            console.log('User synced successfully:', syncData);
          } else {
            console.warn('User sync failed but continuing:', syncResponse.status);
          }
        } catch (syncError) {
          console.error('Error syncing user:', syncError);
          // Don't fail sign-in if sync fails, but log it
        }
      } catch (error) {
        console.error('Error checking email during sign-in:', error);
        return false;
      }

      console.log('Sign-in successful for:', user.email);
      return true;
    },
    async jwt({ token, account, user }) {
      if (account && user) {
        token.sub = account.providerAccountId;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.sub as string;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
});
