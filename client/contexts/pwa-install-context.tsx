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

interface PwaInstallContextValue {
  /** Whether the browser supports the install prompt and the app is not yet installed. */
  canInstall: boolean;
  /** Whether the app has been installed (either just now, or was already). */
  isInstalled: boolean;
  /** Trigger the native browser install prompt. */
  promptInstall: () => Promise<void>;
}

const PwaInstallContext = createContext<PwaInstallContextValue>({
  canInstall: false,
  isInstalled: false,
  promptInstall: async () => {},
});

export const usePwaInstall = () => useContext(PwaInstallContext);

export function PwaInstallProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

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
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      // @ts-expect-error - sync global state
      window.__deferredPrompt = e;
      setCanInstall(true);
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
    const prompt = deferredPromptRef.current;
    if (!prompt) return;

    await prompt.prompt();
    const { outcome } = await prompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
      setCanInstall(false);
    }
    deferredPromptRef.current = null;
  }, []);

  return (
    <PwaInstallContext.Provider value={{ canInstall, isInstalled, promptInstall }}>
      {children}
    </PwaInstallContext.Provider>
  );
}
