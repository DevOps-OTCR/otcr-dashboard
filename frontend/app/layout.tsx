'use client';

import { AuthApiSync } from '@/components/AuthApiSync';
import "./globals.css";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { AuthProvider } from "../components/AuthContext";
import { ReactNode, useMemo } from "react";

export default function MsalWrapper({ children }: { children: ReactNode }) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  // We initialize the PCA inside useMemo so it only creates one instance 
  // and only runs in the browser.
  const pca = useMemo(() => new PublicClientApplication({
    auth: {
<<<<<<< HEAD
      clientId: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || "294bcae4-d5c3-44e2-9e06-06cc230a9bfd",
      authority: process.env.NEXT_PUBLIC_MSAL_AUTHORITY || "https://login.microsoftonline.com/44467e6f-462c-4ea2-823f-7800de5434e3",
      redirectUri: process.env.NEXT_PUBLIC_MSAL_REDIRECT_URI || `${origin}/auth/callback`,
      postLogoutRedirectUri: `${origin}/sign-in`,
=======
      clientId: '294bcae4-d5c3-44e2-9e06-06cc230a9bfd',
      authority: 'https://login.microsoftonline.com/44467e6f-462c-4ea2-823f-7800de5434e3',
      redirectUri: process.env.NEXT_PUBLIC_MSAL_REDIRECT_URI || 'https://otcr-dashboard-qa.vercel.app/auth/callback',
      postLogoutRedirectUri: process.env.NEXT_PUBLIC_MSAL_POST_LOGOUT_REDIRECT_URI || 'https://otcr-dashboard-qa.vercel.app/sign-in',
>>>>>>> origin/main
    },
    cache: {
      cacheLocation: "sessionStorage",
    },
  }), [origin]);

  return (
    <html>
      <body>
        <MsalProvider instance={pca}>
          <AuthProvider>
            <AuthApiSync />
            {children}
          </AuthProvider>
        </MsalProvider>
      </body>
    </html>
  );
}
