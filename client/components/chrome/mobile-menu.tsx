"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type MouseEvent } from "react";
import { isCurrentPath, moreNavItems, type NavigationItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { ThemeGlyph } from "./theme-toggle";

type Edge = "top" | "bottom";
const EASE = "transform .9s cubic-bezier(.19,1,.22,1)";
const REPEATS = Array.from({ length: 12 }, (_, i) => i);

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

interface Tile {
  label: string;
  href: string;
  kind?: "account" | "logout";
  current?: boolean;
  onActivate?: () => void;
}

// A full-height tile; a marquee slides in from the edge the pointer entered (flowing-menu).
function MenuTile({ tile, index }: { tile: Tile; index: number }) {
  const router = useRouter();
  const ref = useRef<HTMLAnchorElement>(null);
  const state = useRef<"in" | "out">("out");
  const timer = useRef<number | undefined>(undefined);
  const logout = tile.kind === "logout";

  const edgeOf = (e: MouseEvent): Edge => {
    const r = ref.current!.getBoundingClientRect();
    return e.clientY - r.top < r.height / 2 ? "top" : "bottom";
  };

  const play = (dir: "in" | "out", edge: Edge) => {
    const a = ref.current;
    const ov = a?.querySelector<HTMLElement>("[data-ov]");
    const inner = a?.querySelector<HTMLElement>("[data-in]");
    if (!ov || !inner) return;
    const off = edge === "top" ? -101 : 101;
    if (dir === "in") {
      ov.style.transition = inner.style.transition = "none";
      ov.style.transform = `translateY(${off}%)`;
      inner.style.transform = `translateY(${-off}%)`;
      void ov.offsetWidth;
      ov.style.transition = inner.style.transition = EASE;
      ov.style.transform = inner.style.transform = "translateY(0%)";
    } else {
      ov.style.transition = inner.style.transition = EASE;
      ov.style.transform = `translateY(${off}%)`;
      inner.style.transform = `translateY(${-off}%)`;
    }
    state.current = dir;
  };

  const go = () => (tile.onActivate ? tile.onActivate() : router.push(tile.href));

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const isMouse = (e.nativeEvent as PointerEvent).pointerType === "mouse";
    if ((isMouse && state.current === "in") || reducedMotion() || e.detail === 0) {
      go();
      return;
    }
    // Touch: play the marquee first, then navigate.
    play("in", edgeOf(e));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(go, 850);
  };

  return (
    <Link
      ref={ref}
      href={tile.href}
      aria-current={tile.current ? "page" : undefined}
      onClick={onClick}
      onMouseEnter={(e) => play("in", edgeOf(e))}
      onMouseLeave={(e) => play("out", edgeOf(e))}
      style={{ flex: tile.kind ? "0.7 1 0" : "1 1 0" }}
      className={cn(
        "relative flex min-h-13 items-center justify-center gap-3 overflow-hidden font-display text-[clamp(24px,4.2vh,38px)] uppercase leading-none tracking-[0.06em] [-webkit-tap-highlight-color:transparent]",
        index === 0
          ? ""
          : tile.kind === "account"
            ? "border-t-[3px] border-double border-desk-strip-rule"
            : "border-t border-desk-tile-rule",
        tile.current ? "text-desk-red" : logout ? "text-desk-muted" : "text-desk-ink",
      )}
    >
      <span>{tile.label}</span>
      <span
        aria-hidden="true"
        data-ov=""
        className={cn(
          "pointer-events-none absolute inset-0 translate-y-[101%] overflow-hidden",
          logout ? "bg-seal" : "bg-desk-ink",
        )}
      >
        <span data-in="" className="absolute inset-0 flex translate-y-[-101%] items-center">
          <span className="flex w-max animate-[ac-marquee_14s_linear_infinite]">
            {REPEATS.map((k) => (
              <span
                key={k}
                className={cn(
                  "flex items-center gap-[.6em] whitespace-nowrap pr-[.6em]",
                  logout ? "text-cream" : "text-desk",
                )}
              >
                <span>{tile.label}</span>
                <span
                  className={cn("h-[.32em] w-[.32em] flex-none", logout ? "bg-cream" : "bg-seal")}
                />
              </span>
            ))}
          </span>
        </span>
      </span>
    </Link>
  );
}

interface MobileMenuProps {
  top: number;
  pathname: string;
  navItems: NavigationItem[];
  signedIn: boolean;
  installLabel: string | null;
  onInstall: () => void;
  onLogout: () => void;
  theme: { label: string; name: string; toggle: () => void };
}

export default function MobileMenu({
  top,
  pathname,
  navItems,
  signedIn,
  installLabel,
  onInstall,
  onLogout,
  theme,
}: MobileMenuProps) {
  const tiles: Tile[] = [
    ...navItems.map((n) => ({
      label: n.label,
      href: n.href,
      current: isCurrentPath(pathname, n.href),
    })),
    ...(installLabel ? [{ label: installLabel, href: "#install", onActivate: onInstall }] : []),
    ...(signedIn
      ? [
          {
            label: "Profile",
            href: "/profile",
            kind: "account" as const,
            current: isCurrentPath(pathname, "/profile"),
          },
          { label: "Log out", href: "/login", kind: "logout" as const, onActivate: onLogout },
        ]
      : [
          { label: "Login", href: "/login", kind: "account" as const, current: pathname === "/login" },
          {
            label: "Take a Side",
            href: "/register",
            kind: "account" as const,
            current: pathname === "/register",
          },
        ]),
  ];

  return (
    <nav
      id="mobile-menu"
      aria-label="Main"
      style={{ top }}
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col border-t border-desk-tile-rule bg-desk min-[860px]:hidden"
    >
      {tiles.map((tile, i) => (
        <MenuTile key={tile.label} tile={tile} index={i} />
      ))}
      <div className="flex flex-none flex-wrap gap-x-4.5 gap-y-0.5 border-t-[3px] border-double border-desk-strip-rule px-4.5 pb-3.5 pt-2.5">
        {moreNavItems.map((m) => {
          const current = isCurrentPath(pathname, m.href);
          return (
            <Link
              key={m.href}
              href={m.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "py-2 font-type text-xs uppercase tracking-[0.12em] hover:text-desk-hover",
                current ? "text-desk-red" : "text-desk-muted",
              )}
            >
              {m.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={theme.toggle}
          aria-label={theme.label}
          className="ml-auto flex cursor-pointer items-center gap-2 py-2 font-type text-xs uppercase tracking-[0.12em] text-desk-ink"
        >
          <ThemeGlyph size={12} />
          <span>{theme.name}</span>
        </button>
      </div>
    </nav>
  );
}
