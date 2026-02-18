declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
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
