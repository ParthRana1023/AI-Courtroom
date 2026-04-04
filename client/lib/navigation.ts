"use client";

import type { LucideIcon } from "lucide-react";
import {
  FileText,
  Gavel,
  Home,
  LogOut,
  MessageSquare,
  Settings,
  User,
} from "lucide-react";

export interface NavigationItem {
  link: string;
  text: string;
  icon?: LucideIcon;
}

export const authenticatedPrimaryNavItems: NavigationItem[] = [
  { link: "/", text: "Home", icon: Home },
  { link: "/dashboard/cases", text: "Cases", icon: Gavel },
  { link: "/contact", text: "Contact Us", icon: MessageSquare },
  { link: "/settings", text: "Settings", icon: Settings },
  { link: "/about", text: "About", icon: FileText },
];

export const publicPrimaryNavItems: NavigationItem[] = [
  { link: "/", text: "Home", icon: Home },
  { link: "/contact", text: "Contact Us", icon: MessageSquare },
  { link: "/about", text: "About", icon: FileText },
  { link: "/settings", text: "Settings", icon: Settings },
];

export const authenticatedSecondaryNavItems: NavigationItem[] = [
  { link: "/dashboard/profile", text: "Profile", icon: User },
  { link: "/logout", text: "Logout", icon: LogOut },
];

export const publicSecondaryNavItems: NavigationItem[] = [
  { link: "/login", text: "Login", icon: User },
  { link: "/register", text: "Get Started" },
];
