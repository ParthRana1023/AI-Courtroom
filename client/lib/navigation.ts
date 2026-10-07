export interface NavigationItem {
  href: string;
  label: string;
}

export const authenticatedPrimaryNavItems: NavigationItem[] = [
  { href: "/", label: "Home" },
  { href: "/cases", label: "Cases" },
  { href: "/contact", label: "Contact" },
  { href: "/settings", label: "Settings" },
  { href: "/about", label: "About" },
];

export const publicPrimaryNavItems: NavigationItem[] = [
  { href: "/", label: "Home" },
  { href: "/contact", label: "Contact" },
  { href: "/about", label: "About" },
  { href: "/settings", label: "Settings" },
];

// The "More ▾" menu and the mobile menu's footer strip.
export const moreNavItems: NavigationItem[] = [
  { href: "/help", label: "Help & FAQ" },
  { href: "/changelog", label: "Changelog" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/accessibility", label: "Accessibility" },
];

/** Whether `href` is the page at `pathname` (a section root matches its children). */
export function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
