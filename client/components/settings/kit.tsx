"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared parts of Settings.dc.html: section heads, switches, option cards.

export const TAG = "text-[10.5px] font-bold uppercase tracking-[0.18em]";
export const LABEL = "text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted";
export const OUTLINE =
  "h-11 cursor-pointer whitespace-nowrap border-[1.5px] border-ink bg-transparent px-4 text-xs font-bold uppercase tracking-[0.14em] text-ink hover:bg-[#f8f3e7] disabled:cursor-default";
export const SEAL =
  "h-11.5 cursor-pointer whitespace-nowrap border-0 bg-seal px-4.5 text-xs font-bold uppercase tracking-[0.14em] text-cream hover:bg-seal-hover disabled:cursor-default disabled:bg-[#a79c8b]";
/** Bottom-ruled fields on a paper-alt fill, as in the password and delete forms. */
export const SUNK =
  "h-12 w-full min-w-0 rounded-none border-0 border-b-2 border-ink/55 bg-paper-alt px-3.5 font-data text-base text-ink outline-none focus:bg-[#f8f3e7]";

export function Section({
  id,
  num,
  title,
  edited,
  className,
  children,
}: {
  id: string;
  num: string;
  title: string;
  edited?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={`s-${id}`} data-sec="" className={cn("flex flex-col gap-4.5", className)}>
      <h2 className="m-0 mb-1 flex items-baseline gap-3 border-b border-ink/25 pb-2">
        <span className="font-display text-[22px] font-normal text-seal">{num}</span>
        <span className="flex-1 font-display text-[22px] font-normal">{title}</span>
        {edited && <span className={cn(TAG, "text-amber-deep")}>Unsaved</span>}
      </h2>
      {children}
    </section>
  );
}

/** A setting's name and what it does. */
export function Lead({ t, d, small }: { t: string; d?: ReactNode; small?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.75">
      <span className={cn("font-bold", small ? "text-[15px]" : "text-base")}>{t}</span>
      {d && <span className={cn("leading-[1.45] text-pretty text-ink-muted", small ? "text-[13.5px]" : "text-sm")}>{d}</span>}
    </span>
  );
}

export function Switch({ on, onToggle, t, d }: { on: boolean; onToggle: () => void; t: string; d?: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex w-full cursor-pointer items-center justify-between gap-4 border-0 border-t border-ink/12 bg-transparent py-3 text-left text-ink"
    >
      <Lead t={t} d={d} small />
      <span aria-hidden="true" className={cn("relative h-7 w-12.5 flex-none border-2 border-ink", on ? "bg-ink" : "bg-transparent")}>
        <span
          className={cn("absolute top-0.75 h-4.5 w-4.5 transition-[left] duration-200", on ? "left-6.25 bg-paper" : "left-0.75 bg-ink")}
        />
      </span>
    </button>
  );
}

/** Radio cards: the square box takes a red dot when picked. */
export function Options<V extends string | boolean>({
  label,
  value,
  onPick,
  opts,
}: {
  label: string;
  value: V;
  onPick: (v: V) => void;
  opts: [V, string, string][];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
      {opts.map(([v, t, d]) => {
        const on = value === v;
        return (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(v)}
            className={cn(
              "flex cursor-pointer items-start gap-3 border-[1.5px] px-3.5 py-3 text-left text-ink hover:border-ink",
              on ? "border-ink bg-[#f8f3e7]" : "border-ink/25 bg-transparent",
            )}
          >
            <Box on={on} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] font-bold">{t}</span>
              <span className="text-[13.5px] leading-[1.45] text-ink-muted">{d}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Box({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className="mt-px flex h-4.5 w-4.5 flex-none items-center justify-center border-2 border-ink">
      <span className={cn("h-2 w-2", on ? "bg-seal" : "bg-transparent")} />
    </span>
  );
}

/** "Chrome on Windows" from a user agent. */
export function deviceName(ua: string | null) {
  if (!ua) return "Unknown device";
  if (/AICourtroom|Capacitor/i.test(ua)) return "AI Courtroom app";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  return os ? `${browser} on ${os}` : browser;
}

/** "Just now", "5 min ago", "3 hours ago", "2 days ago". Naive server times are UTC. */
export function ago(iso: string) {
  const at = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
  const min = Math.floor((Date.now() - at) / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
