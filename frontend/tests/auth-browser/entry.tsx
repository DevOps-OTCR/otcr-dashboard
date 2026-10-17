import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { PublicClientApplication, InteractionRequiredAuthError, type AuthenticationResult } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { AuthProvider, useAuth } from '@/components/AuthContext';
import { AuthApiSync } from '@/components/AuthApiSync';
import { RoleDashboardRedirect } from '@/components/RoleDashboardRedirect';
import { usePathname, useRouter } from 'next/navigation';
import { msalConfig } from '@/lib/msal-config';
import { beginCmsSignIn, completeCmsSignIn, CMS_SESSION_KEY } from '@/lib/cms-session';
import { api } from '@/lib/api';

const tenant = '00000000-0000-4000-8000-000000000002';
const clientId = '00000000-0000-4000-8000-000000000001';
const authority = `https://login.microsoftonline.com/${tenant}`;
const config = msalConfig(location.origin, '');
config.auth = { ...config.auth, clientId, authority,
  authorityMetadata: JSON.stringify({
    authorization_endpoint: `${authority}/oauth2/v2.0/authorize`,
    token_endpoint: `${authority}/oauth2/v2.0/token`,
    end_session_endpoint: `${authority}/oauth2/v2.0/logout`,
    issuer: `${authority}/v2.0`, jwks_uri: `${authority}/discovery/v2.0/keys`,
  }),
  cloudDiscoveryMetadata: JSON.stringify({ tenant_discovery_endpoint: `${authority}/v2.0/.well-known/openid-configuration`,
    metadata: [{ preferred_network: 'login.microsoftonline.com', preferred_cache: 'login.windows.net', aliases: ['login.microsoftonline.com', 'login.windows.net'] }] }),
};
const instance = new PublicClientApplication(config);
const actualAcquire = instance.acquireTokenSilent.bind(instance);
let interactiveLogins = 0;
let releaseToken: (() => Promise<void>) | undefined;
let sessionToken: Promise<string | null> | undefined;

function resultFor(email = 'pm@example.test'): AuthenticationResult {
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: clientId, iss: `${authority}/v2.0`, tid: tenant, oid: email,
    sub: email, preferred_username: email, name: email, iat: now, exp: now + 3600 };
  const encoded = (object: object) => btoa(JSON.stringify(object)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
  return {
    account: { homeAccountId: `${email}.${tenant}`, localAccountId: email, environment: 'login.windows.net',
      tenantId: tenant, username: email, name: email, idTokenClaims: claims },
    authority, uniqueId: email, tenantId: tenant, scopes: ['User.Read'], idTokenClaims: claims,
    idToken: `${encoded({ alg: 'none' })}.${encoded(claims)}.test`,
    accessToken: `synthetic-token-for-${email}`, fromCache: false, tokenType: 'Bearer',
    correlationId: crypto.randomUUID(), expiresOn: new Date((now + 3600) * 1000),
  };
}

// Only the identity-provider exchange is simulated. The SDK initializes, encrypts,
// stores, imports, reads and clears real MSAL caches in independent browser pages.
async function seed(email = 'pm@example.test') {
  await instance.initialize();
  beginCmsSignIn();
  const result = resultFor(email);
  await instance.hydrateCache(result, { scopes: ['User.Read'], account: result.account });
  completeCmsSignIn(result.account.homeAccountId);
  instance.setActiveAccount(result.account);
  window.dispatchEvent(new StorageEvent('storage', { key: CMS_SESSION_KEY }));
}
instance.loginRedirect = async () => { interactiveLogins += 1; await seed(); };
instance.logoutRedirect = async () => { throw new Error('Must not sign out of Microsoft'); };
instance.logoutPopup = async () => { throw new Error('Must not sign out of Microsoft'); };

if (new URLSearchParams(location.search).has('expired')) {
  instance.acquireTokenSilent = async () => { throw new InteractionRequiredAuthError('login_required'); };
}
if (new URLSearchParams(location.search).has('slow')) {
  const initialize = instance.initialize.bind(instance);
  instance.initialize = async request => { await new Promise(resolve => setTimeout(resolve, 500)); await initialize(request); };
}

const testApi = {
  seed,
  interactiveLogins: () => interactiveLogins,
  accounts: () => instance.getAllAccounts().map(account => account.username),
  cacheLocation: () => config.cache?.cacheLocation,
  authHeader: () => api.defaults.headers.common.Authorization ?? null,
  getToken: async (): Promise<string | null> => null,
  holdToken: () => {
    instance.acquireTokenSilent = async () => new Promise(resolve => {
      releaseToken = async () => {
        const result = resultFor();
        await instance.hydrateCache(result, { scopes: ['User.Read'], account: result.account });
        resolve(result);
      };
    });
    sessionToken = testApi.getToken();
  },
  tokenIsPending: () => Boolean(releaseToken),
  finishToken: async () => { await releaseToken?.(); const result = await sessionToken; instance.acquireTokenSilent = actualAcquire; return result; },
};
Object.assign(window, { authTest: testApi });

function Pages() {
  const session = useAuth();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => { testApi.getToken = session.getToken; }, [session.getToken]);
  useEffect(() => {
    if (!session.loading && !session.isLoggedIn && path !== '/sign-in') router.replace('/sign-in');
  }, [session.loading, session.isLoggedIn, path, router]);
  if (path === '/' || (path === '/sign-in' && session.isLoggedIn)) return <RoleDashboardRedirect />;
  return <main>
    <AuthApiSync />
    <h1>{session.isLoggedIn ? 'Protected CMS page' : 'CMS sign-in'}</h1>
    <p data-testid="account">{session.user?.email ?? 'Signed out'}</p>
    {session.isLoggedIn ? <button onClick={() => void session.logout()}>Sign Out</button> :
      <button onClick={() => void session.login()}>Sign in with Microsoft</button>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<MsalProvider instance={instance}><AuthProvider><Pages /></AuthProvider></MsalProvider>);
