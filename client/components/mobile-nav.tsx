"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "next-themes";
import StaggeredMenu from "@/components/staggered-menu";
import FlowingMenu from "@/components/flowing-menu";
import { Sun, Moon } from "lucide-react";
import {
  authenticatedPrimaryNavItems,
  authenticatedSecondaryNavItems,
  publicPrimaryNavItems,
  publicSecondaryNavItems,
} from "@/lib/navigation";

export default function MobileNav() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const primaryItems = isAuthenticated
    ? authenticatedPrimaryNavItems.filter((item) => item.link !== "/")
    : publicPrimaryNavItems;
  const secondaryItems = isAuthenticated
    ? authenticatedSecondaryNavItems.map((item) =>
        item.link === "/logout" ? { ...item, onClick: logout } : item,
      )
    : publicSecondaryNavItems;

  // Don't show on landing page (it has its own menu)
  if (pathname === "/") {
    return null;
  }

  // Don't render while loading auth state
  if (isLoading) {
    return null;
  }

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="md:hidden">
      <StaggeredMenu
        position="right"
        isFixed={true}
        menuButtonColor={pathname.startsWith("/dashboard") ? "#000" : "#fff"}
        openMenuButtonColor="#000"
        changeMenuColorOnOpen={true}
        colors={["#1e40af", "#3b82f6"]}
        accentColor="#2563eb"
        displaySocials={false}
        displayItemNumbering={false}
      >
        <div className="flex flex-col h-full">
          {/* Main navigation items */}
          <div className="flex-2 min-h-0">
            <FlowingMenu
              items={primaryItems}
              textColor="#000"
              bgColor="transparent"
              marqueeBgColor="#2563eb"
              marqueeTextColor="#fff"
              borderColor="#e5e7eb"
              speed={10}
            />
          </div>

          {/* Theme Toggle */}
          <div className="border-t-2 border-gray-300 my-4" />
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center gap-3 py-4 px-6 text-lg font-semibold text-black hover:bg-gray-100 transition-colors"
          >
            {theme === "dark" ? (
              <>
                <Sun className="h-6 w-6" />
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="h-6 w-6" />
                <span>Dark Mode</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="border-t-2 border-gray-300 my-4" />

          {/* Auth actions */}
          <div className="h-32">
            <FlowingMenu
              items={secondaryItems}
              textColor="#000"
              bgColor="transparent"
              marqueeBgColor={isAuthenticated ? "#dc2626" : "#16a34a"}
              marqueeTextColor="#fff"
              borderColor="#e5e7eb"
              speed={10}
            />
          </div>
        </div>
      </StaggeredMenu>
    </div>
  );
}
