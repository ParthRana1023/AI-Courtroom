"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { authAPI } from "@/lib/api";
import {
  Home,
  User,
  FileText,
  MessageSquare,
  Gavel,
  LogOut,
  Menu,
  X,
  Settings,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { UserNav } from "./user-nav";
import StaggeredMenu from "./staggered-menu";
import FlowingMenu from "./flowing-menu";

interface NavigationProps {
  translucent?: boolean;
}

export default function Navigation({ translucent = false }: NavigationProps) {
  const { isAuthenticated, logout, user } = useAuth();
  const pathname = usePathname();

  // Menu items for StaggeredMenu - Authenticated users (upper section)
  const authUpperItems = [
    { link: "/", text: "Home" },
    { link: "/dashboard/cases", text: "Cases" },
    { link: "/contact", text: "Feedback" },
    { link: "/settings", text: "Settings" },
    { link: "/about", text: "About" },
  ];

  // Menu items for StaggeredMenu - Authenticated users (lower section)
  const authLowerItems = [
    { link: "/dashboard/profile", text: "Profile" },
    { link: "/logout", text: "Logout" },
  ];

  // Menu items for StaggeredMenu - Unauthenticated users (upper section)
  const publicUpperItems = [
    { link: "/", text: "Home" },
    { link: "/contact", text: "Feedback" },
    { link: "/about", text: "About" },
    { link: "/settings", text: "Settings" },
  ];

  // Menu items for StaggeredMenu - Unauthenticated users (lower section)
  const publicLowerItems = [
    { link: "/login", text: "Login" },
    { link: "/register", text: "Register" },
  ];

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
                  <img
                    src="/favicon.ico"
                    alt="AI Courtroom Logo"
                    className="h-8 w-8 mr-2"
                  />
                  <span>AI Courtroom</span>
                </Link>
              </div>
              <div className="hidden md:block ml-10">
                {isAuthenticated && (
                  <div className="flex items-baseline space-x-4">
                    <Link
                      href="/dashboard/cases"
                      className={`px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                        pathname.includes("/dashboard/cases")
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                      }`}
                    >
                      <Gavel className="h-4 w-4 mr-1" />
                      <span>Cases</span>
                    </Link>
                    <Link
                      href="/contact"
                      className={`px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                        pathname === "/contact"
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                      }`}
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      <span>Feedback</span>
                    </Link>
                    <Link
                      href="/settings"
                      className={`px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                        pathname === "/settings"
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                      }`}
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      <span>Settings</span>
                    </Link>
                    <Link
                      href="/about"
                      className={`px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                        pathname === "/about"
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                      }`}
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      <span>About</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Right Side - Auth Links */}
            <div className="hidden md:flex items-center space-x-4">
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
                    Register
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
          <div className="flex-2 min-h-0">
            <FlowingMenu
              items={isAuthenticated ? authUpperItems : publicUpperItems}
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
              items={isAuthenticated ? authLowerItems : publicLowerItems}
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
