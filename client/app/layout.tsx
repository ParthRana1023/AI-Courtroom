import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { SettingsProvider } from "@/contexts/settings-context";
import { CookieConsentProvider } from "@/contexts/cookie-consent-context";
import TextSizeProvider from "@/components/text-size-provider";
import NotificationProvider from "@/components/notification-provider";
import ConditionalAnalytics from "@/components/conditional-analytics";
import CookieConsentBanner from "@/components/cookie-consent-banner";
import CookieSettingsModal from "@/components/cookie-settings-modal";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

export const metadata: Metadata = {
  // Basic metadata
  title: {
    default: "AI Courtroom - AI-Powered Legal Simulation Platform",
    template: "%s | AI Courtroom",
  },
  description:
    "Experience the future of legal education and practice. AI Courtroom offers realistic AI-powered courtroom simulations where you can argue cases, challenge AI opponents, and sharpen your legal skills.",
  keywords: [
    "AI courtroom",
    "legal simulation",
    "courtroom simulator",
    "AI legal",
    "law practice",
    "legal education",
    "mock trial",
    "legal training",
  ],
  authors: [{ name: "AI Courtroom Team" }],
  creator: "AI Courtroom",
  publisher: "AI Courtroom",

  // Site verification and indexing
  metadataBase: new URL("https://ai-courtroom.vercel.app"),
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // Open Graph metadata (for Google, Facebook, LinkedIn, etc.)
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://ai-courtroom.vercel.app",
    siteName: "AI Courtroom",
    title: "AI Courtroom - AI-Powered Legal Simulation Platform",
    description:
      "Experience the future of legal education. Argue your case, challenge the AI, and step into the courtroom where justice is decided.",
    images: [
      {
        url: "/android-chrome-512x512.png",
        width: 512,
        height: 512,
        alt: "AI Courtroom Logo",
      },
    ],
  },

  // Twitter Card metadata
  twitter: {
    card: "summary_large_image",
    title: "AI Courtroom - AI-Powered Legal Simulation",
    description:
      "Experience the future of legal education. Argue your case, challenge the AI, and step into the courtroom where justice is decided.",
    images: ["/android-chrome-512x512.png"],
    creator: "@aicourtroom",
  },

  // Application metadata
  applicationName: "AI Courtroom",
  appleWebApp: {
    capable: true,
    title: "AI Courtroom",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },

  // Icons
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    other: [
      {
        rel: "mask-icon",
        url: "/favicon.ico",
      },
    ],
  },
  manifest: "/site.webmanifest",

  // Site verification
  verification: {
    google: "JtQO7rsIxmvzAg2OC66y4o_MVUS2MGoGEAuqubjosxE",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider defaultTheme="system" storageKey="ai-courtroom-theme">
          <CookieConsentProvider>
            <SettingsProvider>
              <TextSizeProvider>
                <GoogleOAuthProvider
                  clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""}
                >
                  <AuthProvider>
                    <NotificationProvider>{children}</NotificationProvider>
                  </AuthProvider>
                </GoogleOAuthProvider>
              </TextSizeProvider>
              <ConditionalAnalytics />
              <Toaster richColors position="bottom-right" />
              <CookieConsentBanner />
              <CookieSettingsModal />
            </SettingsProvider>
          </CookieConsentProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
