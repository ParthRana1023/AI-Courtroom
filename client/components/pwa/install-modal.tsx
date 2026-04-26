"use client";

import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";
import { usePwaInstall } from "@/contexts/pwa-install-context";

const DISMISS_KEY = "pwa-install-modal-dismissed";

/**
 * A popup modal shown on the landing page encouraging the user to install
 * the PWA. It is shown once per session (dismissed state stored in
 * sessionStorage) and only when the browser fires `beforeinstallprompt`.
 *
 * Themed to match the site's neutral/zinc palette with dark-mode support.
 */
export function PwaInstallModal() {
  const { canInstall, promptInstall } = usePwaInstall();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!canInstall) return;

    // Don't show if user already dismissed this session
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    // Small delay so the landing page renders first
    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, [canInstall]);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem(DISMISS_KEY, "1");
  };

  const handleInstall = async () => {
    await promptInstall();
    dismiss();
  };

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-100 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={dismiss}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-101 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl shadow-black/40 border border-neutral-200 dark:border-zinc-700 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 overflow-hidden">
          {/* Header */}
          <div className="relative bg-black dark:bg-zinc-800 px-6 pt-6 pb-8 text-white">
            <button
              type="button"
              onClick={dismiss}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
              aria-label="Dismiss install prompt"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight">
                  Install AI Courtroom
                </h2>
                <p className="text-sm text-zinc-400">
                  Get the full app experience
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-neutral-600 dark:text-zinc-400 leading-relaxed">
              Add AI Courtroom to your home screen for instant access, faster
              loading, and offline support.
            </p>

            <ul className="space-y-2 text-sm">
              {[
                "Works offline — view past cases anytime",
                "Instant launch from your home screen",
                "No app store needed",
              ].map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-neutral-700 dark:text-zinc-300"
                >
                  <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-neutral-200 dark:bg-zinc-700 flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 dark:bg-zinc-300" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleInstall}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                Install
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="px-4 py-2.5 text-sm font-medium text-neutral-500 dark:text-zinc-400 hover:text-neutral-700 dark:hover:text-zinc-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
