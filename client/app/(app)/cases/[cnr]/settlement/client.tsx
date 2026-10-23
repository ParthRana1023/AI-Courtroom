"use client";

import { use, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import CourtModelLoader from "@/components/court/court-model-loader";
import Scroller from "@/components/court/scroller";
import Deed, { DRAW_MS, type SignStage } from "@/components/settlement/deed";
import Negotiation, { type Note } from "@/components/settlement/negotiation";
import OfferPanel, { type Draft } from "@/components/settlement/offer-panel";
import { ClosedRoutes, RouteCard } from "@/components/settlement/route-card";
import { useOnline } from "@/hooks/use-online";
import { useProceed } from "@/hooks/use-proceed";
import { useViewport } from "@/hooks/use-viewport";
import { caseAPI, settlementAPI } from "@/lib/api";
import { getErrorDetail } from "@/lib/error-utils";
import { DEAL, ROUTE_COPY, lastTerms, phaseOf, sameTerms, sideNames, startingDraft, userOffers } from "@/lib/settlement";
import { cn } from "@/lib/utils";
import { CaseStatus, type Case, type SettlementEntry, type SettlementView } from "@/types";

type Busy = "start" | "send" | "accept" | "end" | "sign" | "file" | null;

const OFFLINE = {
  send: "You’re offline. Your offer is kept, so you can send it when you’re back online.",
  accept: "You’re offline. Accept their terms when you’re back online.",
  end: "You’re offline. End talks when you’re back online.",
  sign: "You’re offline. Sign when you’re back online.",
  file: "You’re offline. File when you’re back online.",
};
const FAILED = {
  start: "Couldn’t open talks. Please try again.",
  send: "Couldn’t send your offer. Please try again.",
  accept: "Couldn’t accept their terms. Please try again.",
  end: "Couldn’t end talks. Please try again.",
  sign: "Couldn’t sign the deed. Please try again.",
  file: "Couldn’t file the deed. Please try again.",
};
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TALKS_CLOSED = "The case continues at its current stage. You can propose again after the next hearing.";

export default function SettlementPage({ params }: { params: Promise<{ cnr: string }> }) {
  const { cnr } = use(params);
  const router = useRouter();
  const online = useOnline();
  const { w } = useViewport();
  const three = w >= 1240;
  const one = w < 860;
  const small = w < 560;

  const [kase, setKase] = useState<Case | null>(null);
  const [view, setView] = useState<SettlementView | null>(null);
  const [load, setLoad] = useState<"loading" | "loaded" | "error">("loading");
  const [busy, setBusy] = useState<Busy>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [stage, setStage] = useState<SignStage>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const rects = useRef(new Map<Element, { x: number; y: number }>());
  const lastAreas = useRef("");
  const started = useRef(false);
  // Every load or move takes a number; a reply that comes back after a newer one is dropped,
  // so a slow page load can't overwrite talks that have just opened.
  const seq = useRef(0);
  const { proceed, starting, label: ctaLabel, off: ctaOff } = useProceed(cnr, kase);

  const show = (v: SettlementView) => {
    setView(v);
    setDraft({ ...startingDraft(v), note: "" });
  };

  const fetchAll = useCallback(async () => {
    const id = ++seq.current;
    setLoad("loading");
    try {
      const c = await caseAPI.getCase(cnr);
      if (c.user_role !== "plaintiff" && c.user_role !== "defendant") {
        router.replace(`/cases/${cnr}`);
        return;
      }
      const v = await settlementAPI.get(cnr);
      if (id !== seq.current) return;
      setKase(c);
      show(v);
      setLoad("loaded");
    } catch {
      if (id === seq.current) setLoad("error");
    }
  }, [cnr, router]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const act = async (kind: Exclude<Busy, null>, call: () => Promise<SettlementView>): Promise<SettlementView | null> => {
    if (busy) return null;
    if (!online && kind !== "start") {
      toast(OFFLINE[kind], { duration: 2800 });
      return null;
    }
    const id = ++seq.current;
    setBusy(kind);
    if (kind === "start") setStartErr(null);
    try {
      const v = await call();
      if (id === seq.current) show(v);
      return v;
    } catch (e) {
      const msg = getErrorDetail(e) || FAILED[kind];
      toast.error(msg);
      if (kind === "start") setStartErr(msg);
      return null;
    } finally {
      setBusy(null);
    }
  };
  const openTalks = () => void act("start", () => settlementAPI.start(cnr));

  // Your client's signature draws first; once it is down the other side signs, and File appears
  // only after the last signature has finished drawing.
  const sign = async () => {
    if (!online) return void act("sign", () => settlementAPI.sign(cnr));
    const draw = reduced() ? 300 : DRAW_MS + 300;
    setStage("you");
    const t0 = Date.now();
    const v = await act("sign", () => settlementAPI.sign(cnr));
    if (!v) return setStage(null);
    await wait(Math.max(0, draw - (Date.now() - t0)));
    setStage("them");
    await wait(draw);
    setStage("done");
  };
  const file = async () => {
    const v = await act("file", () => settlementAPI.file(cnr));
    if (v && copy) toast(copy.fileToast, { duration: 2800 });
  };

  // Talks open on the first visit (and again after the next hearing); when the user acts for
  // the complainants, AI counsel opens with its client's terms.
  useEffect(() => {
    if (!view?.can_start || started.current || !online) return;
    started.current = true;
    openTalks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, online, cnr]);

  const role = kase?.user_role === "defendant" ? "defendant" : "plaintiff";
  const RN = role === "plaintiff" ? "Plaintiff" : "Defendant";
  const profile = view?.profile;
  const closedRoute = profile?.route === "none";
  const copy = profile && profile.route !== "none" ? ROUTE_COPY[profile.route] : null;
  const names = profile ? sideNames(profile, role) : null;
  const phase = view ? phaseOf(view, busy === "send" || busy === "start") : "start";
  const attempt = view?.attempt ?? null;
  const readOnly = !!view?.closed;
  const theirs = lastTerms(attempt, "ai");
  const used = attempt ? userOffers(attempt) : 0;
  const canCompose = !readOnly && phase === "compose";
  const canAct = !readOnly && (phase === "compose" || phase === "final");
  const changed = !!(draft && theirs && canCompose && !sameTerms(draft, theirs));

  // Our offer shows in the log while the other side considers it.
  const shown =
    attempt && busy === "send" && draft
      ? {
          ...attempt,
          entries: [
            ...attempt.entries,
            {
              id: "pending",
              by: "user",
              kind: attempt.entries.length ? "counter" : "offer",
              terms: draft,
              note: draft.note.trim(),
              at: new Date().toISOString(),
            } satisfies SettlementEntry,
          ],
        }
      : attempt;

  const lock = !readOnly
    ? null
    : kase?.status === CaseStatus.ACTIVE
      ? { k: "Read-only · courtroom in session", t: "You can’t negotiate while the court is sitting. Adjourn the hearing to continue." }
      : kase?.status === CaseStatus.RESOLVED
        ? {
            k: "Settlement closed · judgment delivered",
            t: "The court has delivered its judgment, so the case can no longer be settled. Only an appeal is open now.",
          }
        : { k: "Settlement closed", t: view?.closed ?? "" };

  const deal = DEAL.includes(phase);
  const note: Note =
    deal && copy
      ? { k: "Terms agreed", t: copy.agreedT, c: "#3f6b3a" }
      : phase === "refused" && !readOnly
        ? {
            k: "Talks closed",
            t: view?.start_blocked ? `The case continues at its current stage. ${view.start_blocked}` : TALKS_CLOSED,
            c: "#8e1f19",
          }
        : phase === "final" && !readOnly
          ? { k: "No offers left", t: "You’ve used all three offers. Accept their last terms or end talks.", c: "#7a4a0c" }
          : null;

  const opening = names?.accused
    ? "The accused makes the first offer, so your client opens."
    : "The other side is setting out its first terms.";
  const idle: { t: string; d: string; action?: { label: string; go: () => void } } | null = canAct
    ? null
    : lock
      ? { t: kase?.status === CaseStatus.RESOLVED ? "Settlement closed" : "Read-only", d: lock.t }
      : phase === "waiting"
        ? busy === "start"
          ? { t: "Opening talks", d: opening }
          : { t: "With the other side", d: "Your offer has been sent. You can make another once they reply." }
        : phase === "refused"
          ? { t: "Talks closed", d: note?.t ?? TALKS_CLOSED }
          : deal
            ? { t: "Terms agreed", d: "No more offers. The compromise deed is drafted from the agreed terms." }
            : // Talks didn't open on their own (offline, or the request failed): open them by hand.
              {
                t: startErr ? "Couldn’t open talks" : "Talks aren’t open yet",
                d: startErr ?? view?.start_blocked ?? opening,
                action: view?.can_start ? { label: startErr ? "Try again" : "Open talks", go: openTalks } : undefined,
              };

  const ctaNote =
    !readOnly && ["compose", "waiting", "final"].includes(phase) && used > 0
      ? "Your offer stays open. Talks continue after the hearing."
      : !readOnly && phase === "signed"
        ? "The deed is signed but not filed. The hearing goes ahead as normal until the court acts on it."
        : null;

  const cols = three ? "300px minmax(0,1fr) minmax(300px,.85fr)" : !one ? "minmax(0,1.3fr) minmax(280px,1fr)" : "minmax(0,1fr)";
  const areas = deal
    ? three
      ? '"e d n" "e o n"'
      : !one
        ? '"e n" "d n" "o n"'
        : '"d" "n" "o" "e"'
    : three
      ? '"e n o" "e d o"'
      : !one
        ? '"e o" "n o" "d o"'
        : '"n" "o" "d" "e"';

  const stepAt = !copy
    ? 0
    : phase === "filed"
      ? copy.at.filed
      : phase === "signed"
        ? copy.at.signed
        : phase === "agreed"
          ? copy.at.agreed
          : copy.at.negotiate;

  // When terms are agreed the panels change places: each slides from where it was (FLIP).
  useLayoutEffect(() => {
    const g = gridRef.current;
    if (!g) return;
    const gr = g.getBoundingClientRect();
    const now = new Map(
      [...g.children].map((el) => {
        const r = el.getBoundingClientRect();
        return [el, { x: r.left - gr.left, y: r.top - gr.top }] as const;
      }),
    );
    if (lastAreas.current && lastAreas.current !== areas && !reduced()) {
      now.forEach((p, el) => {
        const q = rects.current.get(el);
        if (!q || (Math.abs(q.x - p.x) < 2 && Math.abs(q.y - p.y) < 2)) return;
        el.animate([{ transform: `translate(${q.x - p.x}px,${q.y - p.y}px)` }, { transform: "none" }], {
          duration: 380,
          easing: "cubic-bezier(.2,.7,.2,1)",
        });
      });
    }
    rects.current = now;
    lastAreas.current = areas;
  });
  const steps = (copy?.steps ?? []).map(([t, d], i) => {
    const done = i < stepAt;
    const cur = i === stepAt;
    const shut = cur && phase === "refused";
    return { t, d, i, done, cur, shut };
  });
  const now = steps[stepAt];

  const sheet = (
    <div className={cn("flex flex-col gap-6 bg-paper text-ink shadow-sheet", one ? "px-3.5 pt-4 pb-6" : "px-7.5 pt-6 pb-8")}>
      {closedRoute && profile ? (
        <ClosedRoutes profile={profile} cnr={cnr} />
      ) : (
        profile &&
        copy &&
        names &&
        draft && (
          <>
            {one ? (
              <div className="flex flex-none flex-col gap-2">
                <div aria-hidden="true" className="grid grid-cols-5 gap-1">
                  {steps.map((s) => (
                    <span key={s.i} className={cn("h-1", s.cur || s.shut ? "bg-seal" : s.done ? "bg-[#3f6b3a]" : "bg-ink/20")} />
                  ))}
                </div>
                <span className="text-[10.5px] font-bold tracking-[0.16em] text-ink-label uppercase">
                  Step {stepAt + 1} of 5 · {now?.t}
                  {phase === "refused" && " · Closed"}
                </span>
                <span className="-mt-1 text-meta leading-[1.4] text-ink-muted">{now?.d}</span>
              </div>
            ) : (
              <div className="flex-none [scrollbar-width:none] overflow-x-auto">
                <ol aria-label="Settlement steps" className="m-0 grid list-none grid-cols-[repeat(5,minmax(128px,1fr))] gap-1 p-0">
                  {steps.map((s) => (
                    <li
                      key={s.i}
                      aria-current={s.cur ? "step" : undefined}
                      className="flex flex-col gap-0.75 border-t-[3px] px-3 py-2.5"
                      style={{
                        background: s.shut ? "#e9dfcb" : s.cur ? "#120d09" : s.done ? "#e9dfcb" : "transparent",
                        color: s.shut ? "#8e1f19" : s.cur ? "#efe6d3" : s.done ? "#3e3326" : "#6b5d4b",
                        borderTopColor: s.shut || s.cur ? "#8e1f19" : s.done ? "#3f6b3a" : "rgba(18,13,9,.2)",
                      }}
                    >
                      <span className="flex justify-between gap-1.5 font-data text-[11px] font-medium">
                        <span>0{s.i + 1}</span>
                        <span>{s.done ? "✓" : s.shut ? "Closed" : ""}</span>
                      </span>
                      <span className="text-[11.5px] leading-[1.3] font-bold tracking-[0.12em] uppercase">{s.t}</span>
                      <span
                        className="text-[12.5px] leading-[1.35]"
                        style={{ color: s.cur && !s.shut ? "#b9ad97" : s.done ? "#4a3e30" : "#6b5d4b" }}
                      >
                        {s.d}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div
              ref={gridRef}
              className="grid items-start gap-x-8 gap-y-7"
              style={{
                gridTemplateColumns: cols,
                gridTemplateAreas: areas,
                gridTemplateRows: three ? "auto 1fr" : !one ? "auto auto 1fr" : "auto",
              }}
            >
              <Negotiation
                attempt={shown}
                conditions={profile.conditions}
                you={names.you}
                them={names.them}
                waitText={names.waiting}
                phase={phase}
                maxOffers={view?.max_offers ?? 3}
                note={note}
                lock={lock}
              />
              <RouteCard profile={profile} sticky={three} />
              <Deed
                cnr={cnr}
                deed={view?.deed ?? null}
                copy={copy}
                phase={phase}
                stage={stage}
                signedBefore={Object.keys(attempt?.signatures ?? {}).length > 0}
                hearingDate={attempt?.hearing_date ?? null}
                readOnly={readOnly}
                filing={busy === "file"}
                onSign={() => void sign()}
                onFile={() => void file()}
              />
              <OfferPanel
                conditions={profile.conditions}
                draft={draft}
                setDraft={setDraft}
                number={Math.min(used + 1, view?.max_offers ?? 3)}
                canCompose={canCompose}
                canAct={canAct}
                changed={changed}
                hasTheirs={!!theirs}
                offline={!online}
                onSend={() => {
                  const { note: text, ...terms } = draft;
                  void act("send", () => settlementAPI.offer(cnr, terms, text.trim()));
                }}
                onAccept={() => !changed && theirs && void act("accept", () => settlementAPI.accept(cnr))}
                onUndo={() => theirs && setDraft({ ...theirs, conditions: [...theirs.conditions], note: draft.note })}
                onEnd={() => void act("end", () => settlementAPI.end(cnr))}
                idle={idle}
              />
            </div>
          </>
        )
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "mx-auto flex min-h-0 w-full max-w-360 flex-1 flex-col overflow-x-hidden",
        one ? "gap-2.5 overflow-y-auto px-3 pt-2.5 pb-3" : "gap-3 px-[3vw] pt-4 pb-4.5",
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Link
            href={`/cases/${cnr}/case-prep`}
            className="relative flex min-h-7 items-center gap-2 self-start text-xs tracking-[0.16em] text-desk-soft uppercase before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] hover:text-desk-hover"
          >
            <span aria-hidden="true">←</span>
            <span>Case Prep</span>
          </Link>
          <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
            <h1 className={cn("m-0 font-display leading-[1.05] font-normal", one ? "text-[28px]" : "text-[34px]")}>Settlement</h1>
            <span className="font-data text-xs font-medium tracking-[0.04em] text-desk-muted">{cnr}</span>
          </div>
          {kase && (
            <span className="text-[13.5px] leading-[1.4] text-desk-muted">
              {kase.title} · You are the <strong className="text-desk-ink">{RN} Lawyer</strong>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={proceed}
          disabled={starting || load !== "loaded"}
          className={cn(
            "h-12 cursor-pointer px-5.5 text-xs font-bold tracking-[0.14em] whitespace-nowrap text-cream uppercase disabled:cursor-wait light:text-ink",
            small ? "flex-[1_1_100%]" : "flex-none",
            ctaOff ? "bg-ink-disabled" : "bg-seal hover:bg-seal-hover",
          )}
        >
          {ctaLabel}
        </button>
      </div>
      {ctaNote && (
        <span role="note" className="-mt-1.5 flex items-center gap-2 self-end text-meta leading-[1.4] text-desk-muted">
          <span aria-hidden="true" className="size-1.75 flex-none bg-[#b07a1a]" />
          <span>{ctaNote}</span>
        </span>
      )}

      {load !== "loaded" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3.5 bg-paper px-5 py-8 text-center text-ink">
          {load === "loading" ? (
            <CourtModelLoader status="Opening the settlement desk…" tone="paper" />
          ) : (
            <>
              <span role="alert" className="font-display text-2xl">
                Couldn’t open the settlement desk
              </span>
              <span className="max-w-105 text-body leading-[1.55] text-ink-label">
                Failed to load the settlement. Please try again later.
              </span>
              <button
                type="button"
                onClick={fetchAll}
                className="h-11.5 cursor-pointer bg-seal px-5 text-xs font-bold tracking-[0.14em] whitespace-nowrap text-cream uppercase hover:bg-seal-hover"
              >
                Try again
              </button>
            </>
          )}
        </div>
      ) : one ? (
        sheet
      ) : (
        <Scroller className="flex min-h-0 flex-1 flex-col overflow-x-hidden">{sheet}</Scroller>
      )}
    </div>
  );
}
