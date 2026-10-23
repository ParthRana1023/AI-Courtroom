"use client";

import { useState } from "react";
import { inr, stamp, type Phase } from "@/lib/settlement";
import { cn } from "@/lib/utils";
import type { Settlement, SettlementCondition, SettlementTerms } from "@/types";

const KIND = {
  offer: ["Offer", "#120d09"],
  counter: ["Counter-offer", "#7a4a0c"],
  accept: ["Accepted", "#3f6b3a"],
  refuse: ["Refused", "#8e1f19"],
  ended: ["Talks ended", "#8e1f19"],
} as const;

const LABEL = "text-[10px] font-bold uppercase tracking-[0.18em]";

export type Note = { k: string; t: string; c: string } | null;

/** The talks so far, newest open; a status line while the other side considers. */
export default function Negotiation({
  attempt,
  conditions,
  you,
  them,
  waitText,
  phase,
  maxOffers,
  note,
  lock,
}: {
  attempt: Settlement | null;
  conditions: SettlementCondition[];
  you: string;
  them: string;
  waitText: string;
  phase: Phase;
  maxOffers: number;
  note: Note;
  lock: { k: string; t: string } | null;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const entries = attempt?.entries ?? [];
  const used = entries.filter((e) => e.by === "user" && e.terms).length;
  const shorts = Object.fromEntries(conditions.map((c) => [c.key, c.short]));

  let prev: SettlementTerms | null = null;
  const rows = entries.map((e, i) => {
    const t = e.terms;
    const pv = prev;
    if (t) prev = t;
    const ch = (k: keyof SettlementTerms) => !!(pv && t && JSON.stringify(pv[k]) !== JSON.stringify(t[k]));
    return { e, t, ch, mine: e.by === "user", isOpen: open[e.id] ?? i === entries.length - 1 };
  });

  return (
    <section aria-labelledby="sd-neg" className="flex min-w-0 flex-col gap-4 [grid-area:n]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b-[3px] border-double border-ink pb-2.5">
        <h2 id="sd-neg" className="m-0 font-display text-2xl leading-[1.1] font-normal">
          Negotiation
        </h2>
        <span className="font-data text-xs font-medium text-ink-muted">
          Your offers · {used} of {maxOffers}
        </span>
      </div>
      {rows.length > 0 && (
        <ol className="-mt-3.5 flex list-none flex-col p-0">
          {rows.map(({ e, t, ch, mine, isOpen }, i) => {
            const [kind, kc] = KIND[e.kind];
            const conds = t ? t.conditions.map((k) => shorts[k] ?? k) : [];
            const sum = t ? `${inr(t.amount)} · ${t.instalments} × ${t.months} mo · ${t.interest ? `${t.interest}%` : "no interest"}` : "";
            const cells = t
              ? [
                  { k: "Amount", v: inr(t.amount), chg: ch("amount") },
                  {
                    k: "Schedule",
                    v: `${t.instalments} ${t.instalments === 1 ? "payment" : "instalments"} · ${t.months} mo`,
                    chg: ch("instalments") || ch("months"),
                  },
                  { k: "Interest", v: t.interest ? `${t.interest}% a year` : "None", chg: ch("interest") },
                ]
              : [];
            return (
              <li key={e.id} className="flex flex-col border-b border-ink/15">
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [e.id]: !isOpen }))}
                  aria-expanded={isOpen}
                  className="grid w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-x-3.5 border-0 bg-transparent py-3 pr-1 pl-0 text-left text-ink hover:bg-[#f3ecdd]"
                >
                  <span className="font-data text-xs leading-[1.9] font-medium" style={{ color: mine ? "#8e1f19" : "#3e3326" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      <span className="text-[14.5px] leading-[1.3] font-bold whitespace-nowrap">{mine ? you : them}</span>
                      <span
                        className={cn(LABEL, "border-[1.5px] px-2 pt-0.75 pb-0.5 whitespace-nowrap")}
                        style={{ borderColor: kc, color: kc }}
                      >
                        {kind}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-x-2.5 gap-y-1 font-data text-[11px] leading-normal font-medium text-ink-meta">
                      <span className="whitespace-nowrap">{stamp(e.at)}</span>
                      {!isOpen && sum && <span className="text-ink">{sum}</span>}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="font-data text-[13px] leading-[1.9] font-medium text-ink-label transition-transform duration-250 ease-paper"
                    style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                  >
                    ▾
                  </span>
                </button>
                {isOpen && (t || e.note) && (
                  <div className="flex min-w-0 flex-col gap-2.5 pr-1 pb-3.5 pl-13.5">
                    {t && (
                      <>
                        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-x-4.5 gap-y-2.5">
                          {cells.map((c) => (
                            <div key={c.k} className="flex min-w-0 flex-col gap-0.75">
                              <dt className={cn(LABEL, "flex items-baseline gap-2 text-ink-meta")}>
                                <span>{c.k}</span>
                                {c.chg && <span className="tracking-[0.08em] text-seal">changed</span>}
                              </dt>
                              <dd className={cn("m-0 font-data text-sm leading-[1.4] font-medium", c.chg ? "text-seal" : "text-ink")}>
                                {c.v}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <span className={cn("text-meta leading-normal text-pretty", ch("conditions") ? "text-seal" : "text-ink-label")}>
                          Conditions: {conds.length ? conds.join(" · ") : "none"}
                          {ch("conditions") && " (changed)"}
                        </span>
                      </>
                    )}
                    {e.note && <p className="m-0 max-w-[64ch] text-[14.5px] leading-[1.6] text-pretty text-[#2a2018]">“{e.note}”</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {phase === "waiting" && (
        <div role="status" className="-mt-1.5 grid grid-cols-[40px_minmax(0,1fr)] gap-x-3.5">
          <span />
          <span className="flex items-center gap-2 text-sm leading-[1.6] text-ink-meta italic">
            <span>{waitText}</span>
            <span aria-hidden="true" className="inline-block h-0.5 w-2 animate-[ac-cursor_1s_steps(1)_infinite] bg-seal" />
          </span>
        </div>
      )}
      {note && (
        <div role="status" className="flex flex-col gap-1 border-[1.5px] px-3.5 py-3" style={{ borderColor: note.c }}>
          <strong className={cn(LABEL, "text-[10.5px]")} style={{ color: note.c }}>
            {note.k}
          </strong>
          <span className="text-sm leading-normal text-pretty text-[#2a2018]">{note.t}</span>
        </div>
      )}
      {lock && (
        <div className="flex flex-col gap-1 border border-[rgba(122,74,12,.5)] bg-[rgba(233,163,58,.1)] px-3.5 py-3">
          <strong className={cn(LABEL, "text-[10.5px] text-amber")}>{lock.k}</strong>
          <span className="text-sm leading-normal text-ink-label">{lock.t}</span>
        </div>
      )}
    </section>
  );
}
