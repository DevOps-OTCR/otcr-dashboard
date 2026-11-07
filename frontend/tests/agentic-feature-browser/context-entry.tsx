import { createRoot } from 'react-dom/client';
import AgenticCms from '@/features/agentic-cms';
import { ContextAuth } from './context-auth';
const params = new URLSearchParams(window.location.search);
if (params.get('role') === 'ADMIN') (window as any).testRole = 'ADMIN';
if (params.get('role') === 'PM') (window as any).testRole = 'PM';
if (params.get('projects') === 'none') (window as any).noProjects = true;
if (params.has('delayProjectTwo')) (window as any).delayProjectTwo = true;
if (params.has('failProjectTwo')) (window as any).failProjectTwo = true;
if (params.has('lateMount')) {
  document.getElementById('agentic-cms-root')?.remove();
  setTimeout(() => { const target = document.createElement('div'); target.id = 'agentic-cms-root'; document.body.appendChild(target); }, 40);
}
createRoot(document.getElementById('root')!).render(<ContextAuth.Provider value={{ getToken: async () => 'token', user: { email: 'reader@example.test' } }}><AgenticCms /></ContextAuth.Provider>);
