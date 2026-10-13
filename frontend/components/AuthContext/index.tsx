"use client"
import {
  BrowserAuthError,
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

  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;
    let cancelled = false;
    const generation = authGeneration.current;

    const checkAuth = async () => {
      try {
        // MSAL v4+ requires this before acquireTokenSilent / redirects; avoids
        // BrowserAuthError: uninitialized_public_client_application on first navigation.
        await instance.initialize();
        if (cancelled || signedOut.current || generation !== authGeneration.current) return;

        await instance.handleRedirectPromise();
        if (cancelled || signedOut.current || generation !== authGeneration.current) {
          // A redirect response that finished during sign-out may have populated the cache.
          if (signedOut.current) await instance.clearCache();
          return;
        }
        // Read the live cache; MSAL React and redirect results can retain old accounts.
        const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];

        if (account) {
          instance.setActiveAccount(account);
          const claims = account.idTokenClaims as
            | { name?: string; given_name?: string; family_name?: string }
            | undefined;
          const claimName = [claims?.given_name, claims?.family_name]
            .filter(Boolean)
            .join(' ')
            .trim();
          const nextUser = {
            email: account.username,
            name: claimName || claims?.name || account.name || undefined,
          };
          setUser(current => current?.email === nextUser.email && current?.name === nextUser.name ? current : nextUser);
          setIsLoggedIn(true);
        } else {
          setIsLoggedIn(false);
          setUser(null);
        }
      } catch (e) {
        console.error("Auth check failed", e);
      } finally {
        if (!cancelled) setIsAuthReady(true);
      }
    };

    void checkAuth();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void checkAuth();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [instance, accounts, inProgress]);

  const login = useCallback(async () => {
    await instance.initialize();
    signedOut.current = false;
    authGeneration.current += 1;
    await instance.loginRedirect({
      scopes: ["openid", "profile", "email", "User.Read"],
    });
  }, [instance]);

  const logout = useCallback(async () => {
    signedOut.current = true;
    authGeneration.current += 1;
    clearRoleCache(user?.email ?? null);
    clearProjectsCache();
    clearNavigationSnapshots();
    setResourceCacheScope();
    setAuthToken(null);
    sessionStorage.removeItem('otcr_profile_sync_fingerprint');

    setUser(null);
    setIsLoggedIn(false);

    // MSAL's local cache API leaves the Microsoft identity-provider session intact.
    await instance.initialize();
    instance.setActiveAccount(null);
    await instance.clearCache();
    // Next's router applies the configured base path and replaces the protected URL.
    router.replace('/sign-in');
  }, [instance, router, user?.email]);

  const getToken = useCallback(async () => {
    const generation = authGeneration.current;
    const isCurrent = () => !signedOut.current && generation === authGeneration.current;
    const takeToken = async (token: string) => {
      if (isCurrent()) return token;
      // MSAL can cache a refresh response that arrives after local sign-out.
      if (signedOut.current) await instance.clearCache();
      return null;
    };
    if (!isCurrent()) return null;
    await instance.initialize();
    if (!isCurrent()) return null;

    const account = instance.getActiveAccount();
    if (!account) return null;

    const tokenRequest = {
      account,
      scopes: ["User.Read"],
      authority: process.env.NEXT_PUBLIC_MSAL_AUTHORITY,
      forceRefresh: false,
    };

    try {
      const res = await instance.acquireTokenSilent(tokenRequest);
      return await takeToken(res.accessToken);
    } catch (err) {
      if (!isCurrent()) return null;
      if (err instanceof BrowserAuthError && err.errorCode === "timed_out") {
        try {
          const forceRefreshRes = await instance.acquireTokenSilent({
            ...tokenRequest,
            forceRefresh: true,
          });
          return await takeToken(forceRefreshRes.accessToken);
        } catch (refreshError) {
          console.error("MSAL force-refresh token acquisition failed:", refreshError);
          return null;
        }
      }

      if (err instanceof InteractionRequiredAuthError) {
        try {
          const res = await instance.acquireTokenPopup(tokenRequest);
          return await takeToken(res.accessToken);
        } catch (popupError) {
          if (
            popupError instanceof BrowserAuthError &&
            (popupError.errorCode === "popup_window_error" ||
              popupError.errorCode === "timed_out")
          ) {
            alert(
              "Token refresh requires a popup, but it was blocked or timed out. Allow popups for this site and try again."
            );
          }
          console.error("MSAL popup token acquisition failed:", popupError);
          return null;
        }
      }
      console.error("MSAL silent token acquisition failed:", err);
      return null;
    }
  }, [instance]);

  // Later token operations must not unmount the current page.
  const isLoading = !isAuthReady;
  const contextValue = useMemo(() => ({
    isLoggedIn, user, loading: isLoading, login, logout, getToken,
  }), [isLoggedIn, user, isLoading, login, logout, getToken]);

  return (
    <AuthContext.Provider
      value={contextValue}
    >
      {isLoading ? (
        <FullScreenLoader />
      ) : (
        <Fragment key={user?.email ?? 'signed-out'}>{children}</Fragment>
      )}
    </AuthContext.Provider>
  );
};
