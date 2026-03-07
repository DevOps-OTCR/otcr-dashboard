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
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
  const withBasePath = (path: string) => `${origin}${basePath}${path}`;

  // We initialize the PCA inside useMemo so it only creates one instance 
  // and only runs in the browser.
  const pca = useMemo(() => new PublicClientApplication({
    auth: {
      clientId: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || "294bcae4-d5c3-44e2-9e06-06cc230a9bfd",
      authority: process.env.NEXT_PUBLIC_MSAL_AUTHORITY || "https://login.microsoftonline.com/44467e6f-462c-4ea2-823f-7800de5434e3",
      // Always derive callback from deployed origin + base path to avoid secret drift.
      redirectUri: withBasePath("/auth/callback"),
      postLogoutRedirectUri: withBasePath("/sign-in"),
    },
    cache: {
      cacheLocation: "sessionStorage",
    },
  }), [basePath, origin]);

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
