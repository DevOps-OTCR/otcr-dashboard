"use client"
import {
  InteractionRequiredAuthError,
  InteractionStatus,
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
import { CMS_SESSION_KEY, readCmsSession, cmsSessionRevision, beginCmsSignIn, hasCurrentCmsSignInAttempt, completeCmsSignIn, markCmsSignedOut, withAuthTimeout } from '@/lib/cms-session';
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
  const documentSessionRevision = useRef(cmsSessionRevision());
  const [sessionChange, setSessionChange] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  const [isAuthReady, setIsAuthReady] = useState(false);
  const previousEmail = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (previousEmail.current !== user?.email) {
      clearProjectsCache();
      setResourceCacheScope(user?.email);
      clearNavigationSnapshots();
      previousEmail.current = user?.email;
    }
  }, [user?.email]);

  const clearAppSession = useCallback(() => {
    signedOut.current = true;
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

  const refreshChangedSession = useCallback(() => {
    if (cmsSessionRevision() === documentSessionRevision.current) return;
    // Import the completed sign-in cache through a fresh SDK instance. A lookup
    // during cross-tab synchronization can remove keys absent from memory.
    clearAppSession();
    setIsAuthReady(false);
    window.location.reload();
  }, [clearAppSession]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CMS_SESSION_KEY && event.key !== null) return;
      if (readCmsSession()?.signedOut) {
        const revision = cmsSessionRevision();
        requireSignIn();
        // Clear this tab's in-memory MSAL cache too, without contacting Microsoft.
        void instance.initialize().then(async () => {
          if (cmsSessionRevision() === revision && readCmsSession()?.signedOut) {
            instance.setActiveAccount(null);
            await instance.clearCache();
          }
        }).catch(() => { /* The durable sign-out marker still blocks restoration. */ });
      } else refreshChangedSession();
    };
    const onPageShow = () => {
      // A fresh explicit redirect must finish before the persisted sign-out
      // marker is replaced. A later cross-tab sign-out invalidates the attempt.
      if (readCmsSession()?.signedOut && hasCurrentCmsSignInAttempt()) return;
      if (readCmsSession()?.signedOut) requireSignIn();
      else if (cmsSessionRevision() !== documentSessionRevision.current) refreshChangedSession();
      else setSessionChange(value => value + 1);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [instance, requireSignIn, refreshChangedSession]);

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
          documentSessionRevision.current = revision;
        }
        if (!isCurrent()) return;
        if (signedOut.current || readCmsSession()?.signedOut) {
          clearAppSession();
          return;
        }
        if (revision !== documentSessionRevision.current) {
          refreshChangedSession();
          return;
        }
        const preferred = readCmsSession()?.accountId;
        const account = preferred
          ? instance.getAllAccounts().find(account => account.homeAccountId === preferred)
          : instance.getActiveAccount() ?? instance.getAllAccounts()[0];
        if (!account) {
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
        setUser(current => current?.email === nextUser.email && current?.name === nextUser.name ? current : nextUser);
        setIsLoggedIn(true);
        setAuthError(null);
      } catch (error) {
        if (!isCurrent()) return;
        if (error instanceof InteractionRequiredAuthError) requireSignIn();
        else setAuthError('We could not restore your sign-in. Please retry.');
      } finally {
        if (!cancelled && generation === authGeneration.current) setIsAuthReady(true);
      }
    };
    void checkAuth();
    return () => { cancelled = true; };
  }, [instance, accounts, inProgress, sessionChange, clearAppSession, requireSignIn, refreshChangedSession]);

  const login = useCallback(async () => {
    await withAuthTimeout(instance.initialize());
    beginCmsSignIn();
    signedOut.current = false;
    authGeneration.current += 1;
    await instance.loginRedirect({ scopes: ['openid', 'profile', 'email', 'User.Read'] });
  }, [instance]);

  const logout = useCallback(async () => {
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
      generation === authGeneration.current && revision === cmsSessionRevision() &&
      revision === documentSessionRevision.current;
    // Reject cancelled work so callers cannot turn a null token into an email credential.
    const cancelledRequest = () => new DOMException('Authentication session changed', 'AbortError');
    if (!isCurrent()) throw cancelledRequest();
    await withAuthTimeout(instance.initialize());
    if (!isCurrent()) throw cancelledRequest();
    const preferredAccount = readCmsSession()?.accountId;
    // The shared CMS selection is authoritative while SDK active-account
    // notifications from another tab are still being processed.
    const account = preferredAccount
      ? instance.getAllAccounts().find(account => account.homeAccountId === preferredAccount)
      : instance.getActiveAccount();
    if (!account) return null;
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

  // Wait for initial cache import, including after a persisted sign-out.
  // Later token operations must not unmount the current page.
  const isLoading = !isAuthReady || inProgress === InteractionStatus.Startup;
  // Notify token consumers even when batched session events retain the same user.
  const contextValue = useMemo(() => ({
    isLoggedIn, user, loading: isLoading, login, logout, getToken, sessionRevision: sessionChange,
  }), [isLoggedIn, user, isLoading, login, logout, getToken, sessionChange]);

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
            <button type="button" onClick={() => void logout()} className="ml-3 rounded border px-5 py-2">Return to sign-in</button>
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
