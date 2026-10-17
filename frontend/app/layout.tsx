'use client';

import { DashboardShell } from '@/components/DashboardShell';
import { AuthApiSync } from '@/components/AuthApiSync';
import "./globals.css";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { AuthProvider } from "../components/AuthContext";
import { ThemeProvider, themeInitScript } from "../components/ThemeProvider";
import { ReactNode, useMemo } from "react";
import { msalConfig } from '@/lib/msal-config';

export default function MsalWrapper({ children }: { children: ReactNode }) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");

  // We initialize the PCA inside useMemo so it only creates one instance 
  // and only runs in the browser.
  const pca = useMemo(() => new PublicClientApplication(msalConfig(origin, basePath)), [basePath, origin]);

  return (
    // The theme script sets the class/color-scheme on <html> before hydration.
    <html suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <MsalProvider instance={pca}>
            <AuthProvider>
              <AuthApiSync />
              <DashboardShell>{children}</DashboardShell>
            </AuthProvider>
          </MsalProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
