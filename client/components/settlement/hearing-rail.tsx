"use client";

import Link from "next/link";
import { HEARING_COPY, inr, longDate, type Next } from "@/lib/settlement";
import { cn } from "@/lib/utils";
import type { SettlementPayment, SettlementProfile, SettlementTerms } from "@/types";

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
const LABEL = "text-[10.5px] font-bold uppercase tracking-[0.18em]";

export type Check = { label: string; state: keyof typeof MARK; text: string };

/** The courtroom's side panel while a compromise is before the court, in the witness stand's
 * place: what follows the order, the checks, the complainants and the deed. */
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
  cnr,
  two,
  open,
  closing,
  wide,
  onToggle,
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
  cnr: string;
  two: boolean; // beside the record, not over it
  open: boolean;
  /** collapsing: keep the panel up while the column closes */
  closing: boolean;
  wide: boolean;
  onToggle: () => void;
}) {
  const route = profile.route === "none" ? "quash" : profile.route;
  const copy = HEARING_COPY[route];
  const missed = payments.findIndex((p) => p.status === "missed" && !p.remedy);
  const answered = payments.findIndex((p) => p.remedy);
  const payable = userPays ? payments.findIndex((p) => p.status === "due" || p.status === "upcoming") : -1;
  const confirmed = complainants.filter((c) => c.state === "Confirmed").length;
  const conds = profile.conditions.filter((c) => terms.conditions.includes(c.key)).map((c) => c.short);

  const full = open || closing;
  const title = next ? next.title : copy.title;
  return (
    <aside
      aria-label="The court’s checks"
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-ink/20 bg-[#ebe2cd] text-ink",
        two ? "relative z-1" : "fixed inset-0 z-58",
      )}
    >
      {two && !full && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded="false"
          aria-label={`Open the court’s checks: ${title}`}
          className="flex min-h-0 w-full flex-1 animate-[ac-fade_.3s_ease_both] cursor-pointer flex-col items-center gap-3.5 border-0 bg-transparent py-4.5 text-ink transition-colors hover:bg-[#dcd0b6]"
        >
          <span aria-hidden="true" className="text-base leading-none">
            «
          </span>
          <span aria-hidden="true" className="h-2 w-2 bg-[#3f6b3a]" />
          <span className={cn(LABEL, "rotate-180 whitespace-nowrap [writing-mode:vertical-rl]")}>The court’s checks · {title}</span>
        </button>
      )}
      {full && (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            two && (wide ? "min-w-115" : "min-w-100"),
            open ? "animate-[ac-stand_.52s_cubic-bezier(.2,.8,.2,1)_.12s_backwards]" : "animate-[ac-fade_.46s_ease-in_reverse_forwards]",
          )}
        >
          <div className="flex flex-none items-center gap-3 border-b-[3px] border-double border-ink bg-paper px-4 pt-3 pb-2.5">
            <button
              type="button"
              onClick={onToggle}
              aria-label={two ? "Collapse the court’s checks" : "Back to the proceedings"}
              title={two ? "Collapse the court’s checks" : "Back to the proceedings"}
              className="h-10 w-10 flex-none cursor-pointer border-[1.5px] border-ink bg-transparent text-[17px] leading-none text-ink transition-colors hover:bg-ink hover:text-paper"
            >
              {two ? "»" : "←"}
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn(LABEL, "text-seal")}>The court’s checks</span>
              <span className="truncate font-display text-[19px] leading-[1.2]">{title}</span>
            </div>
          </div>
          <div
            tabIndex={0}
            aria-label="The court’s checks"
            className="flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4.5 pb-6"
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
                        <strong className="text-[10.5px] font-bold tracking-[0.18em] text-seal uppercase">
                          Instalment {missed + 1} missed
                        </strong>
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
          </div>
        </div>
      )}
    </aside>
  );
}
