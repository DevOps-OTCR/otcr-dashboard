import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id?: string;
      /** Role from database (backend); set at login via GET /auth/role */
      role?: 'CONSULTANT' | 'LC' | 'PM' | 'PARTNER' | 'ADMIN';
    };
  }

  interface User {
    role?: 'CONSULTANT' | 'LC' | 'PM' | 'PARTNER' | 'ADMIN';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: 'CONSULTANT' | 'LC' | 'PM' | 'PARTNER' | 'ADMIN';
  }
}
