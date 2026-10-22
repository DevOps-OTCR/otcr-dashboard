import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InteractionStatus } from '@azure/msal-browser';
import { AuthProvider } from '@/components/AuthContext';
import PeoplePage from '@/app/people/page';
import SlackSettingsPage from '@/app/settings/slack/page';
import DeliverablesPage from '@/app/deliverables/page';
import SlidesPage from '@/app/slides/page';
import AttendancePage from '@/app/attendance/page';
import WorkstreamPage from '@/app/workstream/page';
import When2MeetPage from '@/app/when2meet/page';
import OverviewPage from '@/app/overview/page';
import PMDashboard from '@/app/pm/page';
import LCDashboard from '@/app/lc/page';
import PartnerDashboard from '@/app/partner/page';
import ConsultantDashboard from '@/app/consultant/page';
import AlumniDatabasePage from '@/app/alumni-database/page';
import FormsPage from '@/app/forms/page';
import { DashboardShell } from '@/components/DashboardShell';
import { ThemeProvider, themeInitScript } from '@/components/ThemeProvider';
import { cachedRequest, readResource } from '@/lib/resource-cache';
import { alumniAPI, api } from '@/lib/api';
import { readNavigationSnapshot } from '@/lib/navigation-cache';
import { usePathname } from 'next/navigation';

const { MsalContext } = require('./routing.cjs');
function Pages() {
  const path = usePathname() ?? '/deliverables';
  const pages: Record<string, typeof DeliverablesPage> = { '/slides': SlidesPage, '/attendance': AttendancePage,
    '/workstream': WorkstreamPage, '/when2meet': When2MeetPage, '/overview': OverviewPage, '/pm': PMDashboard, '/lc': LCDashboard,
    '/partner': PartnerDashboard, '/consultant': ConsultantDashboard,
    '/alumni-database': AlumniDatabasePage, '/forms': FormsPage,
    '/people': PeoplePage, '/settings/slack': SlackSettingsPage };
  const route = path.split('?')[0].replace(/\/+$/, '');
  const Page = pages[route] ?? DeliverablesPage;
  return <Page key={route} />;
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
  useEffect(() => {
    (window as any).navigationTest = {
      tokenProgress: (active: boolean) => setProgress(active ? InteractionStatus.AcquireToken : InteractionStatus.None),
      write: () => api.post('/test-write', {}),
      readSnapshot: readNavigationSnapshot,
      readResource,
      switchAccount: setEmail,
      navigate: require('./routing.cjs').navigate,
      request: () => cachedRequest('/slow-test', () => api.get('/slow-test')),
      requestAlumni: () => alumniAPI.getDataset(),
    };
  }, []);
  return <MsalContext.Provider value={{ instance, accounts, inProgress }}>
    <ThemeProvider><AuthProvider><DashboardShell><Pages /></DashboardShell></AuthProvider></ThemeProvider>
  </MsalContext.Provider>;
}
// Match the root layout's theme initialization before mounting the browser fixture.
const themeScript = document.createElement('script');
themeScript.textContent = themeInitScript;
document.head.appendChild(themeScript);
createRoot(document.getElementById('root')!).render(<Fixture />);
