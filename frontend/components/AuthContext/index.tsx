"use client"
import {
  InteractionRequiredAuthError,
  InteractionStatus,
  EventType,
  type AuthenticationResult,
} from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import { useRouter } from 'next/navigation';
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  Fragment,
} from "react";
import { CMS_SESSION_KEY, readCmsSession, cmsSessionRevision, beginCmsSignIn, completeCmsSignIn, markCmsSignedOut, onSharedCmsSignIn, shareCmsSignIn, withAuthTimeout } from '@/lib/cms-session';
import FullScreenLoader from "./LoadingScreen";
import { clearRoleCache } from "@/lib/permissions";
import { clearProjectsCache, setAuthToken } from "@/lib/api";
import { setResourceCacheScope } from '@/lib/resource-cache';
import { clearNavigationSnapshots } from "@/lib/navigation-cache";

type AuthUser = {
  email?: string;
  name?: string;
};

interface AuthContextType {
  isLoggedIn: boolean;
  user: AuthUser | null;
  loading: boolean; 
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { instance, accounts, inProgress } = useMsal();
  const router = useRouter();
  const signedOut = useRef(false);
  const authGeneration = useRef(0);
  const handledRedirect = useRef(false);
  const sharedCacheReady = useRef<{ revision: string; promise: Promise<void> } | null>(null);
  // A shared result can arrive before this tab sees the new session marker. Its import
  // is kept for that session's storage notification to wait on, until a sign-out.
  const earlyImport = useRef<{ accountId: string; promise: Promise<void> } | null>(null);
  const [sessionChange, setSessionChange] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  const [isAuthReady, setIsAuthReady] = useState(false);
  const previousEmail = useRef<string | undefined>(undefined);

  // Scope page caches before rendering a different account's content.
  const scopeCaches = useCallback((email: string | undefined) => {
    if (previousEmail.current === email) return;
    clearProjectsCache();
    setResourceCacheScope(email);
    clearNavigationSnapshots();
    previousEmail.current = email;
  }, []);

  useEffect(() => {
    scopeCaches(user?.email);
  }, [scopeCaches, user?.email]);

  const clearAppSession = useCallback(() => {
    signedOut.current = true;
    sharedCacheReady.current = null;
    authGeneration.current += 1;
    clearRoleCache(previousEmail.current ?? null);
    clearProjectsCache();
    clearNavigationSnapshots();
    setResourceCacheScope();
    setAuthToken(null);
    sessionStorage.removeItem('otcr_profile_sync_fingerprint');
    setUser(null);
    setIsLoggedIn(false);
    setIsAuthReady(true);
    setAuthError(null);
  }, []);

  const requireSignIn = useCallback(() => {
    clearAppSession();
    router.replace('/sign-in');
  }, [clearAppSession, router]);

