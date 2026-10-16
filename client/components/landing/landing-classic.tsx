"use client";

import { useState } from "react";
import Link from "next/link";
import { AccountMenu } from "@/components/chrome/site-header";
import { useThemeToggle } from "@/components/chrome/theme-toggle";
import Scroller from "@/components/court/scroller";
import { useAuth } from "@/contexts/auth-context";
import { useMounted } from "@/hooks/use-mounted";
import { pickCases, type LandingCase } from "@/lib/landing-cases";
import { cn } from "@/lib/utils";

// Landing Classic.dc.html: the non-3D landing. The 3D page falls back to it (`why`), or it's chosen.

export type FallbackReason = "nogl" | "slow" | "failed" | "chosen";

const NOTES: Record<FallbackReason, string> = {
  nogl: "You’re seeing the simple version because the 3D courtroom needs hardware graphics (WebGL), which this browser has switched off. Turn on hardware acceleration and reload to see the full experience.",
  slow: "You’re seeing the simple version because this device may struggle with the 3D courtroom.",
  failed: "The 3D courtroom didn’t load, so you’re seeing the simple version.",
  chosen: "",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FOOTER: [string, string][] = [
  ["/about", "About"],
  ["/help", "Help & FAQ"],
  ["/changelog", "Changelog"],
  ["/privacy", "Privacy Policy"],
  ["/cookies", "Cookie Policy"],
  ["/terms", "Terms of Service"],
  ["/accessibility", "Accessibility"],
  ["/contact", "Contact Us"],
  ["/status", "System status"],
];

const KICK = "text-[11px] uppercase tracking-[0.3em] text-desk-red";
const H2 = "m-0 flex items-baseline gap-3.5 border-b border-[rgba(239,230,211,.18)] pb-2.5 font-normal light:border-ink/25";
const CTA = "flex min-h-13 items-center px-6.5 text-[13.5px] font-bold uppercase tracking-[0.12em]";
const SHEET = "bg-paper text-ink shadow-sheet";
const TAG = "whitespace-nowrap border-[1.5px] px-2.25 pb-0.75 pt-1 text-[10.5px] font-bold uppercase tracking-[0.14em]";
const SUB = "m-0 text-[11px] font-bold uppercase tracking-[0.18em] text-ink-muted";

export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function CaseFile({ c, open, onToggle, sideHref }: { c: LandingCase; open: boolean; onToggle: () => void; sideHref: string }) {
  const hid = `case-${c.id}`;
  const bid = `case-body-${c.id}`;
  return (
    <article aria-labelledby={hid} className={cn("flex flex-col", SHEET)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b-[3px] border-double border-ink px-5.5 pb-2.5 pt-3">
        <span className="min-w-0 flex-[1_1_320px] text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-muted">{c.court}</span>
        <span className="flex-none whitespace-nowrap font-data text-xs font-medium text-ink-muted">{c.docket}</span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bid}
        className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-x-5 gap-y-2.5 border-0 bg-transparent px-5.5 pb-5 pt-5.5 text-left text-inherit hover:bg-paper-soft"
      >
        <span className="flex min-w-0 flex-col gap-2.5">
          <span id={hid} className="font-display text-[clamp(24px,3vw,32px)]/[1.15] text-balance">
            {c.title}
          </span>
          <span className="text-base/normal italic text-seal">{c.q}</span>
          <span className="flex flex-wrap gap-1.5">
            <span className={cn(TAG, "border-ink")}>{c.area}</span>
            <span className={cn(TAG, "border-amber text-amber")}>{c.difficulty}</span>
            <span className={cn(TAG, "border-ink-muted text-ink-muted")}>{c.duration}</span>
          </span>
        </span>
        <span aria-hidden="true" className="whitespace-nowrap pt-2 text-xs font-bold uppercase tracking-[0.14em] text-seal">
          {open ? "Close file ▴" : "Open file ▾"}
        </span>
      </button>
      {open && (
        <div id={bid} className="flex flex-col gap-6.5 border-t border-ink/15 px-5.5 pb-6.5 pt-1">
          <p className="m-0 mt-4.5 max-w-[72ch] text-base/[1.65] text-[#2a2018] text-pretty">{c.summary}</p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-x-8 gap-y-6">
            <div className="flex min-w-0 flex-col gap-2.5">
              <h3 className={SUB}>Timeline</h3>
              <ol className="m-0 flex list-none flex-col border-t border-ink/15 p-0">
                {c.timeline.map((t) => (
                  <li key={t.t} className="grid grid-cols-[132px_minmax(0,1fr)] gap-x-4 gap-y-1 border-b border-ink/15 py-2.25">
                    <span className="whitespace-nowrap font-data text-xs/[1.6] font-medium text-seal">{t.t}</span>
                    <span className="text-[14.5px]/[1.5] text-[#2a2018]">{t.d}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex min-w-0 flex-col gap-2.5">
              <h3 className={SUB}>Investigation board</h3>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {c.board.map((b) => (
                  <li key={b.t} className="flex flex-col gap-1 border border-ink/20 bg-[#f8f3e7] px-3.5 py-3">
                    <span className="text-sm font-bold">{b.t}</span>
                    <span className="text-[14.5px]/[1.5] text-ink-label text-pretty">{b.d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 bg-ink px-4 py-3.5 text-paper">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-gold">{c.final.label}</span>
            {c.final.lines.map((l) => (
              <span key={l} className="wrap-anywhere font-data text-[13px]/[1.6] font-medium">
                {l}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t-[3px] border-double border-ink pt-4">
            <span className="font-display text-lg/[1.3] text-seal text-balance">{c.closing}</span>
            <Link
              href={sideHref}
              className="flex min-h-11.5 items-center bg-seal px-5 text-[12.5px] font-bold uppercase tracking-[0.12em] text-cream hover:bg-seal-hover hover:text-white"
            >
              Argue this case →
            </Link>
          </div>
        </div>
      )}
    </article>
  );
}

export default function LandingClassic({ why }: { why?: FallbackReason }) {
  const { isAuthenticated, isLoading } = useAuth();
  const theme = useThemeToggle();
  const mounted = useMounted();
  const [cases] = useState<LandingCase[]>(() => (typeof window === "undefined" ? [] : pickCases()));
  const [open, setOpen] = useState<Record<string, boolean>>(() => (cases[0] ? { [cases[0].id]: true } : {}));
  const [canGL] = useState(() => typeof window !== "undefined" && hasWebGL());

  const sideHref = isAuthenticated ? "/cases" : "/register";
  const loginHref = isAuthenticated ? "/cases" : "/login";
  const loginLabel = isAuthenticated ? "My cases" : "Login";
  const note = why ? NOTES[why] : "";
  const now = new Date();
  const today = mounted ? `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}` : "";

  const go3d = () => {
    try {
      localStorage.setItem("aiCourtroom-landing", "3d");
    } catch {
      // Without storage, ?view=3d still opens it this time.
    }
    window.location.assign("/?view=3d");
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-desk font-type leading-[normal] text-desk-ink">
      <Scroller
        tone="desk"
        data-desk=""
        className="flex flex-1 flex-col bg-[radial-gradient(ellipse_80%_50%_at_80%_0%,rgba(142,31,25,.16),transparent_70%)] light:bg-[radial-gradient(ellipse_80%_50%_at_80%_0%,rgba(142,31,25,.10),transparent_70%)]"
      >
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-desk-rule px-[max(18px,4vw)] py-4">
          <Link href="/" translate="no" aria-label="AI Courtroom home" className="-my-3.5 flex items-baseline gap-1.5 py-3.5">
            <span className="whitespace-nowrap font-display text-[15px] tracking-[0.24em] text-desk-ink">AI COURTROOM</span>
            <span aria-hidden="true" className="h-0.5 w-2.25 bg-cursor motion-safe:animate-[ac-cursor_1.6s_steps(1,end)_infinite]" />
          </Link>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5.5 gap-y-2 whitespace-nowrap text-[11px] uppercase tracking-[0.2em]">
            {[
              ["/about", "About"],
              ["/help", "Help"],
              ["/contact", "Contact"],
            ].map(([href, t]) => (
              <Link key={href} href={href} className="flex min-h-11 items-center text-desk-muted hover:text-desk-hover">
                {t}
              </Link>
            ))}
            <button
              type="button"
              onClick={theme.toggle}
              aria-label={theme.label}
              title={theme.label}
              className="flex size-9 cursor-pointer items-center justify-center border border-desk-rule-mid bg-transparent font-data text-[15px] text-inherit"
            >
              ◐
            </button>
            {!isLoading &&
              (isAuthenticated ? (
                <>
                  <Link
                    href="/cases"
                    className="flex h-9 items-center whitespace-nowrap border border-[rgba(239,230,211,.45)] px-3.5 font-bold tracking-[0.16em] text-desk-ink hover:border-desk-ink hover:text-desk-hover light:border-ink/45 light:hover:border-seal"
                  >
                    Cases
                  </Link>
                  <AccountMenu size={38} withSettings />
                </>
              ) : (
                <Link
                  href={loginHref}
                  className="relative border-b border-cursor py-2.5 text-desk-ink before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']"
                >
                  {loginLabel}
                </Link>
              ))}
          </nav>
        </header>

        <main className="mx-auto flex w-full max-w-310 flex-1 flex-col gap-[clamp(56px,9vw,112px)] px-[max(18px,4vw)] pb-16 pt-[clamp(36px,7vw,88px)]">
          <section aria-labelledby="hero-t" className="flex max-w-190 flex-col gap-6.5">
            <span className={KICK}>Cause list · {today}</span>
            <h1 id="hero-t" className="m-0 font-display text-[clamp(40px,7vw,96px)]/[1.02] font-normal uppercase text-balance">
              Your first case is waiting.
            </h1>
            <p className="m-0 max-w-[56ch] text-[clamp(16px,1.6vw,19px)]/[1.6] text-desk-soft text-pretty">
              Step into the role of an advocate. Analyse evidence, challenge an AI prosecutor and argue before an AI judge.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={sideHref} className={cn(CTA, "bg-desk-ink text-desk hover:bg-white hover:text-ink light:hover:bg-[#2a2018] light:hover:text-white")}>
                Take a Side
              </Link>
              <Link href={loginHref} className={cn(CTA, "bg-seal text-cream hover:bg-seal-hover hover:text-white")}>
                {loginLabel}
              </Link>
            </div>
            {note && (
              <p role="note" className="m-0 border-t border-desk-rule pt-4 text-[13px]/[1.6] text-desk-muted text-pretty">
                {note}
              </p>
            )}
            {canGL && why !== "nogl" && (
              <button
                type="button"
                onClick={go3d}
                className="min-h-11 cursor-pointer self-start border-0 border-b border-current bg-transparent p-0 text-[13px] tracking-[0.06em] text-desk-muted hover:text-desk-hover"
              >
                Walk through the 3D courtroom instead →
              </button>
            )}
          </section>

          <section aria-labelledby="how-t" className="flex flex-col gap-5.5">
            <h2 id="how-t" className={H2}>
              <span className="font-display text-[22px] text-desk-red">I.</span>
              <span className="font-display text-[clamp(24px,3vw,34px)]/[1.15]">How a case runs</span>
            </h2>
            <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5 p-0">
              {[
                ["I", "File a case", "Pick the sections of the Bharatiya Nyaya Sanhita you want to practise. The AI drafts the facts, parties and summary."],
                ["II", "Argue your side", "Take the plaintiff or the defence. Question the AI-played parties, call witnesses and object to the other side."],
                ["III", "Hear the verdict", "The AI judge delivers a verdict with its reasoning and feedback on how you argued."],
              ].map(([n, t, d]) => (
                <li key={n} className={cn("flex flex-col gap-2.5 px-5.5 pb-6 pt-5.5", SHEET)}>
                  <span className="font-data text-[15px] font-bold text-seal">{n}</span>
                  <h3 className="m-0 font-display text-[22px]/[1.2] font-normal">{t}</h3>
                  <p className="m-0 text-[15px]/[1.6] text-ink-label text-pretty">{d}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="cases-t" className="flex flex-col gap-5.5">
            <h2 id="cases-t" className={cn(H2, "flex-wrap")}>
              <span className="font-display text-[22px] text-desk-red">II.</span>
              <span className="flex-[1_0_auto] whitespace-nowrap font-display text-[clamp(24px,3vw,34px)]/[1.15]">Pending cases</span>
              <span className="text-xs uppercase tracking-[0.14em] text-desk-muted">Sample files · open one to read</span>
            </h2>
            <div className="flex flex-col gap-4.5">
              {cases.map((c) => (
                <CaseFile key={c.id} c={c} open={!!open[c.id]} onToggle={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))} sideHref={sideHref} />
              ))}
            </div>
          </section>

          <section aria-labelledby="cta-t" className={cn("flex flex-col items-start gap-5 p-[clamp(28px,5vw,48px)]", SHEET)}>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-seal">All rise</span>
            <h2 id="cta-t" className="m-0 font-display text-[clamp(30px,4.5vw,56px)]/[1.05] font-normal uppercase text-balance">
              Court is in session.
            </h2>
            <p className="m-0 max-w-[56ch] text-base/[1.6] text-ink-label text-pretty">
              Start building your legal argumentation skills with AI-powered simulations today.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={sideHref} className={cn(CTA, "bg-ink text-paper hover:bg-[#2a2018] hover:text-white")}>
                Take a Side
              </Link>
              <Link href={loginHref} className={cn(CTA, "bg-seal text-cream hover:bg-seal-hover hover:text-white")}>
                {loginLabel}
              </Link>
            </div>
          </section>
        </main>

        <footer className="flex flex-col gap-3 border-t-[3px] border-double border-[rgba(239,230,211,.3)] px-[max(18px,4vw)] pb-6.5 pt-5 light:border-ink">
          <nav aria-label="Footer" className="flex flex-wrap gap-x-4.5 gap-y-5 py-2 text-[11px] uppercase tracking-[0.14em]">
            {FOOTER.map(([href, t]) => (
              <Link
                key={href}
                href={href}
                className="relative text-desk-muted before:absolute before:-inset-x-1 before:-inset-y-3.5 before:content-[''] hover:text-desk-hover"
              >
                {t}
              </Link>
            ))}
          </nav>
          <p className="m-0 max-w-[90ch] text-xs/[1.55] text-desk-muted text-pretty">
            AI Courtroom is a practice simulator for learning advocacy. Cases, parties and verdicts are generated by AI and may be wrong. It is not legal
            advice.
          </p>
        </footer>
      </Scroller>
    </div>
  );
}
