"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertDialog } from "radix-ui";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import CourtModelLoader from "@/components/court/court-model-loader";
import Scroller from "@/components/court/scroller";
import { buttonClass } from "@/components/court/button";
import { STATUSES, formatDate } from "@/components/cases/kit";
import { useOnline } from "@/hooks/use-online";
import { useViewport } from "@/hooks/use-viewport";
import { caseAPI } from "@/lib/api";
import { NUMERALS, SECTIONS, readCaseFile, sideNames, type Item, type Row, type SectionId } from "@/lib/case-file";
import { cn } from "@/lib/utils";
import type { Case } from "@/types";

type Side = "plaintiff" | "defendant";
type Load = "loading" | "loaded" | "error" | "notfound";

const OFFLINE = "You’re offline. Choose a side when you’re back online.";
const BUSY = ["Recording your appearance…", "Preparing the evidence images…", "Opening Case Prep…"];
const BUSY_PCT = ["20%", "65%", "100%"];

export default function CaseDetails({ params }: { params: Promise<{ cnr: string }> }) {
  const { cnr } = use(params);
  const router = useRouter();
  const online = useOnline();
  const { w } = useViewport();
  const wide = w >= 860;
  const mob = w < 560;

  const [data, setData] = useState<Case | null>(null);
  const [load, setLoad] = useState<Load>("loading");
  const [active, setActive] = useState<SectionId>("summary");
  const [dialog, setDialog] = useState<Side | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);

  const scRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const raf = useRef(0);
  const lock = useRef(0);

  const fetchCase = useCallback(async () => {
    setLoad("loading");
    try {
      setData(await caseAPI.getCase(cnr));
      setLoad("loaded");
    } catch (e) {
      const code = isAxiosError(e) ? e.response?.status : undefined;
      setLoad(code === 404 || code === 403 ? "notfound" : "error");
    }
  }, [cnr]);

  useEffect(() => {
    void fetchCase();
    return () => cancelAnimationFrame(raf.current);
  }, [fetchCase]);

  const file = useMemo(() => readCaseFile(data?.case_text ?? "", data?.evidence ?? []), [data]);
  const role: Side | null = data?.user_role === "plaintiff" || data?.user_role === "defendant" ? data.user_role : null;
  const status = load === "loaded" && data ? (STATUSES.find(([k]) => k === data.status)?.[1] ?? data.status) : "—";

  /** Eased scroll to a section; the reader's wheel or touch cancels it. */
  const jump = (id: SectionId) => {
    const sc = scRef.current;
    const el = sc?.querySelector<HTMLElement>(`#s-${id}`);
    setActive(id);
    if (!sc || !el) return;
    const from = sc.scrollTop;
    const to = Math.max(0, Math.min(el.offsetTop - 14, sc.scrollHeight - sc.clientHeight));
    const dist = to - from;
    cancelAnimationFrame(raf.current);
    lock.current = Date.now() + 2000;
    const done = () => {
      lock.current = Date.now();
      sc.removeEventListener("wheel", cancel);
      sc.removeEventListener("touchstart", cancel);
    };
    const cancel = () => {
      cancelAnimationFrame(raf.current);
      done();
    };
    if (Math.abs(dist) < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      sc.scrollTop = to;
      return done();
    }
    sc.addEventListener("wheel", cancel, { passive: true });
    sc.addEventListener("touchstart", cancel, { passive: true });
    const dur = Math.min(950, 420 + Math.abs(dist) * 0.22);
    const t0 = performance.now();
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      sc.scrollTop = from + dist * ease(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else done();
    };
    raf.current = requestAnimationFrame(tick);
  };

  /** Keeps the index in step with the file: it scrolls in proportion, and the section in view is current. */
  const onScroll = () => {
    const sc = scRef.current;
    const nav = navRef.current;
    if (!sc) return;
    if (nav) {
      const max = sc.scrollHeight - sc.clientHeight;
      nav.scrollTop = max > 0 ? (sc.scrollTop / max) * (nav.scrollHeight - nav.clientHeight) : 0;
    }
    if (lock.current && Date.now() - lock.current < 700) return;
    let cur: SectionId = SECTIONS[0][0];
    sc.querySelectorAll<HTMLElement>("[data-sec]").forEach((el) => {
      if (el.offsetTop - 60 <= sc.scrollTop) cur = el.id.slice(2) as SectionId;
    });
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) cur = SECTIONS[SECTIONS.length - 1][0];
    setActive(cur);
  };

  const pick = (side: Side) => {
    if (!online) {
      toast(OFFLINE, { duration: 2600 });
      return;
    }
    setDialog(side);
  };

  const confirmSide = async () => {
    if (!dialog) return;
    const side = dialog;
    setBusy(true);
    setStep(0);
    const t = setTimeout(() => setStep(1), 700);
    try {
      await caseAPI.updateCaseRoles(cnr, side, side === "plaintiff" ? "defendant" : "plaintiff");
      clearTimeout(t);
      setStep(2);
      setTimeout(() => router.push(`/cases/${cnr}/case-prep`), 700);
    } catch {
      clearTimeout(t);
      setBusy(false);
      setDialog(null);
      toast.error("Couldn’t record your side. Please try again.");
    }
  };

  const names = sideNames(file.parties);
  const copy =
    dialog === "plaintiff"
      ? {
          title: "Represent the plaintiff?",
          body: `You’ll prepare and argue the case for ${names.plaintiff}. The AI will argue for ${names.defendant}. Choosing a side also prepares the evidence images for this case.`,
          cta: "Take the plaintiff’s side",
        }
      : {
          title: "Represent the defendant?",
          body: `You’ll prepare and argue the case for ${names.defendant}. The AI will argue for ${names.plaintiff}. Choosing a side also prepares the evidence images for this case.`,
          cta: "Take the defendant’s side",
        };

  const meta = [file.court, data && `Filed ${formatDate(data.created_at)}`].filter(Boolean).join(" · ");
  const chip = (
    <span className="whitespace-nowrap border-[1.5px] border-desk-soft px-2 pb-0.5 pt-0.75 text-[10.5px] font-bold uppercase tracking-[0.14em] text-desk-soft">
      {status}
    </span>
  );
  const back = (
    <Link
      href="/cases"
      className={cn(
        "flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-desk-soft hover:text-desk-hover",
        wide ? "min-h-8 self-start border-b border-desk-strip-rule" : "min-h-9",
      )}
    >
      <span aria-hidden="true">←</span>
      <span>My cases</span>
    </Link>
  );

  return (
    <div className={cn("mx-auto flex min-h-0 w-full max-w-300 flex-1 flex-col", mob ? "gap-2.5 px-3 pb-2.5 pt-3" : "gap-3.5 px-[4vw] pb-4.5 pt-5")}>
      {!wide && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2.5">
            {back}
            {chip}
          </div>
          <span className="font-data text-xs font-medium tracking-[0.04em] text-desk-muted">{cnr}</span>
          {data && <h1 className="m-0 text-balance font-display text-[clamp(22px,6.4vw,30px)] font-normal leading-[1.12]">{data.title}</h1>}
          {load === "loaded" && (
            <select
              aria-label="Jump to section"
              value={active}
              onChange={(e) => jump(e.target.value as SectionId)}
              className="h-10 cursor-pointer rounded-none border border-[rgba(239,230,211,.22)] bg-ink px-2.5 font-type text-[13px] text-paper"
            >
              {SECTIONS.map(([id, t], i) => (
                <option key={id} value={id}>
                  {NUMERALS[i]}. {t}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className={cn("grid min-h-0 flex-1", wide ? "grid-cols-[300px_minmax(0,1fr)] gap-10" : "grid-cols-[minmax(0,1fr)]")}>
        {wide && (
          <div className="flex min-h-0 flex-col gap-4.5 overflow-hidden">
            {back}
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-data text-xs font-medium tracking-[0.04em] text-desk-muted">{cnr}</span>
                {chip}
              </div>
              {data && <h1 className="m-0 text-balance font-display text-[clamp(24px,2.4vw,32px)] font-normal leading-[1.12]">{data.title}</h1>}
              {load === "loaded" && (
                <div className="flex flex-col gap-1 text-[13px] leading-normal text-desk-muted">
                  {meta && <span>{meta}</span>}
                  {file.charges.length > 0 && <span>{file.charges.join(" · ")}</span>}
                </div>
              )}
            </div>
            {load === "loaded" && (
              <nav
                ref={navRef}
                aria-label="Case file contents"
                className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain border-t border-desk-rule pb-6 mask-[linear-gradient(#000_calc(100%-32px),transparent)] scrollbar-none [&::-webkit-scrollbar]:hidden"
              >
                {SECTIONS.map(([id, t], i) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => jump(id)}
                    aria-current={active === id ? "true" : undefined}
                    className={cn(
                      "grid flex-none cursor-pointer grid-cols-[36px_1fr] items-baseline gap-1.5 border-b border-desk-rule py-2.25 text-left hover:text-desk-hover",
                      active === id ? "text-desk-strong" : "text-desk-muted",
                    )}
                  >
                    <span className="font-display text-[15px] text-desk-amber">{NUMERALS[i]}</span>
                    <span className="text-sm leading-[1.35]">{t}</span>
                  </button>
                ))}
              </nav>
            )}
          </div>
        )}

        <article aria-label="Case file" className="flex min-h-0 flex-col bg-paper text-ink shadow-sheet">
          <div className={cn("flex justify-between gap-3 border-b-[3px] border-double border-ink pb-2.5 pt-3.5 text-label font-bold uppercase tracking-[0.2em] text-ink-label", mob ? "px-4" : "px-8")}>
            <span className="whitespace-nowrap">Case file</span>
            <span className="min-w-0 truncate">{cnr}</span>
          </div>

          {load === "loading" && (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 py-5">
              <CourtModelLoader status="Fetching the case file…" tone="paper" />
            </div>
          )}

          {(load === "error" || load === "notfound") && (
            <div role="alert" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-5 py-8 text-center">
              <span className="font-display text-[26px]">{load === "notfound" ? "Case Not Found" : "Couldn’t open the case file"}</span>
              <span className="max-w-105 text-balance text-body leading-[1.55] text-ink-label">
                {load === "notfound"
                  ? "The case you’re looking for doesn’t exist or you don’t have permission to view it."
                  : "Failed to load case details. Please try again later."}
              </span>
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/cases" className={buttonClass("paper", "md", "px-4.5")}>
                  Back to my cases
                </Link>
                {load === "error" && (
                  <button type="button" onClick={fetchCase} className={buttonClass("seal", "md", "px-4.5")}>
                    Try again
                  </button>
                )}
              </div>
            </div>
          )}

          {load === "loaded" && (
            <>
              <Scroller ref={scRef} onScroll={onScroll} tabIndex={0} role="region" aria-label="Case file text" className={cn("relative flex flex-1 flex-col gap-8.5", mob ? "px-4 pb-5.5 pt-4.5" : "px-10 pb-7.5 pt-6.5")}>
                <Section id="summary">
                  {file.summary.map((p, i) => (
                    <p key={i} className="m-0 text-pretty text-base leading-[1.7] text-[#2a2018]">
                      {p}
                    </p>
                  ))}
                  {file.relief.length > 0 && (
                    <>
                      <Sub>Relief sought</Sub>
                      <Numbered items={file.relief} />
                    </>
                  )}
                  {!file.summary.length && !file.relief.length && <Empty />}
                </Section>
                <Section id="parties">{file.parties.length ? <Rows rows={file.parties} mob={mob} /> : <Empty />}</Section>
                <Section id="facts">
                  {file.facts.length > 0 && <Numbered items={file.facts} />}
                  {file.chronology.length > 0 && (
                    <>
                      <Sub>Chronology</Sub>
                      <Rows rows={file.chronology} mob={mob} />
                    </>
                  )}
                  {!file.facts.length && !file.chronology.length && <Empty />}
                </Section>
                <Section id="charges">{file.counts.length ? <Rows rows={file.counts} mob={mob} /> : <Empty />}</Section>
                <Section id="evidence">
                  {file.exhibits.length ? (
                    <div className="flex flex-col gap-2">
                      {file.exhibits.map((x) => (
                        <div key={x.ref + x.title} className="grid grid-cols-[62px_1fr] gap-3.5 border border-ink/15 bg-[#f8f3e7] px-3.5 py-3">
                          <span className="self-start border-[1.5px] border-seal pb-0.75 pt-1 text-center font-data text-xs font-bold text-seal">{x.ref}</span>
                          <span className="flex flex-col gap-0.75">
                            <span className="text-[15px] font-bold leading-[1.4]">{x.title}</span>
                            <span className="text-pretty text-[14.5px] leading-[1.55] text-ink-label">{x.text}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty />
                  )}
                </Section>
                <Section id="issues">{file.issues.length ? <Numbered items={file.issues} /> : <Empty />}</Section>
              </Scroller>

              <div
                className={cn(
                  "flex items-center gap-x-4 gap-y-2.5 border-t-[3px] border-double border-ink",
                  mob ? "flex-wrap px-2.5 pb-2.5 pt-2" : "flex-nowrap px-8 pb-2.5 pt-2.25",
                )}
              >
                {!role ? (
                  <>
                    <span className={cn("flex-none whitespace-nowrap font-display", mob ? "text-[15px]" : "text-[17px]")}>Choose your side</span>
                    <div className={cn("ml-auto flex min-w-0 gap-1.5", mob ? "flex-[1_1_100%]" : "max-w-105 flex-[1_1_auto]")}>
                      {(["plaintiff", "defendant"] as const).map((side) => {
                        const label = side === "plaintiff" ? "Plaintiff Lawyer" : "Defendant Lawyer";
                        const tip = side === "plaintiff" ? "Represent the plaintiff/applicant side" : "Represent the defendant/respondent side";
                        return (
                          <button
                            key={side}
                            type="button"
                            onClick={() => pick(side)}
                            title={tip}
                            aria-label={`${label}: ${tip}`}
                            className={cn(
                              "h-10.5 min-w-0 flex-[1_1_0] cursor-pointer whitespace-nowrap px-3.5 text-xs font-bold uppercase tracking-[0.12em]",
                              side === "defendant" && "border-[1.5px] border-ink",
                              !online
                                ? "bg-[#cfc4ad] text-[#6f6556]"
                                : side === "plaintiff"
                                  ? "bg-ink text-paper hover:bg-ink-label"
                                  : "bg-transparent text-ink hover:bg-[#f8f3e7]",
                            )}
                          >
                            {w < 1100 ? label.replace(" Lawyer", "") : label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <span className="flex-none -rotate-2 whitespace-nowrap border-[3px] border-double border-seal px-2.5 pb-0.75 pt-1 font-display text-[13px] leading-none tracking-[0.06em] text-seal">
                      {role === "plaintiff" ? "FOR THE PLAINTIFF" : "FOR THE DEFENCE"}
                    </span>
                    <span className="min-w-0 flex-[1_1_auto] truncate text-sm leading-[1.3] text-ink-label">
                      You are the <strong className="text-ink">{role === "plaintiff" ? "Plaintiff" : "Defendant"} Lawyer</strong>
                    </span>
                    <Link href={`/cases/${cnr}/case-prep`} className={buttonClass("seal", "md", "h-10.5 flex-none px-4.5")}>
                      Open Case Prep →
                    </Link>
                  </>
                )}
              </div>
            </>
          )}
        </article>
      </div>

      <AlertDialog.Root open={!!dialog} onOpenChange={(open) => !open && !busy && setDialog(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-60 bg-(--scrim) animate-[ac-fade_.2s_ease_both]" />
          {dialog && (
            <AlertDialog.Content
              onEscapeKeyDown={(e) => busy && e.preventDefault()}
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-confirm]")?.focus();
              }}
              className="fixed left-1/2 top-1/2 z-61 flex w-[calc(100%-32px)] max-w-120 -translate-x-1/2 -translate-y-1/2 flex-col gap-4 bg-paper px-6.5 pb-5.5 pt-6.5 font-type text-ink shadow-dialog outline-none"
            >
              <div className="flex justify-between gap-3 border-b-[3px] border-double border-ink pb-2.5 text-label font-bold uppercase tracking-[0.2em] text-ink-label">
                <span>Appearance</span>
                <span>{cnr}</span>
              </div>
              {!busy ? (
                <>
                  <AlertDialog.Title className="m-0 font-display text-[26px] font-normal leading-[1.15]">{copy.title}</AlertDialog.Title>
                  <AlertDialog.Description className="m-0 text-pretty text-body leading-[1.55] text-ink-label">{copy.body}</AlertDialog.Description>
                  <span className="text-sm font-bold text-seal">You can’t switch sides later.</span>
                  <div className="flex flex-wrap justify-end gap-2.5 pt-1">
                    <AlertDialog.Cancel className={buttonClass("paper", "md", "px-4.5")}>Cancel</AlertDialog.Cancel>
                    <button type="button" data-confirm="" onClick={confirmSide} className={buttonClass("seal", "md", "px-5")}>
                      {copy.cta}
                    </button>
                  </div>
                </>
              ) : (
                <div role="status" aria-live="polite" className="flex flex-col gap-3.5 pb-1 pt-1.5">
                  <AlertDialog.Title className="m-0 font-display text-2xl font-normal leading-[1.15]">Preparing your case file</AlertDialog.Title>
                  <AlertDialog.Description className="m-0 text-sm leading-normal text-ink-label">{BUSY[step]}</AlertDialog.Description>
                  <div aria-hidden="true" className="h-0.75 bg-ink/15">
                    <div className="h-full bg-seal transition-[width] duration-800 ease-out" style={{ width: BUSY_PCT[step] }} />
                  </div>
                </div>
              )}
            </AlertDialog.Content>
          )}
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const i = SECTIONS.findIndex(([k]) => k === id);
  return (
    <section id={`s-${id}`} data-sec="" aria-labelledby={`h-${id}`} className="flex flex-col gap-3.5">
      <h2 id={`h-${id}`} className="m-0 flex items-baseline gap-3 border-b border-ink/25 pb-2 font-display text-[22px] font-normal">
        <span className="min-w-9.5 text-seal">{NUMERALS[i]}.</span>
        <span className="flex-1 leading-[1.2]">{SECTIONS[i][1]}</span>
      </h2>
      {children}
    </section>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <span className="pt-1 text-label font-bold uppercase tracking-[0.16em] text-ink-muted">{children}</span>;
}

function Empty() {
  return <p className="m-0 text-body italic text-ink-hint">Not stated in the case file.</p>;
}

function Rows({ rows, mob }: { rows: Row[]; mob: boolean }) {
  return (
    <ul className="m-0 flex list-none flex-col border-t border-ink/15 p-0">
      {rows.map((r, i) => (
        <li key={i} className={cn("grid gap-x-5 gap-y-1 border-b border-ink/15 py-3", mob ? "grid-cols-[minmax(0,1fr)]" : "grid-cols-[170px_minmax(0,1fr)]")}>
          <span className="text-[15px] font-bold leading-[1.45] text-ink">{r.label}</span>
          <span className="text-pretty text-[15px] leading-[1.55] text-ink-label">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Numbered({ items }: { items: Item[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((x, i) => (
        <li key={i} className="grid grid-cols-[30px_1fr] gap-2.5 text-base leading-[1.65] text-[#2a2018]">
          <span className="font-data text-sm font-medium leading-[1.9] text-seal">{x.mark}</span>
          <span className="text-pretty">
            {x.title && <strong className="text-ink">{x.title}. </strong>}
            {x.text}
          </span>
        </li>
      ))}
    </ol>
  );
}
