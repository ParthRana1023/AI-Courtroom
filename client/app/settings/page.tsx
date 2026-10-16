"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import SiteHeader from "@/components/chrome/site-header";
import AccountSection from "@/components/settings/account";
import { Box, LABEL, Lead, OUTLINE, Options, Section, Switch, TAG } from "@/components/settings/kit";
import { useAuth } from "@/contexts/auth-context";
import { useCookieConsent } from "@/contexts/cookie-consent-context";
import { usePwaInstall } from "@/contexts/pwa-install-context";
import { useSettings } from "@/contexts/settings-context";
import { useMounted } from "@/hooks/use-mounted";
import { useOnline } from "@/hooks/use-online";
import { useSectionIndex } from "@/hooks/use-section-index";
import { useViewport } from "@/hooks/use-viewport";
import { accountAPI, authAPI, locationAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CaseLocationPreference, PartialScoring } from "@/types";

// Settings.dc.html: one form, one save bar. Theme and developer mode apply at once.

type TextSize = "small" | "medium" | "large";
interface Local {
  textSize: TextSize;
  enterSubmits: boolean;
  autoExpand: boolean;
  skipArchive: boolean;
  skipDelete: boolean;
  loc: CaseLocationPreference;
  locState: string;
  rag: boolean;
  partial: PartialScoring;
  nCase: boolean;
  nRemind: boolean;
  nProduct: boolean;
}
type Key = keyof Local;

/** [id, title, tab label, signed-in only] */
const SECS: [string, string, string, boolean][] = [
  ["text", "Accessibility", "Text", false],
  ["look", "Appearance", "Theme", false],
  ["writing", "Writing arguments", "Writing", true],
  ["cases", "Case management", "Cases", true],
  ["ai", "Courtroom AI", "AI", true],
  ["notify", "Notifications", "Email", true],
  ["privacy", "Privacy", "Privacy", false],
  ["account", "Account & security", "Account", true],
];
const GROUP: Record<string, Key[]> = {
  text: ["textSize"],
  writing: ["enterSubmits", "autoExpand"],
  cases: ["skipArchive", "skipDelete", "loc", "locState"],
  ai: ["rag", "partial"],
  // Hearing reminders and product updates come back once something sends them.
  notify: ["nCase"],
};
/** Kept on this device, so a signed-out visitor can set them too. */
const DEVICE: Key[] = ["textSize", "enterSubmits", "autoExpand", "skipArchive", "skipDelete"];
const NUMS = ["I.", "II.", "III.", "IV.", "V.", "VI.", "VII.", "VIII."];

