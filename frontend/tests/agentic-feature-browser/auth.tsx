import { createContext, useContext } from 'react';

export const TestAuth = createContext({
  isLoggedIn: true,
  user: { email: 'pilot@example.test' },
  getToken: async (): Promise<string | null> => 'synthetic-token',
});
export const useAuth = () => useContext(TestAuth);
