import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SessionProvider } from '@/components/SessionProvider';
import { AuthApiSync } from '@/components/AuthApiSync';
import "./globals.css";

export const metadata: Metadata = {
  title: "OTCR Dashboard",
  description: "Project Management & Team Collaboration Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <SessionProvider>
          <AuthApiSync />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
