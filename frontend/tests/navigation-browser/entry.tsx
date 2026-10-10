import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InteractionStatus } from '@azure/msal-browser';
import { AuthProvider } from '@/components/AuthContext';
import DeliverablesPage from '@/app/deliverables/page';
import SlidesPage from '@/app/slides/page';
import AttendancePage from '@/app/attendance/page';
import WorkstreamPage from '@/app/workstream/page';
import When2MeetPage from '@/app/when2meet/page';
import PMDashboard from '@/app/pm/page';
import LCDashboard from '@/app/lc/page';
import PartnerDashboard from '@/app/partner/page';
import ConsultantDashboard from '@/app/consultant/page';
import { DashboardShell } from '@/components/DashboardShell';
import { cachedRequest, readResource } from '@/lib/resource-cache';
import { api } from '@/lib/api';
import { readNavigationSnapshot } from '@/lib/navigation-cache';
import { usePathname } from 'next/navigation';

const { MsalContext } = require('./routing.cjs');
function Pages() {
  const path = usePathname() ?? '/deliverables';
  const pages: Record<string, typeof DeliverablesPage> = { '/slides': SlidesPage, '/attendance': AttendancePage,
    '/workstream': WorkstreamPage, '/when2meet': When2MeetPage, '/pm': PMDashboard, '/lc': LCDashboard,
    '/partner': PartnerDashboard, '/consultant': ConsultantDashboard };
  const Page = pages[path.split('?')[0]] ?? DeliverablesPage;
  return <Page key={path.split('?')[0]} />;
}

function Fixture() {
  const [inProgress, setProgress] = useState<InteractionStatus>(InteractionStatus.None);
  const [email, setEmail] = useState('pm@example.test');
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
    readResource,
    switchAccount: setEmail,
    navigate: require('./routing.cjs').navigate,
    request: () => cachedRequest('/slow-test', () => api.get('/slow-test')),
  };
  return <MsalContext.Provider value={{ instance, accounts, inProgress }}>
    <AuthProvider><DashboardShell><Pages /></DashboardShell></AuthProvider>
  </MsalContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
