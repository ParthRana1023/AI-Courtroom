"use client";

import { useState } from "react";
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

interface NavigationProps {
  translucent?: boolean;
}

export default function Navigation({ translucent = false }: NavigationProps) {
  const { isAuthenticated, logout, user } = useAuth();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navClassName = translucent
    ? "bg-black/20 backdrop-blur-md text-white fixed top-0 left-0 right-0 z-50"
    : "bg-black dark:bg-zinc-900 text-white shadow-lg fixed top-0 left-0 right-0 z-50";

  return (
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

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center space-x-2">
            <ThemeToggle />
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="bg-zinc-800 inline-flex items-center justify-center p-2 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-800 focus:ring-white"
              aria-expanded={isMenuOpen}
            >
              <span className="sr-only">Open main menu</span>
              {isMenuOpen ? (
                <X className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`${isMenuOpen ? "block" : "hidden"} md:hidden`}>
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
          {isAuthenticated ? (
            <>
              <Link
                href="/dashboard/cases"
                className={`px-3 py-2 rounded-md text-base font-medium flex items-center ${
                  pathname.includes("/dashboard/cases")
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                <FileText className="h-4 w-4 mr-2" />
                <span>Cases</span>
              </Link>
              <Link
                href="/contact"
                className={`px-3 py-2 rounded-md text-base font-medium flex items-center ${
                  pathname === "/contact"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                <span>Contact Us</span>
              </Link>
              <Link
                href="/settings"
                className={`px-3 py-2 rounded-md text-base font-medium flex items-center ${
                  pathname === "/settings"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                <Settings className="h-4 w-4 mr-2" />
                <span>Settings</span>
              </Link>
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  authAPI.logout();
                }}
                className="w-full text-left px-3 py-2 rounded-md text-base font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center"
              >
                <LogOut className="h-4 w-4 mr-2" />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={`px-3 py-2 rounded-md text-base font-medium flex items-center ${
                  pathname === "/login"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                <User className="h-4 w-4 mr-2" />
                <span>Login</span>
              </Link>
              <Link
                href="/register"
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  pathname === "/register"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
