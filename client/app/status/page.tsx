"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeGlyph, useThemeToggle } from "@/components/chrome/theme-toggle";
import Scroller from "@/components/court/scroller";
import { statusAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ServiceState, SystemStatus } from "@/types";

// Status.dc.html: the daily cause list of services, from GET /status.

const SERVICES: [string, string, string][] = [
  ["web", "Website and app", "Pages, your cases and settings"],
  ["auth", "Sign-in and email codes", "Passwords, Google sign-in, six-digit codes"],
  ["gen", "Case generation", "Drafting new cases with AI"],
  ["court", "Courtroom AI", "Judge, opposing counsel and witnesses"],
  ["analysis", "Case analysis", "Verdict analysis after a hearing"],
  ["db", "Storage", "Saving proceedings and evidence"],
];
const LAB: Record<ServiceState, [string, string]> = {
  ok: ["Operational", "text-green"],
  degraded: ["Slower than usual", "text-amber-deep"],
  outage: ["Outage", "text-seal"],
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAD = "px-[clamp(16px,3vw,28px)]";

const hm = (d: Date) => d.toTimeString().slice(0, 5);
/** Today's times as 14:05; older ones as 6 Oct 14:05. Local time. */
function when(at: string) {
  const d = new Date(at);
  return d.toDateString() === new Date().toDateString() ? hm(d) : `${d.getDate()} ${MONTHS[d.getMonth()]} ${hm(d)}`;
}

export default function StatusPage() {
  const theme = useThemeToggle();
  const [data, setData] = useState<SystemStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    statusAPI
      .get()
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  // No answer at all means the API itself is down.
  const state = (id: string): ServiceState | null => (failed ? "outage" : (data?.components.find((c) => c.id === id)?.status ?? null));
  const down = SERVICES.filter(([id]) => state(id) === "outage");
  const overall = failed
    ? { t: "AI Courtroom can’t be reached", cls: "bg-seal text-cream", dot: "bg-cream" }
    : !data
      ? { t: "Checking services…", cls: "bg-paper-alt text-ink-label", dot: "bg-ink-disabled" }
      : down.length
        ? { t: down.length === 1 ? `${down[0][1]} is down` : "Some services are down", cls: "bg-seal text-cream", dot: "bg-cream" }
        : SERVICES.some(([id]) => state(id) === "degraded")
          ? { t: "Some services are slower than usual", cls: "bg-[#f3e2bf] text-[#5a3608]", dot: "bg-amber-deep" }
          : { t: "All systems operational", cls: "bg-[#dfe6d2] text-[#1f4a28]", dot: "bg-green" };
  const incidents = data?.incidents ?? [];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[radial-gradient(ellipse_80%_50%_at_80%_0%,var(--desk-glow)_0%,var(--desk-bg)_70%)] font-type leading-[normal] text-desk-ink">
      <header className="flex items-center justify-between gap-4 border-b border-desk-rule px-[clamp(18px,4vw,64px)] py-4">
        <Link href="/" translate="no" aria-label="AI Courtroom home" className="-my-3.5 flex items-baseline gap-1.5 py-3.5">
          <span className="font-display text-[15px] tracking-[0.24em] whitespace-nowrap text-desk-ink">AI COURTROOM</span>
          <span aria-hidden="true" className="h-0.5 w-2.25 bg-cursor" />
        </Link>
        <div className="flex items-center gap-4.5">
          <Link href="/contact" className="text-[11px] tracking-[0.2em] text-desk-muted uppercase hover:text-desk-hover">
            Report a problem
          </Link>
          <button
            type="button"
            onClick={theme.toggle}
            aria-label={theme.label}
            title={theme.label}
            className="flex size-9 cursor-pointer items-center justify-center border border-desk-rule-mid bg-transparent text-desk-muted hover:text-desk-hover"
          >
            <ThemeGlyph />
          </button>
        </div>
      </header>
      <Scroller tone="desk" data-desk="" className="flex-1">
        <main className="mx-auto flex w-full max-w-205 flex-col gap-5.5 px-[clamp(14px,4vw,32px)] pt-[clamp(24px,5vw,56px)] pb-12">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] tracking-[0.3em] text-desk-red uppercase">
              Registry · Updated {data ? hm(new Date(data.updated_at)) : "…"}
            </span>
            <h1 className="m-0 font-display text-[clamp(30px,6vw,52px)]/none font-normal">SYSTEM STATUS</h1>
          </div>
          <section aria-label="Services" className="flex flex-col bg-paper text-ink shadow-sheet">
            <div
              className={cn(
                "flex justify-between gap-3 border-b-[3px] border-double border-ink pt-3.5 pb-2.5 text-[11px] font-bold tracking-[0.2em] text-ink-label uppercase",
                PAD,
              )}
            >
              <span>Form S-0</span>
              <span>Daily cause list</span>
            </div>
            <div role="status" className={cn("flex items-center gap-3.5 py-4.5", PAD, overall.cls)}>
              <span aria-hidden="true" className={cn("size-3 flex-none", overall.dot)} />
              <span className="font-display text-[clamp(19px,3vw,24px)]/[1.2]">{overall.t}</span>
            </div>
            <ul className={cn("m-0 flex list-none flex-col p-0", PAD)}>
              {SERVICES.map(([id, t, d]) => {
                const s = state(id);
                const [label, color] = s ? LAB[s] : ["Checking", "text-ink-hint"];
                return (
                  <li key={id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink/14 py-3.5">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[15.5px] font-bold">{t}</span>
                      <span className="text-[13px] text-ink-muted">{d}</span>
                    </span>
                    <span className={cn("flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] uppercase", color)}>
                      <span aria-hidden="true" className="size-2 bg-current" />
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className={cn("flex flex-col gap-3.5 pt-5 pb-6", PAD)}>
              <h2 className="m-0 font-display text-xl font-normal">Incidents</h2>
              {!incidents.length && <p className="m-0 text-body/normal text-ink-label">No incidents reported in the last 90 days.</p>}
              {incidents.map((n) => {
                const color = n.resolved
                  ? "border-green text-green"
                  : n.impact === "outage"
                    ? "border-seal text-seal"
                    : "border-amber-deep text-amber-deep";
                return (
                  <article key={n.id} className={cn("flex flex-col gap-2.5 border-[1.5px] px-4 py-3.5", color)}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <h3 className="m-0 text-base font-bold text-ink">{n.title}</h3>
                      <span className="text-[11px] font-bold tracking-[0.16em] uppercase">{n.status}</span>
                    </div>
                    <ol className="m-0 flex list-none flex-col gap-2 p-0">
                      {n.updates.map((u, i) => (
                        <li key={i} className="grid grid-cols-[minmax(0,92px)_minmax(0,1fr)] gap-2.5 text-sm/normal text-ink">
                          <span className="font-data text-xs/[1.75] font-medium text-ink-muted">{when(u.at)}</span>
                          <span>
                            <strong>{u.kind}.</strong> {u.text}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </article>
                );
              })}
            </div>
          </section>
          <p className="m-0 text-meta/normal text-pretty text-desk-muted">
            Times are shown in your local time zone. If something isn’t working and it isn’t listed here,{" "}
            <Link href="/contact" className="border-b border-current">
              tell us
            </Link>
            .
          </p>
        </main>
      </Scroller>
    </div>
  );
}
