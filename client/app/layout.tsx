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

// Debug: Log environment variables (server-side during build)
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
console.log("🔧 Frontend Environment Variables Debug:");
console.log(
  `  NEXT_PUBLIC_GOOGLE_CLIENT_ID: ${
    googleClientId
      ? "✅ Set (" + googleClientId.substring(0, 20) + "...)"
      : "❌ NOT SET - using fallback"
  }`
);
console.log(
  `  NEXT_PUBLIC_API_URL: ${
    apiUrl ? "✅ Set (" + apiUrl + ")" : "❌ NOT SET - using localhost"
  }`
);

export const metadata: Metadata = {
  title: "AI Courtroom",
  description: "AI-powered courtroom simulation for legal proceedings",
  generator: "v0.dev",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
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
                clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""}
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
