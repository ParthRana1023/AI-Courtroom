"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  type CookieCategory,
  type CookieConsent,
  getStoredConsent,
  getDefaultConsent,
  saveConsent,
  clearNonEssentialCookies,
  CONSENT_VERSION,
} from "@/lib/cookies";

interface CookieConsentContextType {
  // Current consent state
  consent: CookieConsent;
  // Whether to show the consent banner
  showBanner: boolean;
  // Whether the settings modal is open
  showSettings: boolean;
  // Check if user has consented to a category
  hasConsent: (category: CookieCategory) => boolean;
  // Accept all cookies
  acceptAll: () => void;
  // Reject all non-essential cookies
  rejectAll: () => void;
  // Accept specific categories
  acceptCategories: (categories: CookieCategory[]) => void;
  // Update consent for all categories at once
  updateConsent: (
    updates: Partial<Omit<CookieConsent, "timestamp" | "version">>
  ) => void;
  // Open settings modal
  openSettings: () => void;
  // Close settings modal
  closeSettings: () => void;
  // Close the banner
  closeBanner: () => void;
  // Reset consent (for testing/debugging)
  resetConsent: () => void;
}

const CookieConsentContext = createContext<
  CookieConsentContextType | undefined
>(undefined);

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<CookieConsent>(getDefaultConsent);
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load stored consent on mount
  useEffect(() => {
    const storedConsent = getStoredConsent();
    if (storedConsent) {
      setConsent(storedConsent);
      setShowBanner(false);
    } else {
      // No consent stored, show banner
      setShowBanner(true);
    }
    setIsInitialized(true);
  }, []);

  // Check if user has consented to a specific category
  const hasConsent = useCallback(
    (category: CookieCategory): boolean => {
      if (category === "essential") return true; // Essential always allowed
      return consent[category] ?? false;
    },
    [consent]
  );

  // Accept all cookies
  const acceptAll = useCallback(() => {
    const newConsent: CookieConsent = {
      essential: true,
      functional: true,
      analytics: true,
      marketing: true,
      timestamp: new Date().toISOString(),
      version: CONSENT_VERSION,
    };
    setConsent(newConsent);
    saveConsent(newConsent);
    setShowBanner(false);
    setShowSettings(false);
  }, []);

  // Reject all non-essential cookies
  const rejectAll = useCallback(() => {
    const newConsent: CookieConsent = {
      essential: true,
      functional: false,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString(),
      version: CONSENT_VERSION,
    };
    setConsent(newConsent);
    saveConsent(newConsent);
    clearNonEssentialCookies();
    setShowBanner(false);
    setShowSettings(false);
  }, []);

  // Accept specific categories
  const acceptCategories = useCallback((categories: CookieCategory[]) => {
    const newConsent: CookieConsent = {
      essential: true,
      functional: categories.includes("functional"),
      analytics: categories.includes("analytics"),
      marketing: categories.includes("marketing"),
      timestamp: new Date().toISOString(),
      version: CONSENT_VERSION,
    };
    setConsent(newConsent);
    saveConsent(newConsent);

    // Clear cookies for categories that are not consented
    if (
      !newConsent.functional ||
      !newConsent.analytics ||
      !newConsent.marketing
    ) {
      clearNonEssentialCookies();
    }

    setShowBanner(false);
    setShowSettings(false);
  }, []);

  // Update consent with partial updates
  const updateConsent = useCallback(
    (updates: Partial<Omit<CookieConsent, "timestamp" | "version">>) => {
      const newConsent: CookieConsent = {
        ...consent,
        ...updates,
        essential: true, // Always force essential to true
        timestamp: new Date().toISOString(),
        version: CONSENT_VERSION,
      };
      setConsent(newConsent);
      saveConsent(newConsent);

      // Clear non-essential cookies that are no longer consented
      if (
        !newConsent.functional ||
        !newConsent.analytics ||
        !newConsent.marketing
      ) {
        clearNonEssentialCookies();
      }

      setShowBanner(false);
      setShowSettings(false);
    },
    [consent]
  );

  // Open settings modal
  const openSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  // Close settings modal
  const closeSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  // Close banner
  const closeBanner = useCallback(() => {
    setShowBanner(false);
  }, []);

  // Reset consent (for testing)
  const resetConsent = useCallback(() => {
    const defaultConsent = getDefaultConsent();
    setConsent(defaultConsent);
    clearNonEssentialCookies();
    // Clear the consent cookie itself
    if (typeof document !== "undefined") {
      document.cookie =
        "ai_courtroom_consent=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
    setShowBanner(true);
  }, []);

  // Only show banner/settings after client-side initialization to prevent hydration mismatch
  // We always render children to avoid SSR/client content mismatch
  const effectiveShowBanner = isInitialized && showBanner;
  const effectiveShowSettings = isInitialized && showSettings;

  return (
    <CookieConsentContext.Provider
      value={{
        consent,
        showBanner: effectiveShowBanner,
        showSettings: effectiveShowSettings,
        hasConsent,
        acceptAll,
        rejectAll,
        acceptCategories,
        updateConsent,
        openSettings,
        closeSettings,
        closeBanner,
        resetConsent,
      }}
    >
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext);
  if (context === undefined) {
    throw new Error(
      "useCookieConsent must be used within a CookieConsentProvider"
    );
  }
  return context;
}