  useEffect(() => {
    let sharedSignIn: { result: AuthenticationResult; fromThisTab: boolean } | null = null;
    let finishSharedSignIn: (() => void) | undefined;
    let waitingAccountId: string | undefined;
    let disposed = false;
    const restoreSharedSignIn = () => {
      const session = readCmsSession();
      const result = sharedSignIn?.result;
      const fromThisTab = Boolean(sharedSignIn?.fromThisTab);
      if (!result?.account || session?.signedOut || session?.accountId !== result.account.homeAccountId) return;
      sharedSignIn = null;
      const revision = session.revision;
      // Storage notifications can precede MSAL's cache broadcast. Import the
      // completed result before reading this tab's cache.
      const accountId = result.account.homeAccountId;
      const waiting = Boolean(finishSharedSignIn) && waitingAccountId === accountId;
      // The signing tab already holds these tokens. Rewriting them while another tab
      // imports can drop them from MSAL's read-modify-write token index.
      const promise = fromThisTab ? Promise.resolve()
        : withAuthTimeout(instance.hydrateCache(result, { account: result.account, scopes: result.scopes }));
      sharedCacheReady.current = { revision, promise };
      earlyImport.current = waiting ? null : { accountId, promise };
      void promise.then(async () => {
        if (readCmsSession()?.signedOut) await instance.clearCache();
        else if (!disposed && cmsSessionRevision() === revision) setSessionChange(value => value + 1);
      }).catch(() => {
        if (!disposed && cmsSessionRevision() === revision) setAuthError('We could not restore your sign-in. Please retry.');
      }).finally(() => {
        // Release the session waiting for this account, even if it arrived mid-import.
        if (waitingAccountId !== accountId) return;
        finishSharedSignIn?.();
        finishSharedSignIn = undefined;
        waitingAccountId = undefined;
      });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CMS_SESSION_KEY && event.key !== null) return;
      if (readCmsSession()?.signedOut) {
        sharedSignIn = null;
        earlyImport.current = null;
        const revision = cmsSessionRevision();
        requireSignIn();
        // Clear this tab's in-memory MSAL cache too, without contacting Microsoft.
        void instance.initialize().then(async () => {
          if (cmsSessionRevision() === revision && readCmsSession()?.signedOut) {
            instance.setActiveAccount(null);
            await instance.clearCache();
          }
        }).catch(() => { /* The durable sign-out marker still blocks restoration. */ });
      } else {
        signedOut.current = false;
        authGeneration.current += 1;
        // Hide the previous account while the new shared session is validated.
        setAuthToken(null);
        setUser(null);
        setIsLoggedIn(false);
        setIsAuthReady(false);
        setAuthError(null);
        const session = readCmsSession();
        const revision = session?.revision ?? '';
        if (earlyImport.current && earlyImport.current.accountId === session?.accountId) {
          sharedCacheReady.current = { revision, promise: earlyImport.current.promise };
        } else if (sharedCacheReady.current?.revision !== revision) {
          waitingAccountId = session?.accountId;
          sharedCacheReady.current = { revision, promise: new Promise(resolve => { finishSharedSignIn = resolve; }) };
        }
        earlyImport.current = null;
        restoreSharedSignIn();
        setSessionChange(value => value + 1);
      }
    };
    const onPageShow = () => {
      if (readCmsSession()?.signedOut) requireSignIn();
      else setSessionChange(value => value + 1);
    };
    // MSAL's own LOGIN_SUCCESS is not used here: in v5 its payload is only the
    // account, and it fires inside handleRedirectPromise, so a throw fails sign-in.
    const stopSharedSignIn = onSharedCmsSignIn((result, fromThisTab) => {
      sharedSignIn = { result, fromThisTab };
      restoreSharedSignIn();
    });
    // MSAL v5 broadcasts active-account changes; account arrays alone do not
    // change when switching between two accounts already in the cache.
    const callbackId = instance.addEventCallback(message => {
      if (message.eventType === EventType.ACTIVE_ACCOUNT_CHANGED) {
        setSessionChange(value => value + 1);
      }
    });
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      disposed = true;
      stopSharedSignIn();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onPageShow);
      if (callbackId) instance.removeEventCallback(callbackId);
    };
  }, [instance, requireSignIn]);

  useEffect(() => {
    if (isAuthReady) return;
    const timer = window.setTimeout(() => {
      setAuthError('Sign-in could not finish. Please retry.');
    }, 20000);
    return () => window.clearTimeout(timer);
  }, [isAuthReady]);

  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;
    let cancelled = false;
    const generation = authGeneration.current;
    let revision = cmsSessionRevision();
    const isCurrent = () => !cancelled && generation === authGeneration.current && revision === cmsSessionRevision();
    const checkAuth = async () => {
      try {
        await withAuthTimeout(instance.initialize());
        if (!isCurrent()) return;
        const result = await withAuthTimeout(instance.handleRedirectPromise());
        if (cancelled || generation !== authGeneration.current) return;
        if (result?.account && !handledRedirect.current) {
          handledRedirect.current = true;
          if (!completeCmsSignIn(result.account.homeAccountId)) {
            requireSignIn();
            if (readCmsSession()?.signedOut) await instance.clearCache();
            return;
          }
          signedOut.current = false;
          revision = cmsSessionRevision();
          shareCmsSignIn(result);
        }
        if (!isCurrent()) return;
        if (signedOut.current || readCmsSession()?.signedOut) {
          clearAppSession();
          return;
        }
        if (sharedCacheReady.current) await withAuthTimeout(sharedCacheReady.current.promise);
        if (!isCurrent()) return;
        const preferred = readCmsSession()?.accountId;
        const account = preferred
          ? instance.getAllAccounts().find(account => account.homeAccountId === preferred)
          : instance.getActiveAccount() ?? instance.getAllAccounts()[0];
        if (!account) {
          scopeCaches(undefined);
          setUser(null);
          setIsLoggedIn(false);
          return;
        }
        // A cached account is not proof that its session can still acquire tokens.
        // Silent renewal does not open a popup or redirect a background tab.
        await withAuthTimeout(instance.acquireTokenSilent({ account, scopes: ['User.Read'] }));
        if (!isCurrent() || signedOut.current || readCmsSession()?.signedOut) {
          if (readCmsSession()?.signedOut) await instance.clearCache();
          return;
        }
        if (instance.getActiveAccount()?.homeAccountId !== account.homeAccountId) instance.setActiveAccount(account);
        const claims = account.idTokenClaims as { name?: string; given_name?: string; family_name?: string } | undefined;
        const claimName = [claims?.given_name, claims?.family_name].filter(Boolean).join(' ').trim();
        const nextUser = { email: account.username, name: claimName || claims?.name || account.name || undefined };
        scopeCaches(nextUser.email);
        setUser(current => current?.email === nextUser.email && current?.name === nextUser.name ? current : nextUser);
        setIsLoggedIn(true);
        setAuthError(null);
      } catch (error) {
        if (!isCurrent()) return;
        if (error instanceof InteractionRequiredAuthError) requireSignIn();
        else setAuthError('We could not restore your sign-in. Please retry.');
      } finally {
        if (!cancelled) setIsAuthReady(true);
      }
    };
    void checkAuth();
    return () => { cancelled = true; };
  }, [instance, accounts, inProgress, sessionChange, clearAppSession, requireSignIn, scopeCaches]);

  const login = useCallback(async () => {
    await withAuthTimeout(instance.initialize());
    beginCmsSignIn();
    signedOut.current = false;
    authGeneration.current += 1;
    await instance.loginRedirect({ scopes: ['openid', 'profile', 'email', 'User.Read'] });
  }, [instance]);

  const logout = useCallback(async () => {
    // Only an explicit sign-out forgets an early import; routine signed-out
    // checks can run while another tab's sign-in is still arriving.
    earlyImport.current = null;
    clearAppSession();
    try {
      try { markCmsSignedOut(); } catch { /* Local cleanup must still run if storage is unavailable. */ }
      await withAuthTimeout(instance.initialize());
      instance.setActiveAccount(null);
      await withAuthTimeout(instance.clearCache());
    } finally {
      router.replace('/sign-in');
    }
  }, [clearAppSession, instance, router]);

  const getToken = useCallback(async () => {
    const generation = authGeneration.current;
    const revision = cmsSessionRevision();
    const isCurrent = () => !signedOut.current && !readCmsSession()?.signedOut &&
      generation === authGeneration.current && revision === cmsSessionRevision();
    // Reject cancelled work so callers cannot turn a null token into an email credential.
    const cancelledRequest = () => new DOMException('Authentication session changed', 'AbortError');
    if (!isCurrent()) throw cancelledRequest();
    await withAuthTimeout(instance.initialize());
    if (sharedCacheReady.current) await withAuthTimeout(sharedCacheReady.current.promise);
    if (!isCurrent()) throw cancelledRequest();
    const account = instance.getActiveAccount();
    if (!account) return null;
    const preferredAccount = readCmsSession()?.accountId;
    if (preferredAccount && preferredAccount !== account.homeAccountId) throw cancelledRequest();
    try {
      const result = await withAuthTimeout(instance.acquireTokenSilent({
        account, scopes: ['User.Read'], authority: process.env.NEXT_PUBLIC_MSAL_AUTHORITY,
      }));
      if (isCurrent()) return result.accessToken;
      if (readCmsSession()?.signedOut) await instance.clearCache();
      throw cancelledRequest();
    } catch (error) {
      if (!isCurrent()) throw cancelledRequest();
      if (error instanceof InteractionRequiredAuthError) requireSignIn();
      // Let callers stop their requests instead of falling back to stale identity.
      throw error;
    }
  }, [instance, requireSignIn]);

  // Later token operations must not unmount the current page.
  const isLoading = !isAuthReady;
  const contextValue = useMemo(() => ({
    isLoggedIn, user, loading: isLoading, login, logout, getToken,
  }), [isLoggedIn, user, isLoading, login, logout, getToken]);

  return (
    <AuthContext.Provider
      value={contextValue}
    >
      {authError ? (
        <main className="min-h-screen flex items-center justify-center p-6">
          <section role="alert" className="max-w-md text-center">
            <h1 className="text-xl font-semibold">Unable to finish sign-in</h1>
            <p className="my-4">{authError}</p>
            <button type="button" onClick={() => window.location.reload()} className="rounded bg-[#003360] px-5 py-2 text-white">Retry sign-in</button>
          </section>
        </main>
      ) : isLoading ? (
        <FullScreenLoader />
      ) : (
        <Fragment key={user?.email ?? 'signed-out'}>{children}</Fragment>
      )}
    </AuthContext.Provider>
  );
};
