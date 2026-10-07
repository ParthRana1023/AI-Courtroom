"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PracticeStep from "@/components/auth/practice-step";
import { useAuthLayout } from "@/components/auth/kit";
import { formatDate } from "@/components/cases/kit";
import { buttonClass } from "@/components/court/button";
import Scroller from "@/components/court/scroller";
import { useAuth } from "@/contexts/auth-context";
import { useOnline } from "@/hooks/use-online";
import { useViewport } from "@/hooks/use-viewport";
import { caseAPI } from "@/lib/api";
import { needsSeatOfPractice } from "@/lib/auth-redirect";
import { getErrorDetail } from "@/lib/error-utils";
import { caseGenerationRateLimitAPI } from "@/lib/rateLimitAPI";
import { cn } from "@/lib/utils";

const PICKS: [number, string][] = [
  [103, "Murder"],
  [105, "Culpable homicide"],
  [106, "Death by negligence"],
  [115, "Voluntarily causing hurt"],
  [74, "Outraging a woman’s modesty"],
  [85, "Cruelty by husband or relatives"],
  [303, "Theft"],
  [308, "Extortion"],
  [309, "Robbery"],
  [316, "Criminal breach of trust"],
  [318, "Cheating"],
  [351, "Criminal intimidation"],
  [356, "Defamation"],
  [61, "Criminal conspiracy"],
];
const STEPS = ["Reading the sections", "Choosing the type of case", "Drafting the facts and parties", "Preparing the case file"];
const HOW = [
  ["I", "Choose the sections", "Add the BNS sections the case should involve, like 103, 318 or 74."],
  ["II", "The AI drafts the case", "It uses the sections to decide the type of case (criminal, civil or constitutional) and writes a case summary and analysis."],
  ["III", "Prepare for court", "Open the case file, read the facts and build your arguments."],
];

