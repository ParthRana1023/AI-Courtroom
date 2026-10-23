"use client";

import Link from "next/link";
import { HEARING_COPY, inr, longDate, type Next } from "@/lib/settlement";
import { cn } from "@/lib/utils";
import type { NegotiationAnalysis, SettlementPayment, SettlementProfile, SettlementTerms } from "@/types";

const H2 = "m-0 font-display text-xl leading-[1.1] font-normal";
const HEAD = "flex items-baseline justify-between gap-2.5 border-b-[3px] border-double border-ink pb-2.5";
const TAG = "border-[1.5px] px-1.75 pt-0.5 pb-px text-[10px] font-bold tracking-[0.16em] whitespace-nowrap uppercase";
const BTN = "h-11 cursor-pointer self-start border-0 px-4 text-xs font-bold tracking-[0.14em] whitespace-nowrap text-cream uppercase";

const MARK = {
  ok: ["✓", "#3f6b3a", "#3f6b3a", "#efe6d3"],
  fail: ["✕", "#8e1f19", "#8e1f19", "#efe6d3"],
  unsure: ["?", "#7a4a0c", "#f6e3b8", "#7a4a0c"],
  wait: ["", "rgba(18,13,9,.4)", "transparent", "#120d09"],
} as const;
const PAY = {
  paid: ["Paid", "#3f6b3a"],
  late: ["Paid late", "#7a4a0c"],
  due: ["Due", "#7a4a0c"],
  upcoming: ["Upcoming", "#6b5d4b"],
  missed: ["Missed", "#8e1f19"],
} as const;
const short = (iso: string) => longDate(iso).replace(/ (\w{3})\w* /, " $1 ");
const scoreColour = (n: number) => (n >= 70 ? "#3f6b3a" : n >= 40 ? "#7a4a0c" : "#8e1f19");
const CALL = {
  right: ["Settling was the right call", "#3f6b3a"],
  mixed: ["Settling was a close call", "#7a4a0c"],
  wrong: ["Fighting it out was the better call", "#8e1f19"],
} as const;
const deal = (t: SettlementTerms) =>
  `${inr(t.amount)} · ${t.instalments === 1 ? "one payment" : `${t.instalments} instalments`} · ${t.months} mo · ${t.interest ? `${t.interest}% interest` : "no interest"}`;

export type Check = { label: string; state: keyof typeof MARK; text: string };

/** The side of the hearing page: what follows the order, the analysis, the checks, the
 * complainants and the deed. */
