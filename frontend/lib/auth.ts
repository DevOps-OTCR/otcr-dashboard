// For NextAuth v5, we use the auth() function directly
// This file provides a helper for server-side session access
import { auth } from '@/lib/auth-config';

export async function getSession() {
  return await auth();
}

export async function getCurrentUser() {
  const session = await auth();
  return session?.user;
}
