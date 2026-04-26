"use client";

import { usePwaInstall } from "@/contexts/pwa-install-context";
import FlowingMenu from "@/components/flowing-menu";

/**
 * A sidebar/menu item for the mobile hamburger menu.
 * Styled using FlowingMenu to perfectly match the other navigation items.
 * Renders nothing if the browser doesn't support installation or
 * the app is already installed.
 */
export function PwaSidebarInstallButton() {
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();

  if (isInstalled) {
    return null;
  }

  if (!canInstall) return null;
  return (
    <div className="h-[8vh] min-h-[64px] shrink-0 w-full">
      <FlowingMenu
        items={[
          {
            link: "#",
            text: "Install App",
            onClick: promptInstall,
          },
        ]}
        textColor="#000"
        bgColor="transparent"
        marqueeBgColor="#2563eb"
        marqueeTextColor="#fff"
        borderColor="transparent"
        speed={10}
      />
    </div>
  );
}
