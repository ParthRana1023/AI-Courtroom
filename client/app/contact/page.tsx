"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SiteHeader from "@/components/chrome/site-header";
import { useAuth } from "@/contexts/auth-context";
import { useMounted } from "@/hooks/use-mounted";
import { useOnline } from "@/hooks/use-online";
import { useViewport } from "@/hooks/use-viewport";
import { contactAPI } from "@/lib/api";
import { getErrorDetail } from "@/lib/error-utils";
import Turnstile, { TURNSTILE_SITE_KEY } from "@/components/contact/turnstile";
import { cn } from "@/lib/utils";
import type { FeedbackCategory } from "@/types";

// Contact.dc.html: a letter to the registry. Open to guests, with account recovery.

const CATS: [FeedbackCategory, string][] = [
  ["general", "General Feedback"],
  ["courtroom", "Courtroom Experience"],
  ["case_generation", "Case Generation"],
  ["user_interface", "User Interface"],
  ["performance", "Performance"],
  ["bug_report", "Bug Report"],
  ["feature_request", "Feature Request"],
  ["account_support", "Account Support"],
  ["account_recovery", "Account Recovery"],
  ["legal_inquiry", "Legal/Terms Inquiry"],
  ["other", "Other"],
];
const PH: Partial<Record<FeedbackCategory, string>> = {
  account_recovery: "Optional. Anything that helps us find the account, such as the name on it or a case you worked on.",
  bug_report: "What happened, and what did you expect? Include the case number if it’s about a case.",
  feature_request: "What would you like to be able to do?",
  account_support: "Tell us what’s wrong with your account. Never include your password.",
  courtroom: "Tell us about your time in the courtroom. A case number helps.",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const INTRO = "Have a question, feedback, or need support? We’re here to help.";
const REPLY = "We’ll get back to you if a reply is needed.";

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const phoneOk = (v: string) => /^\+?[\d\s()-]{8,}$/.test(v.trim());
const iso = (d: Date) => d.toISOString().slice(0, 10);

const LABEL = "text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted";
const INPUT = "h-11.5 w-full min-w-0 rounded-none border-0 border-b-2 bg-paper-alt px-3 font-data text-base text-ink outline-none focus:bg-[#f8f3e7]";
const ERR = "text-[13px] text-error";

function Field({ id, label, error, children }: { id: string; label: string; error: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children}
      {error && (
        <span id={`${id}-err`} role="alert" className={ERR}>
          {error}
        </span>
      )}
    </div>
  );
}