export default function HearingRail({
  profile,
  checks,
  complainants,
  terms,
  next,
  payments,
  userPays,
  busy,
  onPay,
  negotiation,
  onRetry,
  onReview,
  cnr,
  show,
}: {
  profile: SettlementProfile;
  checks: Check[];
  complainants: { name: string; role: string; state: "Confirmed" | "Unsure" | "Waiting" }[];
  terms: SettlementTerms;
  next: Next | null; // once the order is passed
  payments: SettlementPayment[];
  userPays: boolean;
  busy: number | null; // the instalment being acted on
  onPay: (index: number) => void;
  negotiation: NegotiationAnalysis | "loading" | "error" | null; // once the case is decided
  onRetry: () => void;
  onReview: () => void;
  cnr: string;
  show: boolean;
}) {
  const route = profile.route === "none" ? "quash" : profile.route;
  const copy = HEARING_COPY[route];
  const missed = payments.findIndex((p) => p.status === "missed" && !p.remedy);
  const answered = payments.findIndex((p) => p.remedy);
  const payable = userPays ? payments.findIndex((p) => p.status === "due" || p.status === "upcoming") : -1;
  const confirmed = complainants.filter((c) => c.state === "Confirmed").length;
  const conds = profile.conditions.filter((c) => terms.conditions.includes(c.key)).map((c) => c.short);

  return (
    <aside
      aria-label="The court’s checks"
      className={cn(
        "min-h-0 min-w-0 flex-col gap-6 overflow-x-hidden overflow-y-auto overscroll-contain bg-[#ebe2cd] pt-4.5 pb-6",
        show ? "flex" : "hidden",
        "px-3.5 min-[860px]:px-6",
      )}
    >
      {next && (
        <section aria-labelledby="vh-next" className="flex flex-col gap-3">
          <div className={cn(HEAD, "items-center")}>
            <h2 id="vh-next" className={H2}>
              {next.title}
            </h2>
            <span
              className="-rotate-3 border-[3px] border-double px-2.25 pt-1 pb-0.75 font-display text-xs leading-none tracking-[0.08em] whitespace-nowrap"
              style={{ borderColor: next.c, color: next.c }}
            >
              {next.stamp}
            </span>
          </div>
          <p className="m-0 text-[13.5px] leading-[1.55] text-pretty text-[#2a2018]">{next.body}</p>
          {payments.length > 0 && (
            <>
              <ol className="m-0 flex list-none flex-col border-t border-ink/15 p-0">
                {payments.map((p, i) => {
                  const [label, c] = PAY[p.status];
                  const last = i === payments.length - 1 && terms.interest > 0;
                  return (
                    <li
                      key={p.due}
                      className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-baseline gap-x-2.5 gap-y-1 border-b border-ink/15 py-2.5"
                    >
                      <span className="font-data text-xs font-medium text-seal">{String(i + 1).padStart(2, "0")}</span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-data text-sm font-medium">
                          {inr(p.amount)}
                          {last && <span className="text-ink-meta"> incl. interest</span>}
                        </span>
                        <span className="text-[12.5px] leading-[1.4] text-ink-muted">
                          {p.paid_at
                            ? `Paid ${short(p.paid_at.slice(0, 10))} · due ${short(p.due)}`
                            : `${i === 0 ? "Deposit in court by" : "Due by"} ${short(p.due)}`}
                        </span>
                      </span>
                      <span className={TAG} style={{ borderColor: c, color: c }}>
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {payable >= 0 && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => onPay(payable)}
                  className={cn(BTN, "bg-ink text-paper hover:bg-seal disabled:cursor-wait")}
                >
                  {busy === payable ? "Recording…" : payable === 0 ? "Confirm first deposit" : `Pay instalment ${payable + 1}`}
                </button>
              )}
              {missed >= 0 && (
                <div role="status" className="flex flex-col gap-2 border-[1.5px] border-seal bg-[rgba(142,31,25,.06)] px-4 py-3.5">
                  <strong className="text-[10.5px] font-bold tracking-[0.18em] text-seal uppercase">Instalment {missed + 1} missed</strong>
                  <span className="text-[13.5px] leading-[1.55] text-pretty text-[#2a2018]">
                    {userPays ? "Your client" : profile.accused} didn’t pay {inr(payments[missed].amount)} due on{" "}
                    {longDate(payments[missed].due)}. {userPays ? copy.remedy.you : copy.remedy.them}
                  </span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => onPay(missed)}
                    className={cn(BTN, "bg-seal hover:bg-seal-hover disabled:cursor-wait")}
                  >
                    {busy === missed ? "Filing…" : userPays ? "Record late payment" : copy.remedy.label}
                  </button>
                </div>
              )}
              {missed < 0 && answered >= 0 && (
                <div role="status" className="flex flex-col gap-2 border-[1.5px] border-amber bg-[rgba(233,163,58,.1)] px-4 py-3.5">
                  <strong className="text-[10.5px] font-bold tracking-[0.18em] text-amber uppercase">{copy.remedy.done}</strong>
                  <span className="text-[13.5px] leading-[1.55] text-pretty text-[#2a2018]">{copy.remedy.filed}</span>
                </div>
              )}
              {missed < 0 && answered < 0 && (
                <p className="m-0 text-[12.5px] leading-normal text-pretty text-ink-meta">{copy.remedy.note}</p>
              )}
            </>
          )}
        </section>
      )}

      {negotiation && (
        <section aria-labelledby="vh-neg" aria-busy={negotiation === "loading"} className="flex flex-col gap-3">
          <div className={HEAD}>
            <h2 id="vh-neg" className={H2}>
              Negotiation analysis
            </h2>
            {typeof negotiation === "object" && (
              <span className="flex items-baseline gap-1">
                <span className="font-display text-[26px] leading-none" style={{ color: scoreColour(negotiation.score) }}>
                  {negotiation.score}
                </span>
                <span className="font-data text-[11px] font-medium text-ink-meta">/100</span>
              </span>
            )}
          </div>
          {negotiation === "loading" && (
            <p role="status" className="m-0 text-[13px] leading-normal text-ink-label italic">
              Reviewing how you negotiated…
            </p>
          )}
          {negotiation === "error" && (
            <div role="alert" className="flex flex-col items-start gap-2">
              <span className="text-[13px] leading-normal text-ink-label">The analysis couldn’t be prepared just now.</span>
              <button type="button" onClick={onRetry} className={cn(BTN, "h-10 bg-ink text-paper hover:bg-seal")}>
                Try again
              </button>
            </div>
          )}
          {typeof negotiation === "object" && (
            <>
              <span
                className="-rotate-2 self-start border-[3px] border-double px-2.25 pt-0.75 pb-0.5 font-display text-xs leading-none tracking-[0.08em] uppercase"
                style={{ borderColor: scoreColour(negotiation.score), color: scoreColour(negotiation.score) }}
              >
                {negotiation.tier}
              </span>
              <div className="flex flex-col gap-1 border-l-[3px] pl-3" style={{ borderLeftColor: CALL[negotiation.call][1] }}>
                <strong className="text-[10.5px] font-bold tracking-[0.16em] uppercase" style={{ color: CALL[negotiation.call][1] }}>
                  {CALL[negotiation.call][0]}
                </strong>
                <span className="text-[13px] leading-normal text-pretty text-[#2a2018]">{negotiation.call_text}</span>
              </div>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {negotiation.factors.map((f) => (
                  <li key={f.key} className="flex flex-col gap-1.25">
                    <span className="flex justify-between gap-2.5">
                      <span className="text-[13.5px] font-bold">
                        {f.label} <span className="font-data text-[11px] font-medium text-ink-meta">· {f.weight}%</span>
                      </span>
                      <span className="font-data text-[13px] font-medium" style={{ color: scoreColour(f.value) }}>
                        {f.value}
                      </span>
                    </span>
                    <span aria-hidden="true" className="h-1.5 bg-ink/12">
                      <span className="block h-full" style={{ width: `${f.value}%`, background: scoreColour(f.value) }} />
                    </span>
                    <span className="text-[12.5px] leading-[1.45] text-pretty text-ink-label">{f.text}</span>
                  </li>
                ))}
              </ul>
              {negotiation.best && (
                <div className="flex flex-col gap-1 border-[1.5px] border-dashed border-ink/35 px-3.5 py-3">
                  <span className="text-[10px] font-bold tracking-[0.18em] text-ink-meta uppercase">The best deal on offer</span>
                  <span className="font-data text-[13px] font-medium">{deal(negotiation.best)}</span>
                  {negotiation.best_text && (
                    <span className="text-[12.5px] leading-[1.45] text-pretty text-ink-label">{negotiation.best_text}</span>
                  )}
                </div>
              )}
              {negotiation.notes.length > 0 && (
                <div className="flex flex-col gap-2 pt-1">
                  {negotiation.notes.map((n) => {
                    const good = n.kind === "worked";
                    const c = good ? "#3f6b3a" : "#8e1f19";
                    return (
                      <div key={n.kind} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2">
                        <span aria-hidden="true" className="font-data text-sm leading-[1.45] font-medium" style={{ color: c }}>
                          {good ? "+" : "−"}
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: c }}>
                            {good ? "What worked" : "To improve"}
                          </span>
                          <span className="text-[13px] leading-normal text-pretty text-[#2a2018]">{n.text}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-x-5">
                <button
                  type="button"
                  onClick={onReview}
                  className="flex min-h-9 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-[11px] font-bold tracking-[0.14em] text-ink uppercase underline underline-offset-4 hover:text-seal"
                >
                  <span>Read the full review</span>
                  <span aria-hidden="true">→</span>
                </button>
                <Link
                  href="/profile"
                  className="flex min-h-9 items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-ink uppercase underline underline-offset-4 hover:text-seal"
                >
                  <span>Your negotiator rating</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </>
          )}
        </section>
      )}

      <section aria-labelledby="vh-tests" className="flex flex-col gap-2.5">
        <div className={HEAD}>
          <h2 id="vh-tests" className={H2}>
            What the court checks
          </h2>
        </div>
        <ul className="m-0 flex list-none flex-col p-0">
          {checks.map((t) => {
            const [mark, c, bg, fg] = MARK[t.state];
            return (
              <li key={t.label} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2.5 border-b border-ink/15 py-2.5">
                <span
                  aria-hidden="true"
                  className="flex size-5.5 items-center justify-center border-[1.5px] font-data text-xs leading-none font-medium"
                  style={{ borderColor: c, background: bg, color: fg }}
                >
                  {mark}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <strong className="text-sm leading-[1.4] font-bold">{t.label}</strong>
                  <span
                    className="text-[13px] leading-[1.45] text-pretty"
                    style={{ color: t.state === "fail" ? "#8e1f19" : t.state === "unsure" ? "#7a4a0c" : "#3e3326" }}
                  >
                    {t.text}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="vh-comp" className="flex flex-col gap-2.5">
        <div className={HEAD}>
          <h2 id="vh-comp" className={H2}>
            Complainants
          </h2>
          <span className="font-data text-xs font-medium text-ink-muted">
            {confirmed} of {complainants.length} confirmed
          </span>
        </div>
        <ul className="m-0 flex list-none flex-col p-0">
          {complainants.map((c) => {
            const col = c.state === "Confirmed" ? "#3f6b3a" : c.state === "Unsure" ? "#7a4a0c" : "#6b5d4b";
            return (
              <li key={c.name} className="flex items-center justify-between gap-2.5 border-b border-ink/15 py-2.5">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm leading-[1.35] font-bold">{c.name}</span>
                  <span className="text-[12.5px] leading-[1.4] text-ink-muted">{c.role}</span>
                </span>
                <span className={cn(TAG, "flex-none")} style={{ borderColor: col, color: col }}>
                  {c.state}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="vh-deed" className="flex flex-col gap-2.5">
        <div className={HEAD}>
          <h2 id="vh-deed" className={H2}>
            {copy.deedH}
          </h2>
          <span className="text-[10px] font-bold tracking-[0.18em] text-[#3f6b3a] uppercase">Signed by both</span>
        </div>
        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2.5">
          {[
            ["Amount", inr(terms.amount)],
            ["Schedule", `${terms.instalments} ${terms.instalments === 1 ? "payment" : "instalments"} · ${terms.months} mo`],
            ["Interest", terms.interest ? `${terms.interest}% a year` : "None"],
            ["Conditions", conds.length ? conds.join(", ") : "None"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.75">
              <dt className="text-[10px] font-bold tracking-[0.18em] text-ink-meta uppercase">{k}</dt>
              <dd className={cn("m-0", k === "Conditions" ? "text-[13px] leading-[1.4]" : "font-data text-sm font-medium")}>{v}</dd>
            </div>
          ))}
        </dl>
        <Link
          href={`/cases/${cnr}/settlement`}
          className="flex min-h-9 items-center gap-2 self-start text-[11px] font-bold tracking-[0.14em] whitespace-nowrap text-ink uppercase underline underline-offset-4 hover:text-seal"
        >
          <span>{copy.readL}</span>
          <span aria-hidden="true">→</span>
        </Link>
      </section>
    </aside>
  );
}
