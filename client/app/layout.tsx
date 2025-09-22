import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { SettingsProvider } from "@/contexts/settings-context";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Courtroom",
  description: "AI-powered courtroom simulation for legal proceedings",
  generator: "v0.dev",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider defaultTheme="system" storageKey="ai-courtroom-theme">
          <SettingsProvider>
            <AuthProvider>{children}</AuthProvider>
            <SpeedInsights />
            <Analytics />
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import "./globals.css";
