"use client";

import { inr } from "@/lib/settlement";
import type { NegotiationAnalysis, SettlementTerms } from "@/types";

const scoreColour = (n: number) => (n >= 70 ? "#3f6b3a" : n >= 40 ? "#7a4a0c" : "#8e1f19");
const CALL = {
  right: ["Settling was the right call", "#3f6b3a"],
  mixed: ["Settling was a close call", "#7a4a0c"],
  wrong: ["Fighting it out was the better call", "#8e1f19"],
} as const;
const deal = (t: SettlementTerms) =>
  `${inr(t.amount)} · ${t.instalments === 1 ? "one payment" : `${t.instalments} instalments`} · ${t.months} mo · ${t.interest ? `${t.interest}% interest` : "no interest"}`;

/** The negotiator score at the head of the negotiation analysis: the tier, whether settling was
 * right, each factor, the best deal on offer and the two notes. */
export default function NegotiationSummary({ n }: { n: NegotiationAnalysis }) {
  return (
    <div className="flex flex-col gap-3 border-b border-ink/25 pb-4">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-[34px] leading-none" style={{ color: scoreColour(n.score) }}>
          {n.score}
        </span>
        <span className="font-data text-xs font-medium text-ink-meta">/100</span>
      </div>
      <span
        className="-rotate-2 self-start border-[3px] border-double px-2.25 pt-0.75 pb-0.5 font-display text-xs leading-none tracking-[0.08em] uppercase"
        style={{ borderColor: scoreColour(n.score), color: scoreColour(n.score) }}
      >
        {n.tier}
      </span>
      <div className="flex flex-col gap-1 border-l-[3px] pl-3" style={{ borderLeftColor: CALL[n.call][1] }}>
        <strong className="text-[10.5px] font-bold tracking-[0.16em] uppercase" style={{ color: CALL[n.call][1] }}>
          {CALL[n.call][0]}
        </strong>
        <span className="text-[13px] leading-normal text-pretty text-[#2a2018]">{n.call_text}</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {n.factors.map((f) => (
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
      {n.best && (
        <div className="flex flex-col gap-1 border-[1.5px] border-dashed border-ink/35 px-3.5 py-3">
          <span className="text-[10px] font-bold tracking-[0.18em] text-ink-meta uppercase">The best deal on offer</span>
          <span className="font-data text-[13px] font-medium">{deal(n.best)}</span>
          {n.best_text && <span className="text-[12.5px] leading-[1.45] text-pretty text-ink-label">{n.best_text}</span>}
        </div>
      )}
      {n.notes.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          {n.notes.map((note) => {
            const good = note.kind === "worked";
            const c = good ? "#3f6b3a" : "#8e1f19";
            return (
              <div key={note.kind} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2">
                <span aria-hidden="true" className="font-data text-sm leading-[1.45] font-medium" style={{ color: c }}>
                  {good ? "+" : "−"}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: c }}>
                    {good ? "What worked" : "To improve"}
                  </span>
                  <span className="text-[13px] leading-normal text-pretty text-[#2a2018]">{note.text}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
