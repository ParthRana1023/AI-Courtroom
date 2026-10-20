"use client";

import type { KeyboardEvent, Ref } from "react";
import Scroller from "@/components/court/scroller";
import { cn } from "@/lib/utils";
import type { EvidenceItem } from "@/types";
import { PinButton, PinnedChips } from "./exhibit-pin";
import { Caret } from "./record";

export interface Candidate {
  id: string;
  name: string;
  ini: string;
  sub: string;
  ours: boolean;
  off: boolean;
  onCall: () => void;
}

export interface QA {
  id: string;
  by: string; // "You asked" or "Counsel for the … · AI"
  mine: boolean;
  q: string;
  /** exhibits put to the witness with the question */
  refs: string[];
  a: string | null; // null while the witness is answering
  objectable: boolean;
  /** withdrawn after a sustained objection: no answer is coming */
  withdrawn: boolean;
}

export type Foot =
  | { kind: "ask"; re: boolean }
  | { kind: "choice"; text: string; a: string; b: string; onA: () => void; onB: () => void }
  | { kind: "view" }
  | null;

const LABEL = "text-[10.5px] font-bold uppercase tracking-[0.18em]";
const BTN = "h-11 flex-[1_1_0] cursor-pointer whitespace-nowrap px-3 text-[11px] font-bold uppercase tracking-[0.14em]";

