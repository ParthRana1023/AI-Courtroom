"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import CourtModelLoader from "@/components/court/court-model-loader";
import Scroller from "@/components/court/scroller";
import Signature from "@/components/court/signature";
import HearingRail, { type Check } from "@/components/settlement/hearing-rail";
import { useOnline } from "@/hooks/use-online";
import { useViewport } from "@/hooks/use-viewport";
import { caseAPI, settlementAPI } from "@/lib/api";
import { getErrorDetail } from "@/lib/error-utils";
import { HEARING_COPY, draftSubmission, longDate, nextAfter } from "@/lib/settlement";
import { caseFonts } from "@/lib/signature";
import { cn } from "@/lib/utils";
import type { Case, HearingLine, SettlementView } from "@/types";

type Stage = "listed" | "submit" | "hearing" | "order";
type Row =
  | { k: "system"; text: string }
  | { k: "speech"; who: string; role: string; tag: string; text: string }
  | { k: "question"; who: string; text: string }
  | { k: "answer"; who: string; unsure: boolean; text: string }
  | { k: "order" };

const LINE_MS = 1700; // one line of the record after another
const RULE: Record<string, [string, string]> = {
  court: ["#8e1f19", "#8e1f19"],
  you: ["#120d09", "#120d09"],
  state: ["#7a4a0c", "#b07a1a"],
};
const OTHER: [string, string] = ["#3e3326", "rgba(18,13,9,.35)"];
const STAMP = { granted: "#3f6b3a", refused: "#8e1f19", adjourned: "#7a4a0c" } as const;
const BTN =
  "h-11.5 cursor-pointer border-0 bg-seal px-5 text-xs font-bold tracking-[0.14em] whitespace-nowrap text-cream uppercase hover:bg-seal-hover";
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const clock = (i: number) => `10:${String(30 + Math.min(i * 2, 29)).padStart(2, "0")}`;

const toRow = (l: HearingLine): Row =>
  l.kind === "system"
    ? { k: "system", text: l.text }
    : l.kind === "question"
      ? { k: "question", who: l.who, text: l.text }
      : l.kind === "answer"
        ? { k: "answer", who: l.who, unsure: l.unsure, text: l.text }
        : { k: "speech", who: l.who, role: l.role, tag: l.tag, text: l.text };

/** The settlement hearing: counsel's submission, the record as the court hears the matter,
 * and the order, with the payments and the negotiation analysis that follow it. */
