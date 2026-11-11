import { createContext, useContext } from 'react';
export const ContextAuth = createContext({ getToken: async () => 'token', user: { email: 'reader@example.test' } });
export const useAuth = () => useContext(ContextAuth);
