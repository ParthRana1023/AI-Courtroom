"use client";

import dynamic from "next/dynamic";

// Lazy load cookie components (not critical for initial render)
const CookieConsentBanner = dynamic(
  () => import("@/components/cookie-consent-banner"),
  { ssr: false }
);
const CookieSettingsModal = dynamic(
  () => import("@/components/cookie-settings-modal"),
  { ssr: false }
);

export default function CookieConsentWrapper() {
  return (
    <>
      <CookieConsentBanner />
      <CookieSettingsModal />
    </>
  );
}
