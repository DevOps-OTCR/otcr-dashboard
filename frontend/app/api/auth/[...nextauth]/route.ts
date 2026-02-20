// Route handler for NextAuth - exports GET and POST handlers
// The auth config handles all the logic, we just need to export the handlers
import { handlers } from '@/lib/auth-config';

// Export GET and POST handlers for NextAuth API routes
export const { GET, POST } = handlers;
