import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OTCR Dashboard",
  description: "Consulting organization dashboard for OTCR",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={`
            ${geistSans.variable}
            ${geistMono.variable}
            antialiased
            min-h-screen
            bg-gradient-to-br from-slate-50 via-white to-blue-50
            text-slate-800
          `}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