export default function ContactPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const params = useSearchParams();
  const online = useOnline();
  const mounted = useMounted();
  const { w } = useViewport();
  const wide = w >= 860;
  const mob = w < 560;
  const signedOut = !isLoading && !isAuthenticated;

  const [cat, setCat] = useState<FeedbackCategory>(() => CATS.find(([v]) => v === params.get("cat"))?.[0] ?? "general");
  const [gName, setGName] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [rAcct, setRAcct] = useState("");
  const [rWhen, setRWhen] = useState("");
  const [msg, setMsg] = useState("");
  const [tried, setTried] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Guests pass Cloudflare Turnstile; each token works once, so a new key remounts it.
  const needCheck = signedOut && !!TURNSTILE_SITE_KEY;
  const [human, setHuman] = useState<string | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [checkKey, setCheckKey] = useState(0);
  const freshCheck = () => {
    setHuman(null);
    setCheckFailed(false);
    setCheckKey((k) => k + 1);
  };

  const rec = cat === "account_recovery";
  const len = msg.trim().length;
  const msgErr = tried ? (!rec && !len ? "Message is required" : len && len < 10 ? "Message must be at least 10 characters" : "") : "";
  const gNameErr = tried && signedOut && !gName.trim() ? "Name is required" : "";
  const gEmailErr = tried && signedOut ? (!gEmail.trim() ? "Email is required" : !emailOk(gEmail) ? "Enter a valid email address" : "") : "";
  const rAcctErr =
    tried && rec
      ? !rAcct.trim()
        ? "Tell us the email or phone number on the account"
        : !(emailOk(rAcct) || phoneOk(rAcct))
          ? "Enter an email address or a phone number"
          : ""
      : "";
  const catLabel = CATS.find(([v]) => v === cat)?.[1] ?? "";
  const now = new Date();
  const today = mounted ? `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}` : "";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!online) return setFormErr("You’re offline. Your message is kept, so you can send it when you’re back online.");
    const bad =
      (signedOut && (!gName.trim() || !emailOk(gEmail))) || (rec && !(emailOk(rAcct) || phoneOk(rAcct))) || (!rec && len < 10) || (len > 0 && len < 10);
    if (bad) {
      setTried(true);
      // The first field that needs fixing takes focus.
      window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    if (needCheck && !human) {
      return setFormErr(
        checkFailed
          ? "The robot check couldn’t load. Refresh the page, or sign in to write without it."
          : "One moment: we’re still checking you’re not a robot. Send again when it’s done.",
      );
    }
    setBusy(true);
    setFormErr("");
    try {
      await contactAPI.submitContactForm({
        feedback_category: cat,
        message: msg.trim(),
        ...(signedOut ? { name: gName.trim(), email: gEmail.trim() } : {}),
        ...(rec ? { account_identifier: rAcct.trim(), deleted_on: rWhen || undefined } : {}),
        ...(needCheck && human ? { turnstile_token: human } : {}),
      });
      setSent(true);
      setTried(false);
    } catch (err) {
      setFormErr(
        navigator.onLine
          ? (getErrorDetail(err) ?? "Couldn’t send your message. Please try again.")
          : "Connection lost before your message was sent. It’s still here, so try again when you’re back online.",
      );
    } finally {
      setBusy(false);
      if (needCheck) freshCheck(); // the token is spent either way
    }
  };

  const again = () => {
    setSent(false);
    setMsg("");
    setCat("general");
    setRAcct("");
    setRWhen("");
  };

  const kicker = (
    <span className={cn("whitespace-nowrap uppercase text-desk-red", mob ? "text-[10.5px] tracking-[0.16em]" : "text-[11px] tracking-[0.3em]")}>
      Correspondence · {today}
    </span>
  );
  const d0 = new Date();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[radial-gradient(ellipse_80%_50%_at_80%_0%,var(--desk-glow)_0%,var(--desk-bg)_70%)] font-type leading-[normal] text-desk-ink">
      <SiteHeader />
      <main className={cn("mx-auto flex min-h-0 w-full max-w-300 flex-1 flex-col", mob ? "gap-2.5 px-3 pb-2.5 pt-3" : "gap-3.5 px-[4vw] pb-4.5 pt-5")}>
        {!wide && (
          <div className="flex min-w-0 flex-col gap-1.5">
            {kicker}
            <h1 className={cn("m-0 font-display font-normal", mob ? "text-[clamp(28px,8.5vw,40px)]/none" : "text-[clamp(36px,4vw,52px)]/none")}>CONTACT</h1>
          </div>
        )}
        <div className={cn("grid min-h-0 flex-1", wide ? "grid-cols-[280px_minmax(0,1fr)] gap-10" : "grid-cols-1")}>
          {wide && (
            <div className="flex min-h-0 flex-col gap-5.5">
              <div className="flex flex-col gap-1.5">
                {kicker}
                <h1 className="m-0 font-display text-[clamp(36px,4vw,52px)]/none font-normal">CONTACT</h1>
              </div>
              <p className="m-0 border-t border-[rgba(239,230,211,.16)] pt-4.5 text-base/[1.55] text-desk-soft text-pretty light:border-[rgba(18,13,9,.24)]">
                {INTRO}
              </p>
              <p className="m-0 text-meta/normal text-desk-muted text-pretty">{REPLY}</p>
            </div>
          )}

          <form ref={formRef} onSubmit={submit} noValidate aria-label="Contact form" className="flex min-h-0 w-full flex-1 flex-col bg-paper text-ink shadow-sheet">
            <div
              className={cn(
                "flex justify-between gap-3 border-b-[3px] border-double border-ink pb-2.5 pt-3.5 text-[11px] font-bold uppercase tracking-[0.2em] text-ink-label",
                mob ? "px-4" : "px-7",
              )}
            >
              <span className="whitespace-nowrap">Form C-4</span>
              <span className="min-w-0 truncate">Letter to the registry</span>
            </div>

            {sent ? (
              <div role="status" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4.5 px-5 py-8 text-center">
                <span className="inline-block -rotate-5 border-4 border-double border-seal px-5 pb-1.5 pt-2 font-display text-[44px] leading-none tracking-[0.08em] text-seal animate-[ac-stamp_.35s_cubic-bezier(.2,.9,.3,1.2)_both]">
                  RECEIVED
                </span>
                <span className="max-w-105 text-base/[1.55] text-ink-label text-balance">
                  Your message has been sent successfully! We will get back to you soon if a reply is needed.
                </span>
                <span className="font-data text-xs font-medium text-ink-hint">Filed under: {catLabel}</span>
                <div className="flex flex-wrap justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={again}
                    className="h-12 cursor-pointer border-[1.5px] border-ink bg-transparent px-5 text-xs font-bold uppercase tracking-[0.14em] text-ink hover:bg-[#f8f3e7]"
                  >
                    Write another
                  </button>
                  {!signedOut && (
                    <Link
                      href="/cases"
                      className="flex h-12 items-center bg-ink px-5 text-xs font-bold uppercase tracking-[0.14em] text-paper hover:bg-ink-label hover:text-white"
                    >
                      Back to my cases
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div data-scroller="" className={cn("flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain", mob ? "px-4 pb-5 pt-4" : "px-7 pb-6 pt-5.5")}>
                  {!wide && <p className="m-0 text-base/normal text-ink-label text-pretty">{INTRO}</p>}
                  {signedOut && (
                    <>
                      <div role="status" className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 bg-ink px-3.5 py-3 text-sm/[1.45] text-paper">
                        <strong className="font-display text-[15px] font-normal tracking-[0.06em] text-amber-hi">NOTICE.</strong>
                        <span>You’re not signed in. Leave your name and email so we can reply, or</span>
                        <Link href="/login?next=/contact" className="border-b border-paper font-bold text-paper hover:text-white">
                          sign in
                        </Link>
                      </div>
                      <div className={cn("grid gap-3.5", mob ? "grid-cols-1" : "grid-cols-2")}>
                        <Field id="c-name" label="Your name" error={gNameErr}>
                          <input
                            id="c-name"
                            value={gName}
                            onChange={(e) => setGName(e.target.value)}
                            autoComplete="name"
                            maxLength={100}
                            aria-invalid={!!gNameErr}
                            aria-describedby={gNameErr ? "c-name-err" : undefined}
                            className={cn(INPUT, gNameErr ? "border-error" : "border-ink")}
                          />
                        </Field>
                        <Field id="c-email" label="Email for our reply" error={gEmailErr}>
                          <input
                            id="c-email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            spellCheck={false}
                            value={gEmail}
                            onChange={(e) => setGEmail(e.target.value)}
                            maxLength={254}
                            aria-invalid={!!gEmailErr}
                            aria-describedby={gEmailErr ? "c-email-err" : undefined}
                            className={cn(INPUT, gEmailErr ? "border-error" : "border-ink")}
                          />
                        </Field>
                      </div>
                    </>
                  )}
                  {formErr && (
                    <div role="alert" className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 bg-seal px-3.5 py-3 text-sm/[1.45] text-cream">
                      <strong className="font-display text-[15px] font-normal tracking-[0.06em]">OBJECTION.</strong>
                      <span>{formErr}</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-2.5">
                    <span id="cat-l" className={LABEL}>
                      What can we help you with today?
                    </span>
                    <div role="radiogroup" aria-labelledby="cat-l" className="flex flex-wrap gap-1.5">
                      {CATS.map(([v, t]) => {
                        const on = cat === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setCat(v)}
                            className={cn(
                              "min-h-10 cursor-pointer whitespace-nowrap border px-3.5 text-sm hover:border-ink",
                              on ? "border-ink bg-ink text-paper" : "border-ink/30 bg-transparent text-ink",
                            )}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {rec && (
                    <div className="flex flex-col gap-3 border-[1.5px] border-ink bg-[#f8f3e7] px-4 py-3.5">
                      <span className="text-sm/[1.55] text-[#2a2018] text-pretty">
                        Deleted accounts are kept for 30 days before they’re erased for good. Tell us which account it was and we’ll restore it, with
                        every case, and email you once it’s back. After 30 days it can’t be recovered.
                      </span>
                      <div className={cn("grid gap-3.5", mob ? "grid-cols-1" : "grid-cols-2")}>
                        <Field id="c-acct" label="Email or phone on the account" error={rAcctErr}>
                          <input
                            id="c-acct"
                            value={rAcct}
                            onChange={(e) => setRAcct(e.target.value)}
                            autoComplete="username"
                            spellCheck={false}
                            maxLength={254}
                            aria-invalid={!!rAcctErr}
                            aria-describedby={rAcctErr ? "c-acct-err" : undefined}
                            className={cn(INPUT, rAcctErr ? "border-error" : "border-ink")}
                          />
                        </Field>
                        <Field id="c-when" label="Deleted on · optional" error="">
                          <input
                            id="c-when"
                            type="date"
                            value={rWhen}
                            onChange={(e) => setRWhen(e.target.value)}
                            min={iso(new Date(d0.getTime() - 30 * 864e5))}
                            max={iso(d0)}
                            className={cn(INPUT, "border-ink scheme-light")}
                          />
                        </Field>
                      </div>
                    </div>
                  )}
                  <div className={cn("flex flex-1 flex-col gap-2", wide ? "min-h-37.5" : "min-h-50")}>
                    <div className="flex items-baseline justify-between gap-3">
                      <label htmlFor="msg" className={LABEL}>
                        Your message
                      </label>
                      <span aria-live="polite" className={cn("font-data text-xs font-medium", len && len < 10 ? "text-amber-deep" : "text-ink-muted")}>
                        {len < 10 ? `${len} / 10 characters minimum` : `${len} characters`}
                      </span>
                    </div>
                    <textarea
                      id="msg"
                      data-scroller=""
                      value={msg}
                      onChange={(e) => {
                        setMsg(e.target.value);
                        setFormErr("");
                      }}
                      maxLength={2000}
                      placeholder={PH[cat] ?? "Please provide us with your valuable feedback or suggestions for improvement."}
                      aria-invalid={!!msgErr}
                      aria-describedby={msgErr ? "msg-err" : undefined}
                      className={cn(
                        "w-full flex-1 resize-none overflow-y-auto rounded-none border-0 border-b-2 bg-paper-alt p-3.5 font-data text-base/[1.6] text-ink outline-none placeholder:text-[#8f8574] focus:bg-[#f8f3e7]",
                        wide ? "min-h-30" : "min-h-40",
                        msgErr ? "border-error" : "border-ink/55",
                      )}
                    />
                    {msgErr && (
                      <span id="msg-err" role="alert" className={ERR}>
                        {msgErr}
                      </span>
                    )}
                  </div>
                </div>
                {needCheck && (
                  <div className={cn("flex flex-col gap-1.5", mob ? "px-4 pb-3" : "px-7 pb-3.5")}>
                    <Turnstile key={checkKey} onToken={setHuman} onError={() => setCheckFailed(true)} />
                    <span aria-live="polite" className="font-data text-xs font-medium text-ink-muted">
                      {checkFailed
                        ? "The robot check couldn’t load. Refresh the page, or sign in to write without it."
                        : human
                          ? "✓ Checked: you’re not a robot."
                          : "Checking you’re not a robot…"}
                    </span>
                  </div>
                )}
                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t-[3px] border-double border-ink",
                    mob ? "px-4 pb-3.5 pt-3" : "px-7 pb-4 pt-3.5",
                  )}
                >
                  {!wide && <span className="flex-[1_1_220px] text-[13px]/[1.45] text-ink-label">{REPLY}</span>}
                  {wide && <span className="font-data text-xs font-medium text-ink-muted">Category: {catLabel}</span>}
                  <button
                    type="submit"
                    disabled={busy}
                    className={cn(
                      "h-13 min-w-55 cursor-pointer whitespace-nowrap border-0 bg-seal px-6 text-[13px] font-bold uppercase tracking-[0.14em] text-cream hover:bg-seal-hover disabled:cursor-default",
                      mob ? "flex-[1_1_100%]" : "flex-none",
                    )}
                  >
                    {!online ? "Offline · message kept" : busy ? "Sending…" : "Send message to the maker →"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
