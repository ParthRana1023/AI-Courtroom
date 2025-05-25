"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import {
  Home,
  User,
  FileText,
  Phone,
  LogOut,
  Menu,
  X,
  Settings,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

export default function Navigation() {
  const { isAuthenticated, logout, user } = useAuth();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="bg-black dark:bg-zinc-900 text-white shadow-lg fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Main Navigation Links */}
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Link href="/" className="text-xl font-bold flex items-center">
                <FileText className="h-6 w-6 mr-2" />
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
                    <FileText className="h-4 w-4 mr-1" />
                    <span>Cases</span>
                  </Link>
                  <Link
                    href="/dashboard"
                    className={`px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                      pathname === "/dashboard"
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                    }`}
                  >
                    <Home className="h-4 w-4 mr-1" />
                    <span>Profile</span>
                  </Link>

                  <Link
                    href="/contact"
                    className={`px-3 py-2 rounded-md text-sm font-medium flex items-center ${
                      pathname === "/contact"
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                    }`}
                  >
                    <Phone className="h-4 w-4 mr-1" />
                    <span>Contact Us</span>
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
            {/* <ThemeToggle /> */}

            {isAuthenticated ? (
              <div className="flex items-center">
                <span className="text-zinc-300 mr-4 flex items-center">
                  <User className="h-4 w-4 mr-1" />
                  <span>Welcome, {user?.first_name}</span>
                </span>
                <button
                  onClick={logout}
                  className="px-3 py-2 rounded-md text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center"
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  <span>Logout</span>
                </button>
              </div>
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
                className={`block px-3 py-2 rounded-md text-base font-medium flex items-center ${
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
                href="/dashboard"
                className={`block px-3 py-2 rounded-md text-base font-medium flex items-center ${
                  pathname === "/dashboard"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                <Home className="h-4 w-4 mr-2" />
                <span>Dashboard</span>
              </Link>

              <Link
                href="/contact"
                className={`block px-3 py-2 rounded-md text-base font-medium flex items-center ${
                  pathname === "/contact"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                <Phone className="h-4 w-4 mr-2" />
                <span>Contact Us</span>
              </Link>
              <Link
                href="/settings"
                className={`block px-3 py-2 rounded-md text-base font-medium flex items-center ${
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
                  logout();
                }}
                className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white flex items-center"
              >
                <LogOut className="h-4 w-4 mr-2" />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={`block px-3 py-2 rounded-md text-base font-medium flex items-center ${
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