export default function WitnessStand({
  two,
  open,
  closing,
  wide,
  onToggle,
  witness,
  hist,
  onObject,
  held,
  cands,
  busyNote,
  foot,
  qDraft,
  onQ,
  onAsk,
  onNoMore,
  asking,
  askOff,
  enterSubmits,
  qRef,
  scRef,
  pickMax,
  evidence,
  qAtt,
  onQAtt,
  onExhibit,
}: {
  two: boolean;
  open: boolean;
  /** collapsing: keep the panel up while the column closes */
  closing: boolean;
  /** ≥1320px: the open stand is 460px wide, else 400px */
  wide: boolean;
  onToggle: () => void;
  witness: { name: string; ini: string; sub: string; first: string } | null;
  hist: QA[];
  onObject: (id: string) => void;
  /** an objection is being drawn up: the witness waits, so no answer is pending */
  held: boolean;
  cands: Candidate[];
  busyNote: string | null;
  foot: Foot;
  qDraft: string;
  onQ: (v: string) => void;
  onAsk: () => void;
  onNoMore: () => void;
  asking: boolean;
  askOff: boolean;
  enterSubmits: boolean;
  qRef: Ref<HTMLTextAreaElement>;
  scRef: Ref<HTMLDivElement>;
  /** room above the question box for the exhibit list */
  pickMax: () => number;
  evidence: EvidenceItem[];
  /** exhibit ids pinned to the next question */
  qAtt: string[];
  onQAtt: (ids: string[]) => void;
  onExhibit: (id: string) => void;
}) {
  const full = open || closing;
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || !two) return;
    if (enterSubmits ? !e.shiftKey : e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onAsk();
    }
  };
  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    const h = el.scrollHeight + 3;
    el.style.height = `${Math.min(140, Math.max(46, h))}px`;
    el.style.overflowY = h > 140 ? "auto" : "hidden";
  };

  return (
    <aside
      aria-label="Witness stand"
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-ink/20 bg-[#e6dcc6] text-ink",
        two ? "relative z-1" : "fixed inset-0 z-58",
      )}
    >
      {two && !full && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded="false"
          aria-label={`Open the witness stand: ${witness ? `On the stand · ${witness.name}` : "Witness stand · empty"}`}
          className="flex min-h-0 w-full flex-1 animate-[ac-fade_.3s_ease_both] cursor-pointer flex-col items-center gap-3.5 border-0 bg-transparent py-4.5 text-ink transition-colors hover:bg-[#dcd0b6]"
        >
          <span aria-hidden="true" className="text-base leading-none">
            «
          </span>
          {witness && <span aria-hidden="true" className="h-2 w-2 bg-[#b07a1a]" />}
          <span className={cn(LABEL, "rotate-180 whitespace-nowrap [writing-mode:vertical-rl]")}>
            {witness ? `On the stand · ${witness.name}` : "Witness stand · empty"}
          </span>
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
              aria-label={two ? "Collapse the witness stand" : "Back to the proceedings"}
              title={two ? "Collapse the witness stand" : "Back to the proceedings"}
              className="h-10 w-10 flex-none cursor-pointer border-[1.5px] border-ink bg-transparent text-[17px] leading-none text-ink transition-colors hover:bg-ink hover:text-paper"
            >
              {two ? "»" : "←"}
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn(LABEL, "text-seal")}>Witness stand</span>
              <span className="truncate font-display text-[19px] leading-[1.2]">{witness ? witness.name : "No one on the stand"}</span>
            </div>
          </div>
          <Scroller ref={scRef} tabIndex={0} aria-label="Witness examination" className="flex flex-1 flex-col gap-3.5 px-4 pt-4 pb-5">
            {!witness ? (
              <>
                <span className="text-sm leading-[1.55] text-ink-label">
                  Select a party to call as a witness. You question them first, then the other side may cross-examine.
                </span>
                <div className="flex flex-col border-t border-ink/20">
                  {cands.map((c) => (
                    <div key={c.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-b border-ink/15 py-2.5">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex h-9 w-9 items-center justify-center font-display text-[13px]",
                          c.ours ? "bg-ink text-paper" : "border-[1.5px] border-ink-muted bg-transparent text-ink-muted",
                        )}
                      >
                        {c.ini}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-[14.5px] leading-[1.3] font-bold">{c.name}</span>
                        <span className="text-[12.5px] leading-[1.35] text-ink-meta">{c.sub}</span>
                      </span>
                      <button
                        type="button"
                        onClick={c.onCall}
                        aria-disabled={c.off}
                        aria-label={`Call ${c.name}`}
                        className={cn(
                          "h-9 cursor-pointer border-0 px-3.5 text-[11px] font-bold tracking-[0.14em] text-cream uppercase",
                          c.off ? "bg-ink-disabled" : "bg-ink hover:bg-seal",
                        )}
                      >
                        Call
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 border border-[rgba(154,91,18,.3)] bg-[#f3e6c6] p-3">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 flex-none items-center justify-center bg-ink font-display text-base text-paper"
                  >
                    {witness.ini}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[15px] leading-[1.3] font-bold">{witness.name}</span>
                    <span className="text-[12.5px] leading-[1.4] text-[#5a3608]">{witness.sub}</span>
                  </span>
                </div>
                {hist.map((h) => (
                  <div key={h.id} className="flex animate-[ac-enter_.3s_ease_both] flex-col gap-2">
                    <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-2">
                      <span className={cn("font-display text-base leading-[1.35]", h.mine ? "text-seal" : "text-ink")}>Q.</span>
                      <div className="flex flex-col gap-0.75">
                        <span className={cn(LABEL, "text-ink-meta")}>{h.by}</span>
                        <span className="text-[14.5px] leading-[1.55] italic">{h.q}</span>
                        {h.refs.length > 0 && (
                          <span className="flex flex-wrap gap-1.5 pt-0.5">
                            {h.refs.map((r) => {
                              const x = evidence.find((e) => e.exhibit_ref === r);
                              return (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => x && onExhibit(x.id)}
                                  title={x?.title}
                                  className="cursor-pointer border-[1.5px] border-seal bg-transparent px-1.25 pt-0.5 pb-px font-data text-[10.5px] font-bold text-seal"
                                >
                                  {r}
                                </button>
                              );
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    {h.objectable && (
                      <button
                        type="button"
                        onClick={() => onObject(h.id)}
                        className="relative ml-8 flex h-8.5 cursor-pointer items-center gap-1.5 self-start border-[1.5px] border-seal bg-transparent px-3 text-[11px] font-bold tracking-[0.14em] whitespace-nowrap text-seal uppercase before:absolute before:inset-x-0 before:-inset-y-1.25 before:content-[''] hover:bg-seal hover:text-cream"
                      >
                        Object
                      </button>
                    )}
                    {h.withdrawn ? (
                      <span className={cn(LABEL, "ml-8 text-ink-meta")}>Question withdrawn</span>
                    ) : (
                      (h.a !== null || !held) && (
                        <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-2 border border-[rgba(154,91,18,.25)] bg-[#f3e6c6] py-2.25 pr-2.5 pl-1.5">
                          <span className="font-display text-base leading-[1.35] text-amber">A.</span>
                          {h.a !== null ? (
                            <span className="text-[14.5px] leading-[1.55]">{h.a}</span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-[13.5px] text-ink-meta italic">
                              <span>{witness.first} is answering</span>
                              <Caret />
                            </span>
                          )}
                        </div>
                      )
                    )}
                  </div>
                ))}
                {busyNote && (
                  <div
                    role="status"
                    className="flex items-center gap-2 border border-dashed border-ink/40 px-3 py-2.5 text-[13.5px] leading-[1.45] text-ink-label"
                  >
                    <span>{busyNote}</span>
                    <Caret />
                  </div>
                )}
              </>
            )}
          </Scroller>
          {witness && foot && (
            <div className="flex flex-none flex-col gap-2 border-t-[3px] border-double border-ink bg-paper-soft px-3.5 pt-2.5 pb-3">
              {foot.kind === "ask" && (
                <>
                  <PinnedChips evidence={evidence} att={qAtt} onAtt={onQAtt} onExhibit={onExhibit} />
                  <div className="relative flex items-end gap-2">
                    <PinButton evidence={evidence} att={qAtt} onAtt={onQAtt} title="Put an exhibit to the witness" maxHeight={pickMax} />
                    <textarea
                      ref={qRef}
                      value={qDraft}
                      onChange={(e) => {
                        onQ(e.target.value);
                        grow(e.target);
                      }}
                      onKeyDown={onKey}
                      rows={1}
                      aria-label="Question for the witness"
                      placeholder="Ask the witness a question…"
                      className="h-11.5 max-h-35 min-w-0 flex-1 resize-none overflow-y-hidden rounded-none border-[1.5px] border-ink bg-[#f8f3e7] px-3 py-2.5 font-type text-[14.5px] leading-[1.45] text-ink outline-none placeholder:text-[#8f8574] focus:border-seal focus:shadow-[0_0_0_3px_rgba(142,31,25,.18)]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onAsk}
                      disabled={askOff}
                      className={cn(BTN, "border-0 text-cream", askOff ? "bg-ink-disabled" : "bg-seal hover:bg-seal-hover")}
                    >
                      {asking ? "Asking…" : "Ask question"}
                    </button>
                    <button
                      type="button"
                      onClick={onNoMore}
                      disabled={askOff}
                      className={cn(
                        BTN,
                        "border-[1.5px] border-ink bg-transparent text-ink hover:bg-[#f8f3e7] disabled:cursor-not-allowed",
                      )}
                    >
                      {foot.re ? "End re-examination · dismiss" : "No more questions"}
                    </button>
                  </div>
                </>
              )}
              {foot.kind === "choice" && (
                <>
                  <span className="text-[13.5px] leading-[1.45] text-ink-label">{foot.text}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={foot.onA}
                      className={cn(BTN, "border-[1.5px] border-ink bg-transparent text-ink hover:bg-[#f8f3e7]")}
                    >
                      {foot.a}
                    </button>
                    <button type="button" onClick={foot.onB} className={cn(BTN, "border-0 bg-ink text-paper hover:bg-seal")}>
                      {foot.b}
                    </button>
                  </div>
                </>
              )}
              {foot.kind === "view" && (
                <span className="text-[13.5px] leading-[1.45] text-ink-label">
                  The examination is being conducted from another device. You can follow the testimony here.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
