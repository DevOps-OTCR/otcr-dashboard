import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InteractionStatus } from '@azure/msal-browser';
import { AuthProvider, useAuth } from '@/components/AuthContext';
import { AuthApiSync } from '@/components/AuthApiSync';
import SignInPage from '@/app/sign-in/page';
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
import TeamsPage from '@/app/teams/page';
import ClientNotesPage from '@/app/client-notes/page';
import { AutosaveProvider } from '@/components/Autosave';
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
    '/partner': PartnerDashboard, '/consultant': ConsultantDashboard, '/sign-in': SignInPage,
    '/alumni-database': AlumniDatabasePage, '/forms': FormsPage, '/teams': TeamsPage, '/client-notes': ClientNotesPage,
    '/people': PeoplePage, '/settings/slack': SlackSettingsPage };
  const route = path.split('?')[0].replace(/\/+$/, '');
  const Page = pages[route] ?? DeliverablesPage;
  return <Page key={route} />;
}

function AuthProbe() {
  const session = useAuth();
  useEffect(() => {
    ((window as any).navigationTest ??= {}).getToken = session.getToken;
  }, [session.getToken]);
  return new URLSearchParams(location.search).has('authSync') ? <AuthApiSync /> : null;
}

function Fixture() {
  const [inProgress, setProgress] = useState<InteractionStatus>(InteractionStatus.None);
  const [email, setEmail] = useState(() => sessionStorage.getItem('navigation-test-account') ?? 'pm@example.test');
  const accounts = useMemo(() => email ? [{ username: email, name: email, homeAccountId: email }] : [], [email]);
  const instance = useMemo(() => ({
    initialize: async () => {},
    handleRedirectPromise: async () => {
      if (!sessionStorage.getItem('navigation-test-login-result')) return null;
      sessionStorage.removeItem('navigation-test-login-result');
      return { account: accounts[0] };
    },
    addEventCallback: () => 'test-callback',
    removeEventCallback: () => {},
    setActiveAccount: () => {},
    getActiveAccount: () => accounts[0],
    getAllAccounts: () => accounts,
    acquireTokenSilent: async () => ({ accessToken: 'test-token' }),
    clearCache: async () => {
      sessionStorage.setItem('navigation-test-account', '');
      setEmail('');
    },
    loginRedirect: async () => {
      sessionStorage.setItem('navigation-test-account', 'pm@example.test');
      sessionStorage.setItem('navigation-test-login-result', 'true');
      location.assign(new URL('/pm', location.origin).href);
    },
    logoutRedirect: async () => { throw new Error('Dashboard sign-out must not call Microsoft logout'); },
  }), [accounts]);
  useEffect(() => {
    Object.assign((window as any).navigationTest ??= {}, {
      tokenProgress: (active: boolean) => setProgress(active ? InteractionStatus.AcquireToken : InteractionStatus.None),
      write: () => api.post('/test-write', {}),
      readSnapshot: readNavigationSnapshot,
      readResource,
      switchAccount: setEmail,
      navigate: require('./routing.cjs').navigate,
      request: () => cachedRequest('/slow-test', () => api.get('/slow-test')),
      requestAlumni: () => alumniAPI.getDataset(),
      instance,
      authHeader: () => api.defaults.headers.common.Authorization,
    });
  }, [instance]);
  return <MsalContext.Provider value={{ instance, accounts, inProgress }}>
    <ThemeProvider><AuthProvider><AuthProbe /><AutosaveProvider><DashboardShell><Pages /></DashboardShell></AutosaveProvider></AuthProvider></ThemeProvider>
  </MsalContext.Provider>;
}
// Match the root layout's theme initialization before mounting the browser fixture.
const themeScript = document.createElement('script');
themeScript.textContent = themeInitScript;
document.head.appendChild(themeScript);
createRoot(document.getElementById('root')!).render(<Fixture />);
