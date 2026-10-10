import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InteractionStatus } from '@azure/msal-browser';
import { AuthProvider } from '@/components/AuthContext';
import DeliverablesPage from '@/app/deliverables/page';
import SlidesPage from '@/app/slides/page';
import AttendancePage from '@/app/attendance/page';
import { api } from '@/lib/api';
import { readNavigationSnapshot } from '@/lib/navigation-cache';
import { usePathname } from 'next/navigation';

const { MsalContext } = require('./routing.cjs');
function Pages() {
  const path = usePathname() ?? '/deliverables';
  const Page = path.startsWith('/slides') ? SlidesPage : path.startsWith('/attendance') ? AttendancePage : DeliverablesPage;
  return <Page key={path.split('?')[0]} />;
}

function Fixture() {
  const [inProgress, setProgress] = useState<InteractionStatus>(InteractionStatus.None);
  const email = 'pm@example.test';
  const accounts = useMemo(() => [{ username: email, name: email }], [email]);
  const instance = useMemo(() => ({
    initialize: async () => {},
    handleRedirectPromise: async () => null,
    setActiveAccount: () => {},
    getActiveAccount: () => accounts[0],
    acquireTokenSilent: async () => ({ accessToken: 'test-token' }),
    logoutRedirect: async () => {},
  }), [accounts]);
  (window as any).navigationTest = {
    tokenProgress: (active: boolean) => setProgress(active ? InteractionStatus.AcquireToken : InteractionStatus.None),
    write: () => api.post('/test-write', {}),
    readSnapshot: readNavigationSnapshot,
  };
  return <MsalContext.Provider value={{ instance, accounts, inProgress }}>
    <AuthProvider><Pages /></AuthProvider>
  </MsalContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
