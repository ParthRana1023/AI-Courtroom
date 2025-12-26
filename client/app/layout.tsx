import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { SettingsProvider } from "@/contexts/settings-context";
import TextSizeProvider from "@/components/text-size-provider";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { GoogleOAuthProvider } from "@react-oauth/google";

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
            <TextSizeProvider>
              <GoogleOAuthProvider
                clientId={
                  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
                  "740807115190-urqjuvvjihj4b1etl77e65ht1hc6f9sh.apps.googleusercontent.com"
                }
              >
                <AuthProvider>{children}</AuthProvider>
              </GoogleOAuthProvider>
            </TextSizeProvider>
            <SpeedInsights />
            <Analytics />
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
