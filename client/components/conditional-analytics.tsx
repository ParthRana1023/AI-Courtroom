"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { useCookieConsent } from "@/contexts/cookie-consent-context";

/**
 * Conditional analytics wrapper that only loads Vercel Analytics
 * and SpeedInsights when the user has consented to analytics cookies.
 */
export default function ConditionalAnalytics() {
  const { hasConsent } = useCookieConsent();

  // Only render analytics components if user has consented
  if (!hasConsent("analytics")) {
    return null;
  }

  return (
    <>
      <SpeedInsights />
      <Analytics />
    </>
  );
}
