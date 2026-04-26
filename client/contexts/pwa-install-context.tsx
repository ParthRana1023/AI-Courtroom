"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { isNativePlatform } from "@/lib/platform";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

/**
 * The install mode determines how the install action behaves:
 * - "pwa": Triggers the native browser install prompt (desktop Chrome/Edge).
 * - "apk": Downloads the APK file (mobile Android browsers).
 */
type InstallMode = "pwa" | "apk";

/**
 * Path to the APK file hosted in the public directory.
 * Update this when you build a new version of the APK.
 */
const APK_DOWNLOAD_URL = "/downloads/ai-courtroom.apk";

interface PwaInstallContextValue {
  /** Whether the browser supports the install prompt and the app is not yet installed. */
  canInstall: boolean;
  /** Whether the app has been installed (either just now, or was already). */
  isInstalled: boolean;
  /** Trigger the native browser install prompt or APK download. */
  promptInstall: () => Promise<void>;
  /** The current install mode: "pwa" for browser prompt, "apk" for APK download. */
  installMode: InstallMode;
}

const PwaInstallContext = createContext<PwaInstallContextValue>({
  canInstall: false,
  isInstalled: false,
  promptInstall: async () => {},
  installMode: "pwa",
});

export const usePwaInstall = () => useContext(PwaInstallContext);

/** Detect if the user-agent is a mobile Android browser (not a native Capacitor shell). */
function isMobileAndroidBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android/i.test(ua) && !isNativePlatform();
}

export function PwaInstallProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installMode, setInstallMode] = useState<InstallMode>("pwa");

  useEffect(() => {
    // Never offer the PWA install prompt inside a native shell
    if (isNativePlatform()) return;

    // Check if already installed via display-mode
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Check global variables defined in layout.tsx
    // @ts-expect-error - added globally in layout
    if (window.__appInstalled) {
      setIsInstalled(true);
      return;
    }

    // @ts-expect-error - added globally in layout
    if (window.__deferredPrompt) {
      // @ts-expect-error - added globally in layout
      deferredPromptRef.current = window.__deferredPrompt;
      setCanInstall(true);
      setInstallMode("pwa");
    } else if (isMobileAndroidBrowser()) {
      // No PWA prompt available, but we're on mobile Android — offer APK download
      setCanInstall(true);
      setInstallMode("apk");
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      // @ts-expect-error - sync global state
      window.__deferredPrompt = e;
      setCanInstall(true);
      // Switch to PWA mode since the browser supports it
      setInstallMode("pwa");
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      deferredPromptRef.current = null;
      // @ts-expect-error - sync global state
      window.__appInstalled = true;
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (installMode === "apk") {
      // Trigger APK download
      const link = document.createElement("a");
      link.href = APK_DOWNLOAD_URL;
      link.download = "ai-courtroom.apk";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // PWA mode — trigger the native browser prompt
    const prompt = deferredPromptRef.current;
    if (!prompt) return;

    await prompt.prompt();
    const { outcome } = await prompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
      setCanInstall(false);
    }
    deferredPromptRef.current = null;
  }, [installMode]);

  return (
    <PwaInstallContext.Provider
      value={{ canInstall, isInstalled, promptInstall, installMode }}
    >
      {children}
    </PwaInstallContext.Provider>
  );
}
