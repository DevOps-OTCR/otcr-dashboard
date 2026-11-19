import { createRoot } from 'react-dom/client';
import { AgenticCmsFeature } from '@/components/AgenticCmsFeature';
import { ContextAuth } from './context-auth';

// Mounts the real access gate around the real Agentic CMS page, as the app layout does.
// The context API stub answers /feature-flags; ?flagOff turns the feature off.
const params = new URLSearchParams(window.location.search);
if (params.get('role') === 'PM') (window as any).testRole = 'PM';
if (params.has('flagOff')) (window as any).flagOff = true;
const auth = { isLoggedIn: true, getToken: async () => 'token', user: { email: 'reader@example.test' } };
createRoot(document.getElementById('root')!).render(<ContextAuth.Provider value={auth}><AgenticCmsFeature /></ContextAuth.Provider>);
