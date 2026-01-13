"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "next-themes";
import StaggeredMenu from "@/components/staggered-menu";
import FlowingMenu from "@/components/flowing-menu";
import { Sun, Moon } from "lucide-react";

// Menu items for authenticated users
const authMenuItems = [
  { link: "/dashboard/cases", text: "Cases" },
  { link: "/dashboard/profile", text: "Profile" },
  { link: "/dashboard/settings", text: "Settings" },
  { link: "/about", text: "About" },
  { link: "/feedback", text: "Feedback" },
];

// Menu items for unauthenticated users (upper)
const publicMenuItems = [
  { link: "/", text: "Home" },
  { link: "/about", text: "About" },
  { link: "/feedback", text: "Feedback" },
];

// Auth actions for unauthenticated users
const authActionItems = [
  { link: "/login", text: "Login" },
  { link: "/register", text: "Register" },
];

// Logout action for authenticated users
const logoutItem = [{ link: "/logout", text: "Logout" }];

export default function MobileNav() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();
  const { theme, setTheme } = useTheme();

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
              items={isAuthenticated ? authMenuItems : publicMenuItems}
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
              items={isAuthenticated ? logoutItem : authActionItems}
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