export default function SettingsPage() {
  const st = useSettings();
  const { user, isAuthenticated, isLoading, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const { consent, openSettings: openCookieSettings } = useCookieConsent();
  const { canInstall, isInstalled, installMode, openPrompt } = usePwaInstall();
  const online = useOnline();
  const { w } = useViewport();
  const wide = w >= 860;
  const mob = w < 560;
  const signedIn = isAuthenticated && !!user;

  const saved = useMemo<Local>(
    () => ({
      textSize: st.textSize,
      enterSubmits: st.enterKeySubmits,
      autoExpand: st.autoExpandTextAreas,
      skipArchive: st.skipArchiveConfirmation,
      skipDelete: st.skipDeleteConfirmation,
      loc: user?.case_location_preference ?? "random",
      locState: user?.preferred_case_state ?? "",
      rag: user?.rag_enabled ?? true,
      partial: user?.partial_scoring ?? "zero",
      nCase: user?.notification_prefs?.case_ready ?? true,
      nRemind: user?.notification_prefs?.hearing_reminders ?? true,
      nProduct: user?.notification_prefs?.product_updates ?? false,
    }),
    [st.textSize, st.enterKeySubmits, st.autoExpandTextAreas, st.skipArchiveConfirmation, st.skipDeleteConfirmation, user],
  );
  const [local, setLocal] = useState<Local>(saved);
  // The form starts from the saved settings once we know who is signed in.
  const seed = isLoading ? "" : (user?.id ?? "guest");
  const seeded = useRef("");
  useEffect(() => {
    if (!seed || seeded.current === seed) return;
    seeded.current = seed;
    setLocal(saved);
  }, [seed, saved]);

  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const msgTimer = useRef(0);
  const [states, setStates] = useState<{ state_iso2: string; state_name: string; high_court: string }[]>([]);
  useEffect(() => {
    if (!signedIn) return;
    locationAPI
      .getIndianStates()
      .then(setStates)
      .catch(() => setStates([]));
  }, [signedIn]);

  const secs = SECS.filter(([, , , only]) => signedIn || !only);
  const num = Object.fromEntries(secs.map(([id], i) => [id, NUMS[i]]));
  const diff = (Object.keys(saved) as Key[]).filter(
    (k) =>
      (signedIn || DEVICE.includes(k)) &&
      local[k] !== saved[k] &&
      !(k === "locState" && local.loc !== "specific_state" && saved.loc !== "specific_state"),
  );
  const n = diff.length;
  const edited = (id: string) => (GROUP[id] ?? []).some((k) => diff.includes(k));
  const set = <K extends Key>(k: K, v: Local[K]) => {
    setLocal((l) => ({ ...l, [k]: v }));
    setMsg(null);
  };

  // ---- section index: jump with an eased scroll, follow the scroll, keep the tab in view ----
  const { scRef, active, jump, onScroll } = useSectionIndex(secs.map(([id]) => id));
  const tabsRef = useRef<HTMLDivElement>(null);

  // Phones: the tab strip follows the section, the active tab near the left with the previous one peeking.
  const firstActive = useRef(true);
  useEffect(() => {
    if (firstActive.current) {
      firstActive.current = false;
      return;
    }
    const strip = tabsRef.current;
    const tab = strip?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    if (!strip || !tab) return;
    const prev = tab.previousElementSibling as HTMLElement | null;
    const target = Math.max(0, Math.min((prev ? prev.offsetLeft + prev.offsetWidth * 0.5 : tab.offsetLeft) - 8, strip.scrollWidth - strip.clientWidth));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) strip.scrollLeft = target;
    else strip.scrollTo({ left: target, behavior: "smooth" });
  }, [active]);

  // ---- save bar ----
  const flash = (t: string, ok: boolean) => {
    window.clearTimeout(msgTimer.current);
    setMsg({ t, ok });
    if (ok) msgTimer.current = window.setTimeout(() => setMsg(null), 3000);
  };
  useEffect(() => () => window.clearTimeout(msgTimer.current), []);

  const save = async () => {
    if (!n || saving) return;
    if (!online) return flash("Some settings could not be saved. You’re offline. Your changes are kept.", false);
    if (local.loc === "specific_state" && !local.locState) {
      setTried(true);
      return jump("cases");
    }
    const has = (...ks: Key[]) => ks.some((k) => diff.includes(k));
    if (has("textSize")) st.setTextSize(local.textSize);
    if (has("enterSubmits")) st.setEnterKeySubmits(local.enterSubmits);
    if (has("autoExpand")) st.setAutoExpandTextAreas(local.autoExpand);
    if (has("skipArchive")) st.setSkipArchiveConfirmation(local.skipArchive);
    if (has("skipDelete")) st.setSkipDeleteConfirmation(local.skipDelete);
    const jobs: Promise<unknown>[] = [];
    if (has("loc", "locState"))
      jobs.push(
        locationAPI.updateCaseLocationPreference({
          case_location_preference: local.loc,
          preferred_case_state: local.loc === "specific_state" ? local.locState : undefined,
        }),
      );
    if (has("rag")) jobs.push(authAPI.updateRagPreference({ rag_enabled: local.rag }));
    if (has("partial")) jobs.push(authAPI.updateStatsPreference({ partial_scoring: local.partial }));
    if (has("nCase", "nRemind", "nProduct"))
      jobs.push(accountAPI.updateNotifications({ case_ready: local.nCase, hearing_reminders: local.nRemind, product_updates: local.nProduct }));
    setSaving(true);
    const results = await Promise.allSettled(jobs);
    if (jobs.length) await refreshUser();
    setSaving(false);
    setTried(false);
    const failed = results.some((r) => r.status === "rejected");
    flash(failed ? "Some settings could not be saved. Please try again." : "Settings saved successfully!", !failed);
  };

  const stateErr = tried && local.loc === "specific_state" && !local.locState ? "Choose a state, or pick another option." : "";
  const status = msg?.t ?? (n ? (n === 1 ? "1 unsaved change" : `${n} unsaved changes`) : "All changes saved");
  const statusColor = msg ? (msg.ok ? "text-green" : "text-error") : n ? "text-amber-deep" : "text-ink-muted";
  const installLabel = `${installMode === "apk" ? "Download" : "Install"} app`;
  const cookies: [string, boolean, boolean][] = [
    ["Essential", true, true],
    ["Functional", consent.functional, false],
    ["Analytics", consent.analytics, false],
    ["Marketing", consent.marketing, false],
  ];

  const heading = (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className={cn("whitespace-nowrap uppercase text-desk-red", mob ? "text-[10.5px] tracking-[0.16em]" : "text-[11px] tracking-[0.3em]")}>
        Chambers · Preferences
      </span>
      <h1 className={cn("m-0 font-display font-normal", mob ? "text-[clamp(28px,8.5vw,40px)]/none" : "text-[clamp(36px,4vw,52px)]/none")}>SETTINGS</h1>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[radial-gradient(ellipse_80%_50%_at_80%_0%,var(--desk-glow)_0%,var(--desk-bg)_70%)] font-type text-desk-ink">
      <SiteHeader />
      <main className={cn("mx-auto flex min-h-0 w-full max-w-300 flex-1 flex-col", mob ? "gap-2.5 px-3 pb-2.5 pt-3" : "gap-3.5 px-[4vw] pb-4.5 pt-5")}>
        {!wide && heading}
        <div className={cn("grid min-h-0 flex-1", wide ? "grid-cols-[240px_minmax(0,1fr)] gap-10" : "grid-cols-1")}>
          {wide && (
            <div className="flex min-h-0 flex-col gap-6.5">
              {heading}
              <nav aria-label="Settings sections" className="flex flex-col border-t border-desk-rule-mid">
                {secs.map(([id, t], i) => {
                  const cur = active === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => jump(id)}
                      aria-current={cur}
                      className={cn(
                        "grid cursor-pointer grid-cols-[34px_1fr_auto] items-baseline gap-2 border-0 border-b border-desk-rule-mid bg-transparent py-3.25 text-left leading-[1.15] hover:text-desk-hover",
                        cur ? "text-desk-strong" : "text-desk-muted",
                      )}
                    >
                      <span className="font-display text-[17px]/[1.15] text-desk-amber">{NUMS[i].slice(0, -1)}</span>
                      <span className="text-base/[1.15]">{t}</span>
                      <span aria-hidden="true" className={cn("h-1.75 w-1.75 self-center", edited(id) ? "bg-[#e9a33a] light:bg-amber-deep" : "bg-transparent")} />
                    </button>
                  );
                })}
                {!signedIn && !isLoading && <p className="m-0 mt-4 text-[13px] leading-normal text-desk-muted">Sign in to see case, writing and courtroom settings.</p>}
              </nav>
            </div>
          )}

          <section aria-label="Settings" className="flex min-h-0 flex-col bg-paper text-ink shadow-sheet">
            <div className={cn("flex justify-between gap-3 border-b-[3px] border-double border-ink pb-2.5 pt-3.5 text-[11px] font-bold uppercase tracking-[0.2em] text-ink-label", mob ? "px-4" : "px-7")}>
              <span className="whitespace-nowrap">Form P-5</span>
              <span className="min-w-0 truncate">Standing orders</span>
            </div>
            {!wide && (
              <div ref={tabsRef} role="tablist" aria-label="Settings sections" className="flex overflow-x-auto border-b border-ink/20 scrollbar-none [&::-webkit-scrollbar]:hidden">
                {secs.map(([id, , short]) => {
                  const cur = active === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={cur}
                      data-tab={id}
                      onClick={() => jump(id)}
                      className={cn(
                        "h-11 flex-none cursor-pointer whitespace-nowrap border-0 border-b-2 bg-transparent px-3.5 text-[11px] font-bold uppercase tracking-[0.08em]",
                        cur ? "border-seal text-ink" : "border-transparent text-ink-hint",
                      )}
                    >
                      {short}
                    </button>
                  );
                })}
              </div>
            )}

            <div
              ref={scRef}
              data-scroller=""
              onScroll={onScroll}
              className={cn("relative flex min-h-0 flex-1 flex-col gap-9.5 overflow-y-auto overscroll-contain", mob ? "px-4 pb-5 pt-4" : "px-7 pb-6 pt-5.5")}
            >
              <Section id="text" num={num.text} title="Accessibility" edited={edited("text")}>
                <div className="flex flex-col gap-3">
                  <Lead t="Text size" d="Adjust the size of text throughout the application" />
                  <div role="radiogroup" aria-label="Text size" className="grid max-w-115 grid-cols-3 gap-1.5">
                    {(
                      [
                        ["small", "Small", "16px"],
                        ["medium", "Medium", "20px"],
                        ["large", "Large", "25px"],
                      ] as [TextSize, string, string][]
                    ).map(([v, t, fs]) => {
                      const on = local.textSize === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => set("textSize", v)}
                          className={cn("flex h-16 cursor-pointer flex-col items-center justify-center gap-1 border-[1.5px]", on ? "border-ink bg-ink text-paper" : "border-ink/30 bg-transparent text-ink")}
                        >
                          <span className="font-display leading-none" style={{ fontSize: fs }}>
                            Aa
                          </span>
                          <span className="text-xs">{t}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-2 border border-ink/15 bg-[#f8f3e7] px-4.5 py-4">
                  <span className={LABEL}>Preview · Sample argument</span>
                  <p className="m-0 text-pretty leading-[1.6] text-ink" style={{ fontSize: { small: "14px", medium: "16px", large: "19px" }[local.textSize] }}>
                    The plaintiff argues that the defendant breached the contract by failing to deliver the goods on time. This caused significant financial damage to the
                    plaintiff&apos;s business operations.
                  </p>
                </div>
              </Section>

              <Section id="look" num={num.look} title="Appearance">
                <div className="flex flex-col gap-3">
                  <Lead t="Theme" d="Choose a dark or light desk. Documents stay on paper either way. Applies immediately on this device." />
                  <div role="radiogroup" aria-label="Theme" className="grid max-w-140 grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-1.5">
                    {(
                      [
                        ["dark", "Dark", "#070504"],
                        ["light", "Light", "#d9cfbb"],
                        ["system", "Match device", "linear-gradient(90deg,#070504 50%,#d9cfbb 50%)"],
                      ] as const
                    ).map(([v, t, desk]) => {
                      const on = mounted && theme === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setTheme(v)}
                          className={cn("flex cursor-pointer flex-col gap-2.5 border-[1.5px] p-2.5 text-left text-ink hover:border-ink", on ? "border-ink bg-[#f8f3e7]" : "border-ink/25 bg-transparent")}
                        >
                          <span aria-hidden="true" className="relative block h-15.5 overflow-hidden border border-ink/25" style={{ background: desk }}>
                            <span className="absolute inset-x-[20%] -bottom-px top-3 bg-paper shadow-[0_6px_14px_-6px_rgba(0,0,0,.6)]" />
                            <span className="absolute left-[28%] right-[44%] top-5.5 h-0.75 bg-ink" />
                            <span className="absolute left-[28%] right-[32%] top-7.75 h-0.5 bg-ink/35" />
                            <span className="absolute left-[28%] right-[38%] top-9.5 h-0.5 bg-ink/35" />
                          </span>
                          <span className="flex items-center gap-2.5">
                            <Box on={on} />
                            <span className="text-[15px] font-bold">{t}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-ink/12 pt-3.5">
                  <span className="min-w-0 flex-[1_1_260px]">
                    <Lead small t="Install the app" d="Add AI Courtroom to your home screen for instant access, faster loading, and offline support." />
                  </span>
                  {canInstall ? (
                    <button type="button" onClick={openPrompt} className={cn(OUTLINE, "h-11.5 px-4.5")}>
                      {installLabel}
                    </button>
                  ) : (
                    isInstalled && <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-green">Installed on this device</span>
                  )}
                </div>
              </Section>

              {signedIn && (
                <>
                  <Section id="writing" num={num.writing} title="Writing arguments" edited={edited("writing")}>
                    <div className="flex flex-col gap-3">
                      <Lead t="Enter key" d="Control how the Enter key works when typing arguments" />
                      <Options
                        label="Enter key behaviour"
                        value={local.enterSubmits}
                        onPick={(v) => set("enterSubmits", v)}
                        opts={[
                          [true, "Submit on Enter", "Use Shift+Enter for a new line."],
                          [false, "New line on Enter", "Use Ctrl+Enter to submit."],
                        ]}
                      />
                    </div>
                    <div>
                      <Switch on={local.autoExpand} onToggle={() => set("autoExpand", !local.autoExpand)} t="Auto-expand text areas" d="Text boxes grow as you type long arguments." />
                    </div>
                  </Section>

                  <Section id="cases" num={num.cases} title="Case management" edited={edited("cases")}>
                    <div>
                      <Switch on={local.skipArchive} onToggle={() => set("skipArchive", !local.skipArchive)} t="Skip confirmation when archiving cases" />
                      <Switch
                        on={local.skipDelete}
                        onToggle={() => set("skipDelete", !local.skipDelete)}
                        t="Skip confirmation when permanently deleting cases"
                        d="For a faster workflow. You’ll still get 5 seconds to undo."
                      />
                    </div>
                    <div className="flex flex-col gap-3">
                      <Lead t="Case generation location" d="Choose which High Court jurisdiction to use when generating new cases" />
                      <Options
                        label="Case generation location"
                        value={local.loc}
                        onPick={(v) => set("loc", v)}
                        opts={[
                          ["random", "Random High Court", "Cases will be assigned to a random Indian High Court."],
                          ["user_location", "My location", "Uses the location from your profile."],
                          ["specific_state", "Specific state", "Always use a specific Indian state’s High Court."],
                        ]}
                      />
                      {local.loc === "specific_state" && (
                        <div className="flex flex-col gap-1.75 pl-11">
                          <label htmlFor="st-sel" className={LABEL}>
                            State
                          </label>
                          <select
                            id="st-sel"
                            value={local.locState}
                            onChange={(e) => set("locState", e.target.value)}
                            aria-invalid={!!stateErr}
                            className={cn(
                              "h-12 w-full max-w-105 cursor-pointer rounded-none border-0 border-b-2 bg-paper-alt px-2.5 font-data text-[15px] text-ink outline-none scheme-light",
                              stateErr ? "border-error" : "border-ink/55",
                            )}
                          >
                            <option value="">Select a state…</option>
                            {states.map((s) => (
                              <option key={s.state_iso2} value={s.state_iso2}>
                                {s.state_name} — {s.high_court}
                              </option>
                            ))}
                          </select>
                          {stateErr && (
                            <span role="alert" className="text-[13px] text-error">
                              {stateErr}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </Section>

                  <Section id="ai" num={num.ai} title="Courtroom AI" edited={edited("ai")}>
                    <div className="flex flex-col gap-3">
                      <Lead
                        t="Case memory retrieval"
                        d="Every case keeps a searchable memory. Choose whether the courtroom AI reads the most relevant parts of it or the full case record. Case analysis always uses the memory."
                      />
                      <div>
                        <Switch
                          on={local.rag}
                          onToggle={() => set("rag", !local.rag)}
                          t="Use RAG for courtroom AI"
                          d="When off, the AI reads the full case details and courtroom proceedings instead."
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <Lead t="Win rate" d="Choose how a partly successful case (for example, a petition allowed only in part) counts toward the win rate on your profile." />
                      <div className="flex flex-col gap-1.75">
                        <label htmlFor="ps-sel" className={LABEL}>
                          Partial wins count as
                        </label>
                        <select
                          id="ps-sel"
                          value={local.partial}
                          onChange={(e) => set("partial", e.target.value as PartialScoring)}
                          className="h-12 w-full max-w-105 cursor-pointer rounded-none border-0 border-b-2 border-ink/55 bg-paper-alt px-2.5 font-data text-[15px] text-ink outline-none scheme-light"
                        >
                          <option value="zero">A loss (not a win)</option>
                          <option value="half">Half a win</option>
                          <option value="exclude">Left out of the win rate</option>
                        </select>
                      </div>
                    </div>
                    {user.is_developer && (
                      <div className="flex flex-col gap-3">
                        <Lead t="Developer mode" />
                        <div>
                          <Switch
                            on={st.devMode}
                            onToggle={() => st.setDevMode(!st.devMode)}
                            t="Show which AI model answered"
                            d="A panel in the bottom-left corner lists the model, provider and fallback used for each AI response. Applies immediately on this device."
                          />
                        </div>
                      </div>
                    )}
                  </Section>

                  <Section id="notify" num={num.notify} title="Notifications" edited={edited("notify")}>
                    <Lead
                      t="Email notifications"
                      d={
                        user.email ? (
                          <>
                            Sent to <strong className="wrap-anywhere font-data text-[13.5px] font-medium text-ink">{user.email}</strong>. Each one links back here to turn it off.
                          </>
                        ) : (
                          "Your account has no email yet. Add one in your profile to get these."
                        )
                      }
                    />
                    <div>
                      <Switch on={local.nCase} onToggle={() => set("nCase", !local.nCase)} t="Case ready" d="When a case you asked for has finished drafting." />
                      <div className="flex items-center justify-between gap-4 border-t border-ink/12 py-3">
                        <Lead small t="Security alerts" d="New sign-ins, password changes and account deletion requests." />
                        <span className={cn(TAG, "flex-none tracking-[0.16em] text-ink-muted")}>Always on</span>
                      </div>
                    </div>
                  </Section>
                </>
              )}

              <Section id="privacy" num={num.privacy} title="Privacy">
                <Lead t="Cookie preferences" d="Control how we use cookies to personalize your experience and analyze site usage." />
                <div className="flex max-w-115 flex-col border-t border-ink/20">
                  {cookies.map(([t, on, always]) => (
                    <div key={t} className="flex justify-between gap-3 border-b border-ink/12 py-2.5 text-[15px]">
                      <span>{t}</span>
                      <span className={cn("text-[11px] font-bold uppercase tracking-[0.16em]", on ? "text-green" : "text-ink-hint")}>
                        {always ? "Always on" : on ? "On" : "Off"}
                      </span>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={openCookieSettings} className={cn(OUTLINE, "h-11.5 self-start px-4.5")}>
                  Manage cookie preferences
                </button>
              </Section>

              {signedIn && <AccountSection num={num.account} user={user} online={online} refreshUser={refreshUser} />}

              {!signedIn && !isLoading && (
                <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 bg-ink px-4.5 py-4 text-paper">
                  <span className="flex-[1_1_240px] text-sm leading-normal">Log in to access additional settings like case management preferences.</span>
                  <Link
                    href="/login?next=/settings"
                    className="flex h-11 items-center bg-paper px-4.5 text-xs font-bold uppercase tracking-[0.14em] text-ink hover:bg-white hover:text-ink"
                  >
                    Log in
                  </Link>
                </div>
              )}
            </div>

            <div className={cn("flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5 border-t-[3px] border-double border-ink", mob ? "px-4 pb-3.5 pt-3" : "px-7 pb-4 pt-3.5")}>
              <span role="status" aria-live="polite" className={cn("flex-[1_1_180px] text-sm", statusColor)}>
                {status}
              </span>
              <div className={cn("flex gap-2", mob ? "flex-[1_1_100%]" : "flex-none")}>
                <button
                  type="button"
                  onClick={() => {
                    setLocal(saved);
                    setTried(false);
                    setMsg(null);
                  }}
                  disabled={!n}
                  className={cn("h-12.5 border-[1.5px] bg-transparent px-4.5 text-xs font-bold uppercase tracking-[0.14em]", n ? "cursor-pointer border-ink text-ink" : "cursor-default border-ink/35 text-ink/35")}
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!n || saving}
                  className={cn(
                    "h-12.5 flex-1 whitespace-nowrap border-0 px-5.5 text-[13px] font-bold uppercase tracking-[0.14em] text-cream",
                    mob ? "min-w-0" : "min-w-50",
                    n ? "cursor-pointer bg-seal hover:bg-seal-hover" : "cursor-default bg-[#a79c8b]",
                  )}
                >
                  {saving ? "Saving…" : "Save settings"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
