import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { InteractionStatus, PublicClientApplication, type AuthenticationResult } from '@azure/msal-browser';
import { usePathname, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/AuthContext';
import { api, setAuthToken } from '@/lib/api';
import { cachedRequest, readResource } from '@/lib/resource-cache';
import { readNavigationSnapshot, writeNavigationSnapshot } from '@/lib/navigation-cache';

const { MsalContext, navigate } = require('./routing.cjs');
const clientId = '00000000-0000-4000-8000-000000000001';
const tenantId = '00000000-0000-4000-8000-000000000002';
const authority = `https://login.microsoftonline.com/${tenantId}`;
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const instance = new PublicClientApplication({
  auth: {
    clientId, authority,
    redirectUri: location.origin + basePath + '/auth/callback',
    authorityMetadata: JSON.stringify({
      authorization_endpoint: authority + '/oauth2/v2.0/authorize',
      token_endpoint: authority + '/oauth2/v2.0/token',
      end_session_endpoint: authority + '/oauth2/v2.0/logout',
      issuer: authority + '/v2.0',
      jwks_uri: authority + '/discovery/v2.0/keys',
    }),
  },
  cache: { cacheLocation: 'sessionStorage' },
});

async function seedAccount(username: string) {
  const claims = { oid: username, sub: username, tid: tenantId, name: username, preferred_username: username,
    aud: clientId, iss: authority + '/v2.0', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const account = { homeAccountId: username + '.' + tenantId, localAccountId: username,
    environment: 'login.microsoftonline.com', tenantId, username, name: username, idTokenClaims: claims };
  await instance.hydrateCache({
    account, authority, uniqueId: username, tenantId, scopes: ['User.Read'], idTokenClaims: claims,
    idToken: encode({ alg: 'none' }) + '.' + encode(claims) + '.test-signature',
    accessToken: 'fixture-access-token-' + username, tokenType: 'Bearer', fromCache: false,
    expiresOn: new Date(Date.now() + 3600000), correlationId: crypto.randomUUID(),
  } as AuthenticationResult, { scopes: ['User.Read'] });
  return account;
}

function AuthState() {
  const session = useAuth();
  const path = usePathname()?.split('?')[0];
  const router = useRouter();
  useEffect(() => {
    (window as any).authenticationTest.getToken = session.getToken;
  }, [session.getToken]);
  useEffect(() => {
    if (!session.loading && !session.isLoggedIn && path !== '/sign-in') router.replace('/sign-in');
  }, [path, router, session.isLoggedIn, session.loading]);
  if (session.loading) return <p role="status">Initializing authentication</p>;
  return session.isLoggedIn ? <main>
    <p data-testid="auth-user">{session.user?.email}</p>
    <button onClick={() => void session.logout()}>Sign Out</button>
  </main> : <main><button onClick={() => void session.login()}>Sign In</button></main>;
}

async function start() {
  await instance.initialize();
  if (!sessionStorage.getItem('authentication-test-seeded')) {
    const first = await seedAccount('pm@example.test');
    await seedAccount('other@example.test');
    instance.setActiveAccount(first);
    sessionStorage.setItem('authentication-test-seeded', 'true');
  }
  (window as any).authenticationTest = {
    instance, navigate, seedAccount, readResource, readSnapshot: readNavigationSnapshot,
    seedApplicationCache: async () => {
      setAuthToken('fixture-api-token');
      localStorage.setItem('otcr_role_cache:pm@example.test', 'cached-role');
      sessionStorage.setItem('otcr_profile_sync_fingerprint', 'cached-profile');
      writeNavigationSnapshot('private-snapshot', { private: true });
      await cachedRequest('/private-resource', async () => ({ private: true }));
    },
    authHeader: () => api.defaults.headers.common.Authorization,
  };
  // Retain this array to model MSAL React's snapshot while the live MSAL cache changes.
  const accounts = instance.getAllAccounts();
  createRoot(document.getElementById('root')!).render(
    <MsalContext.Provider value={{ instance, accounts, inProgress: InteractionStatus.None }}>
      <AuthProvider><AuthState /></AuthProvider>
    </MsalContext.Provider>,
  );
}

void start();
