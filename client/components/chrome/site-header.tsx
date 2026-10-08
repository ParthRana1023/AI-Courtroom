"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { useAuth } from "@/contexts/auth-context";
import { usePwaInstall } from "@/contexts/pwa-install-context";
import {
  authenticatedPrimaryNavItems,
  isCurrentPath,
  moreNavItems,
  publicPrimaryNavItems,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";
import MobileMenu from "./mobile-menu";
import { ThemeGlyph, useThemeToggle } from "./theme-toggle";

const navText =
  "font-type text-label uppercase tracking-[0.2em] transition-colors";
const menuPanel =
  "z-56 flex min-w-55 flex-col bg-paper py-1.5 text-ink shadow-menu outline-none";
const menuItem =
  "block px-4.5 py-3 font-type text-sm text-ink outline-none data-highlighted:bg-paper-hi data-highlighted:text-seal";

export function initialsOf(first?: string, last?: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

interface SiteHeaderProps {
  className?: string;
}

export default function SiteHeader({ className }: SiteHeaderProps) {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const { canInstall, installMode, openPrompt } = usePwaInstall();
  const theme = useThemeToggle();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(77);
  const headerRef = useRef<HTMLElement>(null);
  const installLabel = installMode === "apk" ? "Download" : "Install";
  const navItems = isAuthenticated
    ? authenticatedPrimaryNavItems
    : publicPrimaryNavItems;

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const toggleMenu = () => {
    const bottom = headerRef.current?.getBoundingClientRect().bottom;
    if (bottom) setMenuTop(Math.round(bottom));
    setMenuOpen((open) => !open);
  };

  return (
    <>
      <header
        ref={headerRef}
        className={cn(
          "relative flex items-center justify-between gap-4 border-b border-desk-rule px-4.5 py-4 text-desk-ink min-[560px]:px-[4vw]",
          className,
        )}
      >
        <Link
          href="/"
          translate="no"
          aria-label="AI Courtroom home"
          className="-my-3.5 flex items-baseline gap-1.5 py-3.5"
        >
          <span className="whitespace-nowrap font-display text-[0.9375rem] tracking-[0.24em] text-desk-ink">
            AI COURTROOM
          </span>
          <span
            aria-hidden="true"
            className="h-0.5 w-2.25 bg-cursor animate-[ac-cursor_1.6s_steps(1,end)_infinite]"
          />
        </Link>

        <nav
          aria-label="Main"
          className={cn("hidden items-center gap-6.5 min-[860px]:flex", navText)}
        >
          {navItems.map((item) => {
            const current = isCurrentPath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "border-b py-2.5 hover:text-desk-hover",
                  current
                    ? "border-cursor text-desk-strong"
                    : "border-transparent text-desk-muted",
                )}
              >
                {item.label}
              </Link>
            );
          })}

          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger
              className={cn(
                "flex cursor-pointer items-center gap-1.5 py-2.5 text-desk-muted outline-offset-2 hover:text-desk-hover data-[state=open]:text-desk-strong",
                navText,
              )}
            >
              <span>More</span>
              <span aria-hidden="true" className="text-[9px]">
                ▾
              </span>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={8} className={menuPanel}>
                {moreNavItems.map((item) => {
                  const current = isCurrentPath(pathname, item.href);
                  return (
                    <DropdownMenu.Item key={item.href} asChild>
                      <Link
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                        className={cn(menuItem, "tracking-[0.02em]", current && "bg-paper-alt")}
                      >
                        {item.label}
                      </Link>
                    </DropdownMenu.Item>
                  );
                })}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {canInstall && (
            <button
              type="button"
              onClick={openPrompt}
              className={cn("cursor-pointer py-2.5 text-desk-muted hover:text-desk-hover", navText)}
            >
              {installLabel}
            </button>
          )}

          <button
            type="button"
            onClick={theme.toggle}
            aria-label={theme.label}
            title={theme.label}
            className="flex h-9 w-9 cursor-pointer items-center justify-center border border-desk-rule-mid text-desk-muted hover:text-desk-hover"
          >
            <ThemeGlyph />
          </button>

          {!isLoading &&
            (isAuthenticated && user ? (
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger
                  aria-label="Account menu"
                  className="h-9 w-9 cursor-pointer rounded-full bg-paper bg-cover bg-center font-display text-sm normal-case tracking-normal text-ink transition-shadow hover:shadow-[0_0_0_2px_#e0453a] data-[state=open]:shadow-[0_0_0_2px_#e0453a]"
                  style={
                    user.profile_photo_url
                      ? { backgroundImage: `url("${user.profile_photo_url}")` }
                      : undefined
                  }
                >
                  {user.profile_photo_url ? "" : initialsOf(user.first_name, user.last_name)}
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={10}
                    className={cn(menuPanel, "min-w-57.5")}
                  >
                    <div className="flex flex-col gap-0.5 border-b-[3px] border-double border-ink px-4.5 pb-3 pt-2.5">
                      <span className="font-display text-[1.0625rem] leading-[1.2]">
                        {user.first_name} {user.last_name}
                      </span>
                      <span className="font-type text-xs text-ink-muted">{user.email}</span>
                    </div>
                    <DropdownMenu.Item asChild>
                      <Link href="/profile" className={menuItem}>
                        Your profile
                      </Link>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={logout}
                      className="cursor-pointer border-t border-ink/20 px-4.5 py-3 font-type text-meta font-bold uppercase tracking-[0.12em] text-seal outline-none data-highlighted:bg-paper-hi"
                    >
                      Log out
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            ) : (
              <>
                <Link
                  href="/login"
                  className="border-b border-cursor py-2.5 text-desk-ink hover:text-desk-hover"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="flex h-9 items-center whitespace-nowrap border border-desk-rule-mid px-3.5 font-bold tracking-[0.16em] text-desk-ink hover:text-desk-hover"
                >
                  Take a Side
                </Link>
              </>
            ))}
        </nav>

        <button
          type="button"
          onClick={toggleMenu}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          className={cn(
            "min-h-11 cursor-pointer px-1 text-desk-ink min-[860px]:hidden",
            navText,
          )}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </header>

      {menuOpen && (
        <MobileMenu
          top={menuTop}
          pathname={pathname}
          navItems={navItems}
          signedIn={isAuthenticated}
          installLabel={canInstall ? `${installLabel} app` : null}
          onInstall={() => {
            setMenuOpen(false);
            openPrompt();
          }}
          onLogout={logout}
          theme={theme}
        />
      )}
    </>
  );
}
