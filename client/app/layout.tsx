import type React from "react";
import Script from "next/script";
import type { Metadata, Viewport } from "next";
import { Courier_Prime, IBM_Plex_Mono, Special_Elite } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import DevModelPanel from "@/components/dev-model-panel";
import { ThemeProvider } from "next-themes";
import { SettingsProvider } from "@/contexts/settings-context";
import { CookieConsentProvider } from "@/contexts/cookie-consent-context";
import TextSizeProvider from "@/components/text-size-provider";
import NotificationProvider from "@/components/notification-provider";
import ConditionalAnalytics from "@/components/conditional-analytics";
import CookieConsent from "@/components/chrome/cookie-consent";
import InstallPrompt from "@/components/chrome/install-prompt";
import OfflineBanner from "@/components/chrome/offline-banner";
import { ThemeColorSync } from "@/components/chrome/theme-toggle";
import { LoggerProvider } from "@/contexts/logger-context";
import { LoggingErrorBoundary } from "@/components/error-boundary";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from "@/components/ui/sonner";
import { PwaInstallProvider } from "@/contexts/pwa-install-context";

const specialElite = Special_Elite({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-special-elite",
});
const courierPrime = Courier_Prime({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-courier-prime",
});
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
});

export const viewport: Viewport = {
  themeColor: "#070504",
  width: "device-width",
  initialScale: 1,
};

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
  },

  // Twitter Card metadata
  twitter: {
    card: "summary_large_image",
    title: "AI Courtroom - AI-Powered Legal Simulation",
    description:
      "Experience the future of legal education. Argue your case, challenge the AI, and step into the courtroom where justice is decided.",
    creator: "@aicourtroom",
  },

  // Application metadata
  applicationName: "AI Courtroom",
  appleWebApp: {
    capable: true,
    title: "AI Courtroom",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },

  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",

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
      <head>
        {/* Runs before hydration so an early beforeinstallprompt isn't missed.
            next/script, because React never runs a raw <script> it renders. */}
        <Script id="pwa-install-capture" strategy="beforeInteractive">
          {`
            window.__deferredPrompt = null;
            window.__appInstalled = false;
            window.addEventListener('beforeinstallprompt', (e) => {
              e.preventDefault();
              window.__deferredPrompt = e;
            });
            window.addEventListener('appinstalled', () => {
              window.__appInstalled = true;
            });
          `}
        </Script>
      </head>
      <body
        className={`${specialElite.variable} ${courierPrime.variable} ${plexMono.variable} font-type`}
        suppressHydrationWarning
      >
        {/* data-theme drives the design tokens; the "dark" class keeps not-yet-redesigned pages working */}
        <ThemeProvider
          attribute={["data-theme", "class"]}
          defaultTheme="dark"
          enableSystem
          storageKey="aiCourtroom-theme"
        >
          <ThemeColorSync />
          <CookieConsentProvider>
            <SettingsProvider>
              <TextSizeProvider>
                <GoogleOAuthProvider
                  clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""}
                >
                  <AuthProvider>
                    <LoggerProvider>
                      <LoggingErrorBoundary>
                        <NotificationProvider>
                          <PwaInstallProvider>
                            {children}
                            <InstallPrompt />
                          </PwaInstallProvider>
                          <OfflineBanner />
                          <DevModelPanel />
                        </NotificationProvider>
                      </LoggingErrorBoundary>
                    </LoggerProvider>
                  </AuthProvider>
                </GoogleOAuthProvider>
              </TextSizeProvider>
              <ConditionalAnalytics />
              <Toaster />
              <CookieConsent />
            </SettingsProvider>
          </CookieConsentProvider>
        </ThemeProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: "AI Courtroom",
                alternateName: ["AI-Courtroom", "AICourtroom"],
                url: "https://ai-courtroom.vercel.app/",
              },
              {
                "@context": "https://schema.org",
                "@type": "ItemList",
                itemListElement: [
                  {
                    "@type": "SiteNavigationElement",
                    position: 1,
                    name: "Register",
                    description:
                      "Create your account to start simulating legal cases.",
                    url: "https://ai-courtroom.vercel.app/register",
                  },
                  {
                    "@type": "SiteNavigationElement",
                    position: 2,
                    name: "Login",
                    description:
                      "Access your dashboard and continue your cases.",
                    url: "https://ai-courtroom.vercel.app/login",
                  },
                  {
                    "@type": "SiteNavigationElement",
                    position: 3,
                    name: "Contact Us",
                    description:
                      "Contact us or provide feedback about the platform.",
                    url: "https://ai-courtroom.vercel.app/contact",
                  },
                  {
                    "@type": "SiteNavigationElement",
                    position: 4,
                    name: "Dashboard",
                    description:
                      "Manage your legal cases and view simulation history.",
                    url: "https://ai-courtroom.vercel.app/dashboard/cases",
                  },
                ],
              },
              {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                name: "AI Courtroom",
                applicationCategory: "EducationalApplication",
                operatingSystem: "Web",
                offers: {
                  "@type": "Offer",
                  price: "0",
                  priceCurrency: "USD",
                },
              },
            ]),
          }}
        />
      </body>
    </html>
  );
}
