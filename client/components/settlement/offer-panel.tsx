"use client";

import { inr } from "@/lib/settlement";
import { cn } from "@/lib/utils";
import { INSTALMENTS, MONTHS, type SettlementCondition, type SettlementTerms } from "@/types";

const LABEL = "text-[10px] font-bold uppercase tracking-[0.18em] text-ink-label";
const FIELD =
  "h-11 w-full min-w-0 rounded-none border-[1.5px] border-ink bg-paper px-2.5 font-data text-[15px] font-medium text-ink outline-none focus:border-seal focus:shadow-[0_0_0_3px_rgba(142,31,25,.18)]";
const BTN = "h-11.5 cursor-pointer px-4 text-xs font-bold tracking-[0.14em] whitespace-nowrap uppercase";

export type Draft = SettlementTerms & { note: string };

/** The user's next offer, or why there is none to make. */
export default function OfferPanel({
  conditions,
  draft,
  setDraft,
  number,
  canCompose,
  canAct,
  changed,
  hasTheirs,
  offline,
  onSend,
  onAccept,
  onUndo,
  onEnd,
  idle,
}: {
  conditions: SettlementCondition[];
  draft: Draft;
  setDraft: (d: Draft) => void;
  number: number;
  canCompose: boolean; // a new offer can be made
  canAct: boolean; // accept or end talks
  changed: boolean; // the draft differs from their last terms
  hasTheirs: boolean;
  offline: boolean;
  onSend: () => void;
  onAccept: () => void;
  onUndo: () => void;
  onEnd: () => void;
  idle: { t: string; d: string; action?: { label: string; go: () => void } } | null;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const accDis = changed || !hasTheirs;

  return (
    <section aria-labelledby="sd-offer" className="flex min-w-0 flex-col gap-3.5 self-start [grid-area:o] min-[860px]:pt-1">
      <div className="flex flex-none flex-wrap items-baseline justify-between gap-x-3.5 gap-y-2 border-b-[3px] border-double border-ink pb-2.5">
        <h2 id="sd-offer" className="m-0 font-display text-[22px] leading-[1.1] font-normal">
          Your offer
        </h2>
        <span className="font-data text-xs font-medium text-ink-muted">Offer {number} of 3</span>
      </div>

      {canCompose && (
        <div className="flex flex-none flex-col gap-3.5 border border-ink/20 bg-[#f8f3e7] p-4">
          <span className="text-meta leading-[1.45] text-ink-muted">
            {hasTheirs ? "Pre-filled with their last terms. Change what you want to offer." : "Set the terms your client offers."}
          </span>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] items-end gap-x-3.5 gap-y-3">
            <label className="flex min-w-0 flex-col gap-1.25">
              <span className={LABEL}>Amount (₹)</span>
              <input
                type="text"
                inputMode="numeric"
                value={inr(draft.amount).slice(1)}
                onChange={(e) => set({ amount: Math.min(10_000_000_000, Number(e.target.value.replace(/[^0-9]/g, "")) || 0) })}
                className={FIELD}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.25">
              <span className={LABEL}>Interest (% a year)</span>
              <input
                type="text"
                inputMode="decimal"
                value={String(draft.interest)}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, "");
                  set({ interest: v === "" ? 0 : Math.min(18, Number(v) || 0) });
                }}
                className={FIELD}
              />
            </label>
            <Choice label="Instalments" options={INSTALMENTS} value={draft.instalments} onPick={(n) => set({ instalments: n })} />
            <Choice label="Over (months)" options={MONTHS} value={draft.months} onPick={(n) => set({ months: n })} />
          </div>
          <div role="group" aria-label="Conditions" className="flex flex-col gap-1.5">
            <span className={LABEL}>Conditions</span>
            <div className="flex flex-col border-t border-ink/15">
              {conditions.map((c) => {
                const on = draft.conditions.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => set({ conditions: on ? draft.conditions.filter((k) => k !== c.key) : [...draft.conditions, c.key] })}
                    className="grid min-h-11 cursor-pointer grid-cols-[20px_minmax(0,1fr)] items-center gap-3 border-0 border-b border-ink/15 bg-transparent px-1 py-2 text-left text-sm leading-[1.4] text-ink hover:bg-[#f3ecdd]"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-5 items-center justify-center border-[1.5px] border-ink font-data text-[13px] leading-none font-medium text-paper",
                        on ? "bg-ink" : "bg-transparent",
                      )}
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex min-w-0 flex-col gap-1.25">
            <span className={LABEL}>Note to the other side</span>
            <textarea
              rows={2}
              value={draft.note}
              maxLength={1000}
              onChange={(e) => set({ note: e.target.value })}
              placeholder="Optional. Explain the offer in a line or two."
              className={cn(FIELD, "h-16 resize-y py-2.25 font-type text-[14.5px] leading-[1.45] font-normal")}
            />
          </label>
        </div>
      )}

      {canAct && (
        <div className="flex flex-none flex-col gap-2">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-2">
            <button
              type="button"
              onClick={onAccept}
              disabled={accDis}
              title={changed ? "You’ve changed their terms" : "Accept the other side’s last offer"}
              className={cn(
                BTN,
                "border-[1.5px] bg-transparent",
                accDis ? "cursor-not-allowed border-ink-disabled text-ink-disabled" : "border-ink text-ink hover:bg-ink hover:text-paper",
              )}
            >
              Accept their terms
            </button>
            {canCompose && (
              <button
                type="button"
                onClick={onSend}
                className={cn(BTN, "border-0 text-cream", offline ? "bg-ink-disabled" : "bg-seal hover:bg-seal-hover")}
              >
                {offline ? "Offline" : hasTheirs ? "Send counter-offer" : "Send offer"}
              </button>
            )}
          </div>
          {changed && hasTheirs && (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <span className="flex-[1_1_200px] text-[12.5px] leading-[1.45] text-pretty text-ink-meta">
                You’ve changed their terms. Send them as a counter-offer, or undo to accept.
              </span>
              <button
                type="button"
                onClick={onUndo}
                className="flex min-h-9 flex-none cursor-pointer items-center gap-1.5 border-[1.5px] border-ink bg-transparent px-3 text-[11px] font-bold tracking-[0.14em] whitespace-nowrap text-ink uppercase hover:bg-ink hover:text-paper"
              >
                <span aria-hidden="true">↺</span>
                <span>Undo changes</span>
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onEnd}
            className="min-h-10 cursor-pointer self-start border-0 bg-transparent px-0.5 text-xs font-bold tracking-[0.14em] whitespace-nowrap text-seal uppercase underline underline-offset-4 hover:text-seal-hover"
          >
            End talks
          </button>
        </div>
      )}

      {idle && (
        <div className="flex flex-none flex-col gap-1.5 border border-dashed border-ink/45 p-4">
          <span className="font-display text-lg leading-[1.25]">{idle.t}</span>
          <span className="text-[13.5px] leading-[1.55] text-pretty text-ink-label">{idle.d}</span>
          {idle.action && (
            <button
              type="button"
              onClick={idle.action.go}
              className={cn(BTN, "mt-1.5 self-start border-0 bg-ink text-paper hover:bg-seal")}
            >
              {idle.action.label}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Choice<T extends number>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onPick: (n: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="col-span-full flex min-w-0 flex-col gap-1.25">
      <span className={LABEL}>{label}</span>
      <div className="flex h-11 border-[1.5px] border-ink">
        {options.map((n, i) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(n)}
              className={cn(
                "min-w-0 flex-[1_1_0] cursor-pointer border-0 font-data text-sm font-medium",
                i > 0 && "border-l border-l-ink/30",
                on ? "bg-ink text-paper" : "bg-transparent text-ink hover:bg-[#f3ecdd]",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
