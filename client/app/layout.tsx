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
import CookieConsentWrapper from "@/components/cookie-consent-wrapper";
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

  icons: {
    icon: [
      { url: "/favicon.ico?v=2", sizes: "any" },
      { url: "/favicon-16x16.png?v=2", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png?v=2", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png?v=2",
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
              <CookieConsentWrapper />
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
                    name: "Feedback",
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
