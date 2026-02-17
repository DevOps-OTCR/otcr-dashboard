import NextAuth from 'next-auth';

// Minimal config for the transition period
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [], // No providers needed; MSAL handles the login on the client
  pages: {
    signIn: '/sign-in',
  },
  callbacks: {
    // If you ever use auth() in middleware, this just returns true if 
    // the user exists, otherwise redirects to sign-in.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      return isLoggedIn;
    },
  },
});