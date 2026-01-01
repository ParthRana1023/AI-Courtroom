/**
 * Cookie utilities for AI-Courtroom
 * Provides GDPR/CCPA-compliant cookie management
 */

import { createOffsetDate } from "./datetime";

// Cookie category types
export type CookieCategory =
  | "essential"
  | "functional"
  | "analytics"
  | "marketing";

// Cookie consent state
export interface CookieConsent {
  essential: boolean; // Always true, cannot be disabled
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
  version: string;
}

// Cookie options
export interface CookieOptions {
  path?: string;
  expires?: Date | number; // Date or days from now
  maxAge?: number; // seconds
  domain?: string;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

// Default cookie options
const defaultOptions: CookieOptions = {
  path: "/",
  sameSite: "Strict",
  secure:
    typeof window !== "undefined" && window.location.protocol === "https:",
};

// Current consent version - increment when cookie policy changes
export const CONSENT_VERSION = "1.0";

// Cookie names
export const COOKIE_NAMES = {
  CONSENT: "ai_courtroom_consent",
  AUTH_TOKEN: "token",
  THEME: "ai_courtroom_theme",
  SETTINGS: "ai_courtroom_settings",
} as const;

/**
 * Set a cookie with given name, value, and options
 */
export function setCookie(
  name: string,
  value: string,
  options: CookieOptions = {}
): void {
  if (typeof document === "undefined") return;

  const opts = { ...defaultOptions, ...options };
  let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

  if (opts.path) {
    cookieString += `; path=${opts.path}`;
  }

  if (opts.expires) {
    const expiresDate =
      opts.expires instanceof Date
        ? opts.expires
        : createOffsetDate(opts.expires * 24 * 60 * 60 * 1000);
    cookieString += `; expires=${expiresDate.toUTCString()}`;
  }

  if (opts.maxAge !== undefined) {
    cookieString += `; max-age=${opts.maxAge}`;
  }

  if (opts.domain) {
    cookieString += `; domain=${opts.domain}`;
  }

  if (opts.secure) {
    cookieString += "; secure";
  }

  if (opts.sameSite) {
    cookieString += `; samesite=${opts.sameSite}`;
  }

  document.cookie = cookieString;
}

/**
 * Get a cookie value by name
 */
export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.trim().split("=");
    if (cookieName === encodeURIComponent(name)) {
      return decodeURIComponent(cookieValue);
    }
  }
  return null;
}

/**
 * Delete a cookie by name
 */
export function deleteCookie(name: string, path: string = "/"): void {
  if (typeof document === "undefined") return;

  document.cookie = `${encodeURIComponent(
    name
  )}=; path=${path}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Get all cookies as an object
 */
export function getAllCookies(): Record<string, string> {
  if (typeof document === "undefined") return {};

  const cookies: Record<string, string> = {};
  document.cookie.split(";").forEach((cookie) => {
    const [name, value] = cookie.trim().split("=");
    if (name) {
      cookies[decodeURIComponent(name)] = decodeURIComponent(value || "");
    }
  });
  return cookies;
}

/**
 * Get default consent (only essential cookies)
 */
export function getDefaultConsent(): CookieConsent {
  return {
    essential: true,
    functional: false,
    analytics: false,
    marketing: false,
    timestamp: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
}

/**
 * Get stored consent from cookie
 */
export function getStoredConsent(): CookieConsent | null {
  const consentString = getCookie(COOKIE_NAMES.CONSENT);
  if (!consentString) return null;

  try {
    const consent = JSON.parse(consentString) as CookieConsent;
    // Check if consent version matches current version
    if (consent.version !== CONSENT_VERSION) {
      return null; // Force re-consent on version change
    }
    return consent;
  } catch {
    return null;
  }
}

/**
 * Save consent to cookie
 */
export function saveConsent(consent: CookieConsent): void {
  // Consent cookie is always essential, so we can set it without checking consent
  setCookie(COOKIE_NAMES.CONSENT, JSON.stringify(consent), {
    expires: 365, // 1 year
    sameSite: "Strict",
    secure:
      typeof window !== "undefined" && window.location.protocol === "https:",
  });
}

/**
 * Check if user has given consent for a specific category
 */
export function hasConsentFor(category: CookieCategory): boolean {
  const consent = getStoredConsent();
  if (!consent) return category === "essential"; // Essential cookies are always allowed
  return consent[category] ?? false;
}

/**
 * Clear all non-essential cookies
 */
export function clearNonEssentialCookies(): void {
  const allCookies = getAllCookies();
  const essentialCookieNames: string[] = [
    COOKIE_NAMES.CONSENT,
    COOKIE_NAMES.AUTH_TOKEN,
  ];

  Object.keys(allCookies).forEach((name) => {
    if (!essentialCookieNames.includes(name)) {
      deleteCookie(name);
    }
  });
}

/**
 * Set auth token cookie with proper security flags
 */
export function setAuthTokenCookie(
  token: string,
  rememberMe: boolean = false
): void {
  const expirationDays = rememberMe ? 7 : 1;
  setCookie(COOKIE_NAMES.AUTH_TOKEN, token, {
    expires: expirationDays,
    sameSite: "Strict",
    secure:
      typeof window !== "undefined" && window.location.protocol === "https:",
  });
}

/**
 * Clear auth token cookie
 */
export function clearAuthTokenCookie(): void {
  deleteCookie(COOKIE_NAMES.AUTH_TOKEN);
}

/**
 * Set theme preference cookie (requires functional consent)
 */
export function setThemeCookie(theme: string): void {
  if (!hasConsentFor("functional")) return;

  setCookie(COOKIE_NAMES.THEME, theme, {
    expires: 365,
    sameSite: "Strict",
  });
}

/**
 * Get theme from cookie
 */
export function getThemeCookie(): string | null {
  return getCookie(COOKIE_NAMES.THEME);
}

/**
 * Set settings cookie (requires functional consent)
 */
export function setSettingsCookie(settings: object): void {
  if (!hasConsentFor("functional")) return;

  setCookie(COOKIE_NAMES.SETTINGS, JSON.stringify(settings), {
    expires: 365,
    sameSite: "Strict",
  });
}

/**
 * Get settings from cookie
 */
export function getSettingsCookie(): object | null {
  const settingsString = getCookie(COOKIE_NAMES.SETTINGS);
  if (!settingsString) return null;

  try {
    return JSON.parse(settingsString);
  } catch {
    return null;
  }
}
