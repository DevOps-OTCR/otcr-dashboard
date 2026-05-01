"use client"
import {
  BrowserAuthError,
  InteractionRequiredAuthError,
  InteractionStatus,
} from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import FullScreenLoader from "./LoadingScreen";
import { ThemeProvider } from "../ThemeProvider";
import { clearRoleCache } from "@/lib/permissions";
import { clearProjectsCache } from "@/lib/api";

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
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
  
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;

    const checkAuth = async () => {
      try {
        // MSAL v4+ requires this before acquireTokenSilent / redirects; avoids
        // BrowserAuthError: uninitialized_public_client_application on first navigation.
        await instance.initialize();

        const result = await instance.handleRedirectPromise();
        const account = result?.account ?? accounts[0];

        if (account) {
          instance.setActiveAccount(account);
          const claims = account.idTokenClaims as
            | { name?: string; given_name?: string; family_name?: string }
            | undefined;
          const claimName = [claims?.given_name, claims?.family_name]
            .filter(Boolean)
            .join(' ')
            .trim();
          setUser({
            email: account.username,
            name: claimName || claims?.name || account.name || undefined,
          });
          setIsLoggedIn(true);
        } else {
          setIsLoggedIn(false);
          setUser(null);
        }
      } catch (e) {
        console.error("Auth check failed", e);
      } finally {
        setIsAuthReady(true);
      }
    };

    checkAuth();
  }, [instance, accounts, inProgress]);

  const login = useCallback(async () => {
    await instance.initialize();
    await instance.loginRedirect({
      scopes: ["openid", "profile", "email", "User.Read"],
    });
  }, [instance]);

  const logout = useCallback(async () => {
    clearRoleCache(user?.email ?? null);
    clearProjectsCache();

    // 1. Clear your local React state
    setUser(null);
    setIsLoggedIn(false);

    // 2. MANUALLY wipe the NextAuth cookies so the Middleware stops seeing them
    // This is the "secret sauce" to stop the unauthorized access
    document.cookie = "next-auth.session-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "__Secure-next-auth.session-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

    // 3. Trigger MSAL logout to clear the Microsoft server session
    await instance.initialize();
    await instance.logoutRedirect({
        postLogoutRedirectUri: `${window.location.origin}${basePath}/sign-in`,
    });
    }, [basePath, instance, user?.email]);

  const getToken = useCallback(async () => {
    await instance.initialize();

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
      return res.accessToken;
    } catch (err) {
      if (err instanceof BrowserAuthError && err.errorCode === "timed_out") {
        try {
          const forceRefreshRes = await instance.acquireTokenSilent({
            ...tokenRequest,
            forceRefresh: true,
          });
          return forceRefreshRes.accessToken;
        } catch (refreshError) {
          console.error("MSAL force-refresh token acquisition failed:", refreshError);
          return null;
        }
      }

      if (err instanceof InteractionRequiredAuthError) {
        try {
          const res = await instance.acquireTokenPopup(tokenRequest);
          return res.accessToken;
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

  const isLoading = inProgress !== InteractionStatus.None || !isAuthReady;

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn,
        user,
        loading: isLoading, 
        login,
        logout,
        getToken,
      }}
    >
      {isLoading ? (
        <ThemeProvider>
          <FullScreenLoader />
        </ThemeProvider>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};
