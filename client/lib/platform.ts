/**
 * Centralized platform detection utilities.
 *
 * Uses Capacitor's runtime check to distinguish between web and native
 * (iOS / Android) environments. Every component that needs to branch
 * on platform should import from here rather than touching
 * `@capacitor/core` directly – this keeps the check in one place and
 * makes it trivial to stub in tests.
 */

import { Capacitor } from "@capacitor/core";

/** True when running inside a Capacitor native shell (iOS or Android). */
export const isNativePlatform = (): boolean => Capacitor.isNativePlatform();

/** True when running as a regular web page (not inside Capacitor). */
export const isWeb = (): boolean => !Capacitor.isNativePlatform();

/** True when running inside the iOS native shell. */
export const isIOS = (): boolean => Capacitor.getPlatform() === "ios";

/** True when running inside the Android native shell. */
export const isAndroid = (): boolean => Capacitor.getPlatform() === "android";