const nameOf = (n: number) => PICKS.find(([x]) => x === n)?.[1] ?? "";
const hms = (t: number) =>
  [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((v) => String(v).padStart(2, "0")).join(":");

export default function NewCasePage() {
  const router = useRouter();
  const online = useOnline();
  const { w, h } = useViewport();
  const wide = w >= 860;
  const mob = w < 560;
  const { user, refreshUser } = useAuth();
  const practiceLayout = useAuthLayout("practice");

  const [sections, setSections] = useState<number[]>([]);
  const [input, setInput] = useState("");
  const [inErr, setInErr] = useState("");
  const [secsErr, setSecsErr] = useState("");
  const [formErr, setFormErr] = useState("");
  const [phase, setPhase] = useState<"form" | "drafting" | "filed">("form");
  const [step, setStep] = useState(0);
  const [newCnr, setNewCnr] = useState("");
  const [quota, setQuota] = useState<{ left: number; max: number; wait: number } | null>(null);
  const inRef = useRef<HTMLInputElement>(null);

  const loadQuota = useCallback(async () => {
    try {
      const r = await caseGenerationRateLimitAPI.getCaseGenerationRateLimit();
      setQuota({ left: r.remaining_attempts, max: r.max_attempts, wait: Math.ceil(r.seconds_until_next ?? 0) });
    } catch {
      setQuota(null); // the server still enforces the limit
    }
  }, []);

  useEffect(() => {
    void loadQuota();
  }, [loadQuota]);

  // Count down to the next free generation.
  const waiting = !!quota && quota.left <= 0 && quota.wait > 0;
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => setQuota((q) => (q ? { ...q, wait: Math.max(0, q.wait - 1) } : q)), 1000);
    return () => window.clearInterval(t);
  }, [waiting]);

  // The drafting record ticks along while the server writes the case; it waits on the last step.
  useEffect(() => {
    if (phase !== "drafting") return;
    const t = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1300);
    return () => window.clearInterval(t);
  }, [phase]);

  const addFrom = (text: string) => {
    const tokens = text.split(/[^0-9]+/).filter(Boolean);
    if (!tokens.length) {
      if (text.trim()) setInErr("Enter a section number, like 103.");
      return false;
    }
    const next = [...sections];
    let err = "";
    for (const t of tokens) {
      const n = parseInt(t, 10);
      if (n < 1 || n > 358) err = `BNS sections run from 1 to 358. § ${n} doesn’t exist.`;
      else if (next.includes(n)) err = `§ ${n} is already on the charge sheet.`;
      else next.push(n);
    }
    setSections(next);
    if (!err) setInput("");
    setInErr(err);
    setSecsErr("");
    return !err;
  };

  const noLeft = !!quota && quota.left <= 0;
  const blocked = noLeft || !online;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    if (input.trim() && !addFrom(input)) return;
    const chosen = input.trim() ? [...new Set([...sections, ...input.split(/[^0-9]+/).filter(Boolean).map(Number)])] : sections;
    if (!chosen.length) {
      setSecsErr("Add at least one section.");
      inRef.current?.focus();
      return;
    }
    setFormErr("");
    setStep(0);
    setPhase("drafting");
    try {
      const created = await caseAPI.generateCase({ sections_involved: chosen.length, section_numbers: chosen });
      setStep(STEPS.length);
      setNewCnr(created.cnr);
      window.setTimeout(() => setPhase("filed"), 700);
      void loadQuota();
    } catch (err) {
      setPhase("form");
      setFormErr(
        !navigator.onLine
          ? "Connection lost while drafting. Your sections are kept, so you can try again when you’re back online."
          : (getErrorDetail(err) ?? "Failed to generate case. Please try again."),
      );
      void loadQuota();
    }
  };

  if (user && needsSeatOfPractice(user)) {
    return (
      <div style={practiceLayout.vars} className="mx-auto flex w-full max-w-[1200px] flex-1 items-center justify-center p-[var(--main-pad)]">
        <PracticeStep onDone={() => void refreshUser()} />
      </div>
    );
  }

  const n = sections.length;
  const quotaText = !online
    ? "Offline. Your sections are kept until you reconnect."
    : !quota
      ? ""
      : noLeft
        ? `Limit reached. Next case in ${hms(quota.wait)}.`
        : `${quota.left} of ${quota.max} case generations left`;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 flex-col gap-2.5 px-3 pb-2.5 pt-3 min-[560px]:gap-3.5 min-[560px]:px-[4vw] min-[560px]:pb-[18px] min-[560px]:pt-5">
      <div className="flex flex-nowrap items-end justify-between gap-x-6 gap-y-3 min-[560px]:flex-wrap">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="whitespace-nowrap text-[10.5px] uppercase tracking-[0.16em] text-desk-red min-[560px]:text-label min-[560px]:tracking-[0.3em]">
            New matter · {formatDate(new Date().toISOString())}
          </span>
          <h1 className="m-0 font-display text-[clamp(28px,8.5vw,40px)] font-normal leading-none min-[560px]:text-[clamp(36px,4vw,52px)]">
            NEW CASE
          </h1>
        </div>
        <Link
          href="/cases"
          className="flex min-h-11 items-center gap-2 whitespace-nowrap border-b border-desk-ink/30 text-xs uppercase tracking-[0.16em] text-desk-soft hover:text-desk-hover"
        >
          <span aria-hidden="true">←</span>
          <span>My cases</span>
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 min-[560px]:gap-3.5">
        <form
          noValidate
          onSubmit={submit}
          aria-label="Generate a new case"
          className={cn("flex flex-1 flex-col bg-paper text-ink shadow-sheet", wide ? "min-h-[340px]" : "min-h-0")}
        >
          <div className="flex justify-between gap-3 border-b-[3px] border-double border-ink px-4 pb-2.5 pt-3.5 text-label font-bold uppercase tracking-[0.2em] text-ink-label min-[560px]:px-7">
            <span className="whitespace-nowrap">Form G-1</span>
            <span className="min-w-0 truncate">Particulars of offence</span>
          </div>

          {phase === "form" && (
            <>
              <Scroller
                className={cn(
                  "grid flex-1 content-start gap-y-5 px-4 pb-5 pt-4 min-[560px]:gap-y-6 min-[560px]:px-7 min-[560px]:pb-[18px] min-[560px]:pt-5",
                  wide ? "grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] grid-rows-[minmax(0,1fr)] gap-x-8 overflow-hidden" : "grid-cols-1",
                )}
              >
                <Scroller className={cn("flex min-w-0 flex-col gap-5 overflow-x-hidden min-[560px]:gap-6", wide && "pr-2")}>
                  {formErr && (
                    <div role="alert" className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 bg-seal px-3.5 py-3 text-sm leading-[1.45] text-cream">
                      <strong className="font-display text-body font-normal tracking-[0.06em]">OBJECTION.</strong>
                      <span>{formErr}</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <label htmlFor="sec-in" className="text-label font-bold uppercase tracking-[0.16em] text-ink-muted">
                      Sections of the Bharatiya Nyaya Sanhita
                    </label>
                    <span id="sec-hint" className="text-pretty text-sm leading-[1.45] text-ink-muted">
                      Type a section number and press Enter. You can add several at once, like 103, 318.
                    </span>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                      <div className="relative min-w-0">
                        <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-data text-lg font-medium text-ink-hint">
                          §
                        </span>
                        <input
                          id="sec-in"
                          ref={inRef}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="e.g. 103"
                          value={input}
                          onChange={(e) => {
                            setInput(e.target.value.replace(/[^0-9,\s]/g, ""));
                            setInErr("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addFrom(input);
                            } else if (e.key === "Backspace" && !input && n) setSections((s) => s.slice(0, -1));
                          }}
                          aria-describedby="sec-hint"
                          aria-invalid={!!inErr || undefined}
                          className="h-12 w-full rounded-none border-0 border-b-2 border-b-[rgba(18,13,9,.55)] bg-paper-alt pl-[38px] pr-3.5 font-data text-base text-ink outline-none placeholder:text-[#857661] focus:bg-paper-hi aria-[invalid=true]:border-b-error min-[560px]:h-[52px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          addFrom(input);
                          inRef.current?.focus();
                        }}
                        className={buttonClass("ink", "lg", "h-12 min-[560px]:h-[52px]")}
                      >
                        Add
                      </button>
                    </div>
                    {inErr && (
                      <span role="alert" className="text-meta text-error">
                        {inErr}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-label font-bold uppercase tracking-[0.16em] text-ink-muted">On the charge sheet</span>
                      <span className="font-data text-xs font-medium text-ink-muted">{n === 1 ? "1 section" : `${n} sections`}</span>
                    </div>
                    {n > 0 ? (
                      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                        {sections.map((x) => (
                          <li key={x}>
                            <button
                              type="button"
                              onClick={() => setSections((s) => s.filter((y) => y !== x))}
                              aria-label={`Remove section ${x}${nameOf(x) ? `, ${nameOf(x)}` : ""}`}
                              className="flex min-h-10 cursor-pointer items-center gap-2.5 bg-ink pl-3 pr-1.5 text-left text-paper hover:bg-ink-label"
                            >
                              <span className="whitespace-nowrap font-data text-sm font-medium text-amber-hi">§ {x}</span>
                              {nameOf(x) && <span className="text-sm">{nameOf(x)}</span>}
                              <span aria-hidden="true" className="w-7 text-center font-data text-lg text-desk-muted">
                                ×
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className={cn("block border-[1.5px] border-dashed px-4 py-3.5 text-sm leading-[1.45] text-ink-hint", secsErr ? "border-error" : "border-ink/35")}>
                        No sections yet. Add one above or pick from the list below.
                      </span>
                    )}
                    {secsErr && (
                      <span role="alert" className="text-meta text-error">
                        {secsErr}
                      </span>
                    )}
                  </div>
                </Scroller>

                <div className={cn("flex min-h-0 min-w-0 flex-col gap-2.5", wide && "border-l border-ink/18 pl-8")}>
                  <span id="picks-label" className="text-label font-bold uppercase tracking-[0.16em] text-ink-muted">
                    Common sections
                  </span>
                  <Scroller
                    role="group"
                    aria-labelledby="picks-label"
                    className={cn(
                      // Rows sized to their content: in a height-capped scroller, auto rows stop at the
                      // buttons' min-height, so a picked section showing its full name would spill.
                      "grid flex-1 auto-rows-max content-start gap-1.5 overflow-x-hidden",
                      mob ? "grid-cols-2" : "grid-cols-[repeat(auto-fill,minmax(190px,1fr))]",
                      wide && "pr-2",
                    )}
                  >
                    {PICKS.map(([x, name]) => {
                      const on = sections.includes(x);
                      return (
                        <button
                          key={x}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            setSections((s) => (on ? s.filter((y) => y !== x) : [...s, x]));
                            setSecsErr("");
                          }}
                          title={name}
                          className={cn(
                            "flex cursor-pointer px-3 py-1.5 text-left hover:border-ink",
                            mob ? "min-h-[60px] flex-col items-start" : "min-h-12 items-center gap-2.5",
                            on ? "border border-ink bg-ink text-paper" : "border border-ink/28 bg-transparent text-ink",
                          )}
                        >
                          <span
                            className={cn(
                              "min-w-12 flex-none whitespace-nowrap font-data text-sm font-medium",
                              mob && "leading-none",
                              on ? "text-amber-hi" : "text-seal",
                            )}
                          >
                            § {x}
                          </span>
                          {/* Two lines at most so the cell keeps its size; a picked section shows its full name. */}
                          <span className={cn("text-sm leading-[1.1]", !on && "line-clamp-2")}>{name}</span>
                        </button>
                      );
                    })}
                  </Scroller>
                </div>
              </Scroller>

              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t-[3px] border-double border-ink px-4 pb-3.5 pt-3 min-[560px]:px-7 min-[560px]:pb-[18px] min-[560px]:pt-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                  {quota && (
                    <div aria-hidden="true" className="flex gap-1">
                      {Array.from({ length: quota.max }, (_, i) => (
                        <span
                          key={i}
                          className={cn("h-3.5 w-3.5 border-[1.5px]", noLeft ? "border-error/60" : "border-ink", i < quota.left ? "bg-ink" : "bg-transparent")}
                        />
                      ))}
                    </div>
                  )}
                  <span className={cn("text-meta leading-[1.4]", !online ? "text-amber-deep" : noLeft ? "text-error" : "text-ink-label")}>
                    {quotaText}
                  </span>
                </div>
                <div className={cn("flex gap-2", mob ? "flex-[1_1_100%]" : "flex-[0_1_auto]")}>
                  <Link href="/cases" className={buttonClass("paper", "lg", "h-[52px] px-[18px] text-xs")}>
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    disabled={blocked}
                    className={buttonClass("seal", "lg", cn("h-[52px] flex-1", !mob && "min-w-60"))}
                  >
                    {!online ? "You’re offline" : noLeft ? "Limit reached" : "Generate case →"}
                  </button>
                </div>
              </div>
            </>
          )}

          {phase === "drafting" && (
            <div role="status" aria-live="polite" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-5 py-8">
              <span className="text-center font-display text-2xl leading-[1.1] min-[560px]:text-[30px]">The clerk is drafting your case</span>
              <ol className="m-0 flex min-w-[min(280px,100%)] list-none flex-col gap-3 p-0">
                {STEPS.map((t, i) => (
                  <li
                    key={t}
                    className={cn("flex items-baseline gap-3 text-base", i < step ? "text-green" : i === step ? "text-ink" : "text-ink-hint")}
                  >
                    <span aria-hidden="true" className="w-[18px] flex-none font-data text-body font-bold">
                      {i < step ? "✓" : i === step ? "›" : "·"}
                    </span>
                    <span>{t + (i === step ? "…" : "")}</span>
                  </li>
                ))}
              </ol>
              <div aria-hidden="true" className="h-[3px] w-[min(280px,100%)] bg-ink/15">
                <div
                  className="h-full bg-seal transition-[width] duration-[900ms] ease-out"
                  style={{ width: `${Math.round((Math.min(step + 0.5, STEPS.length) / STEPS.length) * 100)}%` }}
                />
              </div>
              <span className="break-all text-center font-data text-meta font-medium text-ink-hint">
                {sections.map((x) => `§ ${x}`).join("  ·  ")}
              </span>
            </div>
          )}

          {phase === "filed" && (
            <div role="status" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-5 py-8 text-center">
              <span className="inline-block -rotate-5 border-4 border-double border-seal px-5 pb-1.5 pt-2 font-display text-5xl leading-none tracking-[0.08em] text-seal [animation:ac-stamp_.35s_cubic-bezier(.2,.9,.3,1.2)_both]">
                FILED
              </span>
              <span className="text-base leading-[1.5] text-ink-label">
                Case <strong className="font-data text-body font-medium text-ink">{newCnr}</strong> is ready.
              </span>
              <button type="button" onClick={() => router.push(`/cases/${newCnr}`)} className={buttonClass("seal", "lg", "h-[52px] px-6")}>
                Open the case file →
              </button>
            </div>
          )}
        </form>

        {wide && h >= 720 && (
          <ol aria-label="How it works" className="m-0 grid list-none grid-cols-3 gap-7 p-0">
            {HOW.map(([num, title, body]) => (
              <li key={num} className="grid grid-cols-[30px_1fr] items-baseline gap-x-1.5 gap-y-0.5">
                <span className="font-display text-base text-desk-amber">{num}</span>
                <span className="font-display text-base leading-[1.25] text-desk-ink">{title}</span>
                <span />
                <span className="text-pretty text-meta leading-[1.45] text-desk-muted">{body}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
