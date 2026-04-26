"use client";

import { Download } from "lucide-react";
import { usePwaInstall } from "@/contexts/pwa-install-context";

/**
 * A compact "Install App" button meant for the desktop navbar.
 * Styled to match the navbar's zinc theme (same as nav links & theme toggle).
 * Renders nothing if the browser doesn't support installation or
 * the app is already installed.
 */
export function PwaInstallButton() {
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();

  if (isInstalled) {
    return null;
  }

  if (!canInstall) return null;

  return (
    <button
      type="button"
      onClick={promptInstall}
      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-md transition-colors"
      title="Install AI Courtroom"
    >
      <Download className="w-4 h-4" />
      Install
    </button>
  );
}
