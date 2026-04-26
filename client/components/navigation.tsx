"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { User } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { PwaInstallButton } from "./pwa/install-button";
import { PwaSidebarInstallButton } from "./pwa/sidebar-install-button";
import { UserNav } from "./user-nav";
import StaggeredMenu from "./staggered-menu";
import FlowingMenu from "./flowing-menu";
import {
  authenticatedPrimaryNavItems,
  authenticatedSecondaryNavItems,
  publicPrimaryNavItems,
  publicSecondaryNavItems,
} from "@/lib/navigation";

interface NavigationProps {
  translucent?: boolean;
}

export default function Navigation({ translucent = false }: NavigationProps) {
  const { isAuthenticated, logout } = useAuth();
  const pathname = usePathname();
  const primaryItems = isAuthenticated
    ? authenticatedPrimaryNavItems
    : publicPrimaryNavItems;
  const secondaryItems = isAuthenticated
    ? authenticatedSecondaryNavItems.map((item) =>
        item.link === "/logout" ? { ...item, onClick: logout } : item,
      )
    : publicSecondaryNavItems;

  const navClassName = translucent
    ? "bg-black/20 backdrop-blur-md text-white fixed top-0 left-0 right-0 z-50"
    : "bg-black dark:bg-zinc-900 text-white shadow-lg fixed top-0 left-0 right-0 z-50";

  return (
    <>
      <nav className={navClassName}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Main Navigation Links */}
            <div className="flex items-center">
              <div className="shrink-0">
                <Link href="/" className="text-xl font-bold flex items-center">
                  <Image
                    src="/favicon.ico"
                    alt="AI Courtroom Logo"
                    width={32}
                    height={32}
                    className="h-8 w-8 mr-2"
                  />
                  <span>AI Courtroom</span>
                </Link>
              </div>
              <div className="hidden md:block ml-10">
                <div className="flex items-baseline space-x-4">
                  {primaryItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      item.link === "/dashboard/cases"
                        ? pathname.startsWith("/dashboard/cases")
                        : pathname === item.link;

                    return (
                      <Link
                        key={item.link}
                        href={item.link}
                        className={`px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                          isActive
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                        }`}
                      >
                        {Icon ? <Icon className="h-4 w-4 mr-1" /> : null}
                        <span>{item.text}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Side - Auth Links */}
            <div className="hidden md:flex items-center space-x-4">
              <PwaInstallButton />
              <ThemeToggle />

              {isAuthenticated ? (
                <UserNav />
              ) : (
                <div className="flex items-center space-x-4">
                  <Link
                    href="/login"
                    className={`px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                      pathname === "/login"
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                    }`}
                  >
                    <User className="h-4 w-4 mr-1" />
                    <span>Login</span>
                  </Link>
                  <Link
                    href="/register"
                    className={`px-3 py-2 rounded-md text-sm font-medium ${
                      pathname === "/register"
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                    }`}
                  >
                    Get Started
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile StaggeredMenu - Only visible on mobile, matching landing page implementation */}
      <StaggeredMenu
        position="right"
        isFixed={true}
        menuButtonColor="#fff"
        openMenuButtonColor="#000"
        changeMenuColorOnOpen={true}
        colors={["#1e40af", "#3b82f6"]}
        accentColor="#2563eb"
        displaySocials={false}
        displayItemNumbering={false}
        mobileOnly={true}
      >
        {/* FlowingMenu as children - matching landing page structure */}
        <div className="flex flex-col h-full">
          {/* PWA Install — always visible, above nav links */}
          <PwaSidebarInstallButton />
          <div className="border-t-2 border-gray-300" />

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

          {/* Divider with more gap - matching landing page */}
          <div className="border-t-2 border-gray-300 my-8" />

          {/* Lower Section */}
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
    </>
  );
}
