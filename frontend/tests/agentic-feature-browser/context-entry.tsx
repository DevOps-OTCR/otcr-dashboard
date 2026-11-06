import { createRoot } from 'react-dom/client';
import AgenticCms from '@/features/agentic-cms';
import { ContextAuth } from './context-auth';
const params = new URLSearchParams(window.location.search);
if (params.get('role') === 'ADMIN') (window as any).testRole = 'ADMIN';
if (params.get('projects') === 'none') (window as any).noProjects = true;
createRoot(document.getElementById('root')!).render(<ContextAuth.Provider value={{ getToken: async () => 'token', user: { email: 'reader@example.test' } }}><AgenticCms /></ContextAuth.Provider>);