export default function HearingPage({ params }: { params: Promise<{ cnr: string }> }) {
  const { cnr } = use(params);
  const online = useOnline();
  const { w } = useViewport();
  const mob = w < 860;

  const [kase, setKase] = useState<Case | null>(null);
  const [view, setView] = useState<SettlementView | null>(null);
  const [load, setLoad] = useState<"loading" | "loaded" | "error">("loading");
  const [stage, setStage] = useState<Stage>("listed");
  const [shown, setShown] = useState(0); // lines of the record played so far
  const [draft, setDraft] = useState("");
  const [pane, setPane] = useState<"record" | "checks">("record");
  const [paying, setPaying] = useState<number | null>(null);
  const recRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const fetchAll = useCallback(async () => {
    setLoad("loading");
    try {
      const [c, v] = await Promise.all([caseAPI.getCase(cnr), settlementAPI.get(cnr)]);
      const a = v.attempt;
      setKase(c);
      setView(v);
      setStage(a?.hearing && a.status !== "filed" ? "order" : "listed");
      setShown(a?.hearing?.lines.length ?? 0);
      setLoad("loaded");
    } catch {
      setLoad("error");
    }
  }, [cnr]);

  useEffect(() => {
    void fetchAll();
    return () => clearInterval(timer.current);
  }, [fetchAll]);

  const attempt = view?.attempt ?? null;
  const profile = view?.profile ?? null;
  const route = profile && profile.route !== "none" ? profile.route : null;
  const copy = route ? HEARING_COPY[route] : null;
  const hearing = attempt?.hearing ?? null;
  const lines = hearing?.lines ?? [];
  const forAccused = !!(profile && kase && profile.accused_side === kase.user_role);
  const caseNo = view?.deed?.header[1] ?? "";
  const court = profile?.court.split("·").pop()?.trim() ?? "";
  const listedOn = attempt?.hearing_date ? longDate(attempt.hearing_date) : "";
  const item = `Item ${(Number.parseInt(cnr.slice(-4), 10) % 20) + 1}`;
  const outcome = stage === "order" ? (hearing?.outcome ?? null) : null;
  const judge = hearing?.judge ?? "";
  const judgeFont = useMemo(() => (judge ? caseFonts(cnr, [judge])[judge] : null), [cnr, judge]);
  const judgeTitle = /high court/i.test(court) ? `${judge}, J.` : /cjm|chief judicial/i.test(court) ? `${judge}, CJM` : judge;

  // Follow the record as it grows.
  useEffect(() => {
    const c = recRef.current;
    c?.scrollTo?.({ top: c.scrollHeight, behavior: reduced() ? "auto" : "smooth" });
  }, [shown, stage]);

  const startDraft = () => {
    if (!route || !profile || !attempt?.agreed) return;
    setDraft(draftSubmission(route, forAccused, profile.complainants, attempt.agreed));
    setStage("submit");
  };

  const play = (total: number) => {
    clearInterval(timer.current);
    if (reduced() || total === 0) {
      setShown(total);
      setStage("order");
      return;
    }
    let n = 0;
    timer.current = setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= total) {
        clearInterval(timer.current);
        setStage("order");
      }
    }, LINE_MS);
  };

  const submit = async () => {
    const text = draft.trim();
    if (text.length < 10) {
      toast("Say a sentence or two to the court first.", { duration: 2600 });
      return;
    }
    if (!online) {
      toast("You’re offline. Your submission is kept, so you can make it when you’re back online.", { duration: 2800 });
      return;
    }
    setStage("hearing");
    setShown(0);
    try {
      const v = await settlementAPI.hearing(cnr, text);
      setView(v);
      play(v.attempt?.hearing?.lines.length ?? 0);
    } catch (e) {
      setStage("submit");
      toast.error(getErrorDetail(e) || "The court couldn’t hear the matter just now. Please try again.");
    }
  };

  const skip = () => {
    clearInterval(timer.current);
    setShown(lines.length);
    setStage("order");
  };

  const pay = async (index: number) => {
    if (!route || !attempt || paying !== null) return;
    if (!online) {
      toast("You’re offline. Try again when you’re back online.", { duration: 2600 });
      return;
    }
    const action = attempt.user_pays ? "pay" : ({ quash: "recall", compound: "notice", plea: "recover" } as const)[route];
    setPaying(index);
    try {
      setView(await settlementAPI.payment(cnr, index, action));
      toast(attempt.user_pays ? "Payment recorded." : HEARING_COPY[route].remedy.done, { duration: 2600 });
    } catch (e) {
      toast.error(getErrorDetail(e) || "Couldn’t record that. Please try again.");
    } finally {
      setPaying(null);
    }
  };

  if (load !== "loaded" || !kase || !view) {
    return (
      <div className="mx-auto flex min-h-0 w-full max-w-360 flex-1 flex-col px-3 py-4 min-[860px]:px-8">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3.5 bg-paper px-5 py-8 text-center text-ink">
          {load === "loading" ? (
            <CourtModelLoader status="Calling the matter…" tone="paper" />
          ) : (
            <>
              <span role="alert" className="font-display text-2xl">
                Couldn’t open the hearing
              </span>
              <button type="button" onClick={fetchAll} className={BTN}>
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const listed =
    attempt && ["filed", "adjourned", "recorded", "refused"].includes(attempt.status) && (attempt.status !== "refused" || !!hearing);
  if (!route || !copy || !profile || !attempt?.agreed || !listed) {
    return (
      <div className="mx-auto flex w-full max-w-195 flex-col gap-4 px-3 py-8 min-[860px]:px-8">
        <h1 className="m-0 font-display text-3xl font-normal">No hearing is listed</h1>
        <p className="m-0 text-body leading-[1.6] text-desk-muted">
          A settlement hearing is listed once both sides have signed the deed and it has been filed.
        </p>
        <Link href={`/cases/${cnr}/settlement`} className={cn(BTN, "flex items-center gap-2.5 self-start")}>
          <span aria-hidden="true">←</span>
          <span>Back to the settlement desk</span>
        </Link>
      </div>
    );
  }

  const rows: Row[] = [
    { k: "system", text: `${item} · ${court} · ${copy.sub}` },
    { k: "speech", who: "The Court", role: "court", tag: "", text: copy.call(kase.title, caseNo) },
  ];
  const heardNow = stage === "hearing" || stage === "order";
  if (heardNow) {
    rows.push({
      k: "speech",
      who: forAccused ? "You · counsel for the accused" : "You · counsel for the complainants",
      role: "you",
      tag: "",
      text: stage === "hearing" && !hearing?.submission ? draft : (hearing?.submission ?? draft),
    });
    rows.push(...lines.slice(0, shown).map(toRow));
  }
  if (stage === "order" && hearing) rows.push({ k: "order" });

  const checks: Check[] =
    outcome && hearing?.checks.length
      ? hearing.checks
      : copy.checks.map((label) => ({ label, state: "wait", text: "The court hears this." }));
  const visible = heardNow ? lines.slice(0, shown) : [];
  const answerOf = (name: string) => visible.find((l) => l.kind === "answer" && l.who.includes(name));
  const many = profile.complainants.length > 3;
  const complainants = (many ? profile.complainants.slice(0, 2) : profile.complainants).map((name, i) => {
    const a = answerOf(name);
    return {
      name,
      role: i === 0 ? "Lead complainant" : "Complainant",
      state: (a ? (a.unsure ? "Unsure" : "Confirmed") : "Waiting") as "Confirmed" | "Unsure" | "Waiting",
    };
  });
  if (many)
    complainants.push({
      name: `${profile.complainants.length - 2} others`,
      role: "Identified by the investigating officer",
      state: outcome === "granted" ? "Confirmed" : "Waiting",
    });

  const next = outcome && hearing ? nextAfter(route, outcome, hearing.next_date ? longDate(hearing.next_date) : listedOn) : null;
  const missed = attempt.payments.some((p) => p.status === "missed" && !p.remedy);
  const stepAt = stage === "listed" ? 0 : stage !== "order" ? 1 : outcome === "granted" ? 3 : 2;
  const steps = [
    ["Listed", `${item} · ${listedOn}`],
    copy.s2,
    copy.s3,
    ["Compliance", missed ? "An instalment is missed" : `Payments tracked against the ${route === "plea" ? "sentence" : "order"}`],
  ].map(([t, d], i) => {
    const cur = i === stepAt;
    const done = i < stepAt;
    const end = stage === "order" && outcome !== "granted" && i === 3;
    return { t, d, i, cur, done, mark: end ? "—" : i === 3 && missed ? "!" : done ? "✓" : "" };
  });
  const chip =
    stage === "order" && outcome
      ? { t: copy.chip[outcome], c: { granted: "#5f9a58", refused: "#e0453a", adjourned: "#e9c77e" }[outcome] }
      : stage === "listed"
        ? { t: "Listed", c: "#e9c77e" }
        : { t: "In session", c: "#e0453a" };
  const nextHref = next?.to === "cases" ? "/cases" : next?.to === "prep" ? `/cases/${cnr}/case-prep` : null;
  const gut = `${mob ? 22 : 52}px minmax(0,1fr)`;
  const say = mob ? "text-[14.5px]" : "text-[15.5px]";

  return (
    <div
      className={cn("mx-auto flex min-h-0 w-full max-w-360 flex-1 flex-col", mob ? "gap-3 px-2.5 pt-3.5 pb-2.5" : "gap-4 px-8 pt-5 pb-6")}
    >
      <div className="flex flex-none flex-col gap-1.5">
        <Link
          href={`/cases/${cnr}/settlement`}
          className="flex min-h-7 items-center gap-2 self-start text-xs tracking-[0.16em] text-desk-soft uppercase hover:text-desk-hover"
        >
          <span aria-hidden="true">←</span>
          <span>Settlement</span>
        </Link>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <h1 className={cn("m-0 font-display leading-[1.05] font-normal", mob ? "text-[26px]" : "text-[34px]")}>{kase.title}</h1>
          <span
            className="border-[1.5px] px-2.25 pt-1 pb-0.75 text-[10.5px] leading-[1.4] font-bold tracking-[0.18em] whitespace-nowrap uppercase"
            style={{ borderColor: chip.c, color: chip.c }}
          >
            {chip.t}
          </span>
        </div>
        <span className="text-[13.5px] leading-[1.4] text-desk-muted">
          {copy.sub} · You are{" "}
          <strong className="text-desk-ink">{forAccused ? "counsel for the accused" : "counsel for the complainants"}</strong>
          {caseNo && (
            <>
              {" · "}
              <span className="font-data text-xs font-medium">{caseNo}</span>
            </>
          )}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-paper text-ink shadow-sheet">
        <ol aria-label="After filing" className="m-0 flex flex-none list-none gap-0.5 border-b border-ink/20 p-0">
          {steps.map((s) => (
            <li
              key={s.i}
              aria-current={s.cur ? "step" : undefined}
              title={s.d}
              className={cn("flex h-10 min-w-0 items-center gap-2 border-t-[3px]", mob ? "px-2" : "px-3.5")}
              style={{
                flex: mob ? (s.cur ? "1 1 auto" : "0 0 auto") : s.cur ? "2.6 1 0" : "1 1 0",
                background: s.cur ? "#120d09" : s.done ? "#e9dfcb" : "transparent",
                color: s.cur ? "#efe6d3" : s.done ? "#3e3326" : "#6b5d4b",
                borderTopColor: s.cur ? "#8e1f19" : s.done ? "#3f6b3a" : "rgba(18,13,9,.2)",
              }}
            >
              <span className="font-data text-[11px] font-medium">0{s.i + 1}</span>
              {(!mob || s.cur) && (
                <span className="flex-none text-[11px] font-bold tracking-[0.12em] whitespace-nowrap uppercase">{s.t}</span>
              )}
              {!mob && s.cur && <span className="min-w-0 truncate text-[12.5px] text-[#b9ad97]">· {s.d}</span>}
              <span className="ml-auto font-data text-[11px] font-medium">{s.mark}</span>
            </li>
          ))}
        </ol>

        {mob && (
          <div role="tablist" aria-label="Hearing sections" className="mx-3.5 mt-1.5 flex flex-none border-b-[1.5px] border-ink">
            {(["record", "checks"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={pane === k}
                onClick={() => setPane(k)}
                className={cn(
                  "-mb-[1.5px] flex h-11.5 flex-[1_1_0] cursor-pointer items-center justify-center border-0 border-b-[3px] bg-transparent text-[11.5px] font-bold tracking-[0.12em] uppercase",
                  pane === k ? "border-seal text-ink" : "border-transparent text-ink-meta",
                )}
              >
                {k === "record" ? "Record" : "Checks"}
              </button>
            ))}
          </div>
        )}

        <div
          className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]"
          style={{ gridTemplateColumns: mob ? "minmax(0,1fr)" : w >= 1180 ? "minmax(0,1fr) 380px" : "minmax(0,1fr) 320px" }}
        >
          <section
            aria-label="Record of proceedings"
            className={cn("min-h-0 min-w-0 flex-col", !mob || pane === "record" ? "flex" : "hidden", !mob && "border-r border-ink/18")}
          >
            <div
              className={cn(
                "flex flex-none justify-between gap-3 border-b-[3px] border-double border-ink pt-3 pb-2.5 text-[11px] font-bold tracking-[0.2em] text-ink-label uppercase",
                mob ? "px-3.5" : "px-6",
              )}
            >
              <span className="whitespace-nowrap">Record of proceedings</span>
              <span className="whitespace-nowrap">{rows.length} entries</span>
            </div>
            <Scroller
              ref={recRef}
              role="log"
              tabIndex={0}
              aria-live="polite"
              className={cn("flex flex-1 flex-col gap-5 overflow-x-hidden pt-4.5 pb-5.5", mob ? "px-3.5" : "px-6")}
            >
              {rows.map((r, i) => (
                <div key={i} className="grid gap-x-2.5 min-[860px]:gap-x-4" style={{ gridTemplateColumns: gut }}>
                  <div className="flex flex-col items-end gap-0.5 pt-0.75">
                    <span className="font-data text-[11.5px] font-medium text-ink-meta">{String(i + 1).padStart(2, "0")}</span>
                    {!mob && <span className="font-data text-[10.5px] font-medium text-ink-meta">{clock(i)}</span>}
                  </div>
                  {r.k === "system" && (
                    <div className="flex min-w-0 items-center gap-3.5 py-0.5">
                      <span className="flex-1 border-t border-ink/30" />
                      <span className="max-w-[75%] text-center text-[10.5px] font-bold tracking-[0.18em] text-balance text-ink-label uppercase">
                        {r.text}
                      </span>
                      <span className="flex-1 border-t border-ink/30" />
                    </div>
                  )}
                  {r.k === "speech" && (
                    <div
                      className="flex min-w-0 flex-col gap-1.5 border-l-[3px] pl-3.5"
                      style={{ borderLeftColor: (RULE[r.role] ?? OTHER)[1] }}
                    >
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                        <span className="text-[10.5px] font-bold tracking-[0.18em] uppercase" style={{ color: (RULE[r.role] ?? OTHER)[0] }}>
                          {r.who}
                        </span>
                        {r.tag && (
                          <span
                            className="border px-1.5 pt-0.5 pb-px text-[10.5px] font-bold tracking-[0.16em] uppercase"
                            style={{
                              borderColor: r.tag === "Opposes" ? "#8e1f19" : "#3f6b3a",
                              color: r.tag === "Opposes" ? "#8e1f19" : "#3f6b3a",
                            }}
                          >
                            {r.tag}
                          </span>
                        )}
                      </div>
                      <p className={cn("m-0 max-w-[76ch] leading-[1.7] text-pretty text-ink", say)}>{r.text}</p>
                    </div>
                  )}
                  {r.k === "question" && (
                    <div className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)] gap-x-2 min-[860px]:pl-3.5">
                      <span className="font-display text-lg leading-[1.35] text-seal">Q.</span>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-[10.5px] font-bold tracking-[0.18em] text-ink-meta uppercase">{r.who}</span>
                        <p className={cn("m-0 max-w-[72ch] leading-[1.6] text-pretty text-ink italic", say)}>{r.text}</p>
                      </div>
                    </div>
                  )}
                  {r.k === "answer" && (
                    <div
                      className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)] gap-x-2 border py-3 pr-4 pl-2.5 min-[860px]:ml-3.5"
                      style={{ background: r.unsure ? "#f6e3b8" : "#f3e6c6", borderColor: r.unsure ? "#7a4a0c" : "rgba(154,91,18,.3)" }}
                    >
                      <span className="font-display text-lg leading-[1.35] text-amber">A.</span>
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-[10.5px] font-bold tracking-[0.18em] text-amber uppercase">{r.who}</span>
                        <p className={cn("m-0 max-w-[72ch] leading-[1.65] text-pretty text-ink", say)}>{r.text}</p>
                      </div>
                    </div>
                  )}
                  {r.k === "order" && hearing && outcome && (
                    <article
                      aria-label="Order of the court"
                      className="flex max-w-[78ch] min-w-0 flex-col gap-3 border border-ink/25 bg-[#f8f3e7] px-5.5 py-5 shadow-[0_18px_40px_-24px_rgba(18,13,9,.5)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-col gap-0.75">
                          <span className="font-data text-[11px] leading-normal font-medium tracking-[0.06em] text-ink-muted uppercase">
                            {court} · {longDate(hearing.held_at.slice(0, 10))}
                          </span>
                          <h3 className="m-0 font-display text-[22px] leading-[1.15] font-normal">Order</h3>
                        </div>
                        <span
                          className="animate-[ac-stamp_.5s_cubic-bezier(.2,.8,.2,1)_both] border-4 border-double px-3.5 pt-2 pb-1.5 font-display text-lg leading-none tracking-[0.08em] [--stamp-rot:-4deg]"
                          style={{ borderColor: STAMP[outcome], color: STAMP[outcome] }}
                        >
                          {copy.stamp[outcome]}
                        </span>
                      </div>
                      <ol className="m-0 flex list-none flex-col gap-2 p-0">
                        {hearing.order.map((p, j) => (
                          <li key={j} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 text-[14.5px] leading-[1.6] text-ink">
                            <span className="font-data text-[12.5px] leading-[1.8] font-medium text-seal">{j + 1}.</span>
                            <span className="text-pretty">{p}</span>
                          </li>
                        ))}
                      </ol>
                      <div className="flex w-[min(220px,100%)] flex-col items-end gap-0.75 self-end pt-1.5">
                        {judgeFont && (
                          <Signature
                            name={judge}
                            font={judgeFont}
                            color="#120d09"
                            align="right"
                            delay={500}
                            className="h-10 w-full max-w-50 origin-bottom-left -rotate-2"
                          />
                        )}
                        <span className="self-stretch border-t-[1.5px] border-ink" />
                        <span className="text-[13px] font-bold">{judgeTitle}</span>
                        <span className="text-xs text-ink-muted">{court}</span>
                      </div>
                    </article>
                  )}
                </div>
              ))}
              {stage === "hearing" && (
                <div role="status" className="grid gap-x-4" style={{ gridTemplateColumns: gut }}>
                  <span />
                  <span className="flex items-center gap-1.5 pl-3.5 text-[14.5px] text-ink-meta italic">
                    <span>{shown < 2 ? "Counsel and the State are heard…" : "The court is examining the complainants…"}</span>
                    <span aria-hidden="true" className="inline-block h-0.5 w-2 animate-[ac-cursor_1s_steps(1)_infinite] bg-seal" />
                  </span>
                </div>
              )}
            </Scroller>

            <div
              className={cn(
                "flex flex-none flex-col gap-2.5 border-t-[3px] border-double border-ink bg-[#e9dfcb]",
                mob ? "px-3.5 pt-3 pb-3.5" : "px-6 pt-3.5 pb-4",
              )}
            >
              {stage === "listed" && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                  <span className="flex-[1_1_280px] text-sm leading-normal text-pretty text-ink-label">
                    {item} is next{listedOn ? `, listed for ${listedOn}` : ""}. Counsel for both sides, the State and the complainants are
                    present.
                  </span>
                  <button type="button" onClick={startDraft} className={cn(BTN, mob && "flex-[1_1_100%]")}>
                    Call the matter →
                  </button>
                </div>
              )}
              {stage === "submit" && (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3.5 gap-y-1.5">
                    <span className="text-[10.5px] font-bold tracking-[0.18em] text-ink-label uppercase">Your submission</span>
                    <span className="text-[12.5px] text-ink-muted">Pre-filled from the deed. Keep it brief.</span>
                  </div>
                  <textarea
                    aria-label="Your submission"
                    value={draft}
                    maxLength={2000}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    className="min-h-21 w-full resize-y rounded-none border-[1.5px] border-ink bg-[#f8f3e7] px-3 py-2.5 text-[14.5px] leading-[1.55] text-ink outline-none focus:border-seal focus:shadow-[0_0_0_3px_rgba(142,31,25,.18)]"
                  />
                  <div className="flex justify-end">
                    <button type="button" onClick={() => void submit()} className={cn(BTN, mob && "flex-[1_1_100%]")}>
                      Make submission
                    </button>
                  </div>
                </>
              )}
              {stage === "hearing" && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                  <span className="flex-[1_1_260px] text-sm leading-normal text-ink-label">
                    The court is hearing the matter. You don’t need to act until it passes an order.
                  </span>
                  {hearing && (
                    <button
                      type="button"
                      onClick={skip}
                      className="min-h-10 cursor-pointer border-0 bg-transparent px-0.5 text-[11px] font-bold tracking-[0.14em] text-ink uppercase underline underline-offset-4 hover:text-seal"
                    >
                      Skip to the order
                    </button>
                  )}
                </div>
              )}
              {stage === "order" && next && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                  <span className="flex-[1_1_260px] text-sm leading-normal text-pretty text-ink-label">{next.line}</span>
                  {nextHref ? (
                    <Link href={nextHref} className={cn(BTN, "flex items-center justify-center gap-2.5", mob && "flex-[1_1_100%]")}>
                      <span>{next.cta}</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  ) : (
                    <button type="button" onClick={startDraft} className={cn(BTN, mob && "flex-[1_1_100%]")}>
                      {next.cta} →
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          <HearingRail
            profile={profile}
            checks={checks}
            complainants={complainants}
            terms={attempt.agreed}
            next={next}
            payments={outcome === "granted" ? attempt.payments : []}
            userPays={!!attempt.user_pays}
            busy={paying}
            onPay={(i) => void pay(i)}
            score={attempt.score}
            cnr={cnr}
            show={!mob || pane === "checks"}
          />
        </div>
      </div>
    </div>
  );
}
