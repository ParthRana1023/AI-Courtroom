"use client";

import { useEffect, useState } from "react";
import Scroller from "@/components/court/scroller";
import { cn } from "@/lib/utils";
import type { EvidenceItem } from "@/types";

const LABEL = "text-[10.5px] font-bold uppercase tracking-[0.18em]";

/** The exhibits a sent message cites; each opens the exhibit. */
export function RefChips({ refs, evidence, onExhibit }: { refs: string[]; evidence: EvidenceItem[]; onExhibit: (id: string) => void }) {
  const items = refs.map((r) => evidence.find((x) => x.exhibit_ref === r)).filter((x): x is EvidenceItem => !!x);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <button
          key={x.id}
          type="button"
          onClick={() => onExhibit(x.id)}
          title={x.title}
          className="flex h-7 max-w-full cursor-pointer items-center gap-1.75 border border-ink/30 bg-[#f8f3e7] pr-2.5 pl-1 text-[12.5px] text-ink hover:border-seal"
        >
          <span className="flex-none border-[1.5px] border-seal px-1.25 pt-0.5 pb-px font-data text-[10.5px] font-bold whitespace-nowrap text-seal">
            {x.exhibit_ref}
          </span>
          <span className="truncate">{x.title}</span>
        </button>
      ))}
    </div>
  );
}

/** Exhibits pinned to an argument or a question, each removable. */
export function PinnedChips({
  evidence,
  att,
  onAtt,
  onExhibit,
}: {
  evidence: EvidenceItem[];
  att: string[];
  onAtt: (ids: string[]) => void;
  onExhibit: (id: string) => void;
}) {
  const pinned = att.map((id) => evidence.find((x) => x.id === id)).filter((x): x is EvidenceItem => !!x);
  if (!pinned.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={cn(LABEL, "text-ink-muted")}>Referring to</span>
      {pinned.map((x) => (
        <span key={x.id} className="flex h-7.5 items-center border border-ink/35 bg-[#f8f3e7]">
          <button
            type="button"
            onClick={() => onExhibit(x.id)}
            title={x.title}
            className="flex h-full max-w-60 cursor-pointer items-center gap-1.75 border-0 bg-transparent pr-1.5 pl-1 text-[12.5px] text-ink"
          >
            <span className="flex-none border-[1.5px] border-seal px-1.25 pt-0.5 pb-px font-data text-[10.5px] font-bold whitespace-nowrap text-seal">
              {x.exhibit_ref}
            </span>
            <span className="truncate">{x.title}</span>
          </button>
          <button
            type="button"
            onClick={() => onAtt(att.filter((a) => a !== x.id))}
            aria-label={`Remove ${x.exhibit_ref}`}
            className="h-full w-7 cursor-pointer border-0 border-l border-ink/20 bg-transparent text-base leading-none text-ink-muted hover:text-seal"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

/** The paperclip and its exhibit list. Place it in a `relative` row: the list opens above. */
export function PinButton({
  evidence,
  att,
  onAtt,
  title,
  maxHeight = () => Math.min(420, window.innerHeight * 0.55),
}: {
  evidence: EvidenceItem[];
  att: string[];
  onAtt: (ids: string[]) => void;
  /** tooltip, e.g. "Pin an exhibit to your argument" */
  title: string;
  /** room above the row for the list */
  maxHeight?: () => number;
}) {
  const [pick, setPick] = useState<number | null>(null);

  useEffect(() => {
    if (pick === null) return;
    // Captured and stopped so this Escape closes only the list, not the panel behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPick(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pick]);

  return (
    <>
      <button
        type="button"
        onClick={() => setPick(pick === null ? maxHeight() : null)}
        aria-expanded={pick !== null}
        aria-label="Pin an exhibit"
        title={title}
        className={cn(
          "flex h-11.5 w-11.5 flex-none cursor-pointer items-center justify-center border-[1.5px] border-ink transition-colors hover:border-seal",
          pick !== null || att.length ? "bg-ink text-paper" : "bg-transparent text-ink",
        )}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
          className="rotate-45"
        >
          <path d="M8.5 7v9.5a3.5 3.5 0 0 0 7 0V5.5a2.5 2.5 0 0 0-5 0V16a1 1 0 0 0 2 0V7" />
        </svg>
      </button>
      {pick !== null && (
        <>
          <div onClick={() => setPick(null)} className="fixed inset-0 z-29" />
          <div
            role="dialog"
            aria-label="Refer to an exhibit"
            // an open dialog keeps the page's Escape (closing the witness stand) from firing
            data-state="open"
            className="absolute bottom-[calc(100%+8px)] left-0 z-30 flex w-[min(380px,calc(100vw-40px))] animate-[ac-enter_.26s_cubic-bezier(.2,.8,.2,1)_both] flex-col border-[1.5px] border-ink bg-paper shadow-[0_24px_60px_-10px_rgba(18,13,9,.55)]"
            style={{ maxHeight: pick }}
          >
            <div className="flex flex-none items-center justify-between border-b-[3px] border-double border-ink pt-2.5 pr-3 pb-2 pl-3.5">
              <span className={cn(LABEL, "text-ink-label")}>Refer to an exhibit</span>
              <button
                type="button"
                onClick={() => setPick(null)}
                className={cn(LABEL, "h-7.5 cursor-pointer border-0 bg-ink px-2.5 tracking-[0.14em] text-paper")}
              >
                Done
              </button>
            </div>
            <Scroller className="flex-1">
              {evidence.length === 0 && (
                <p className="m-0 px-3.5 py-3 text-[13.5px] text-ink-hint italic">No exhibits are before the court yet.</p>
              )}
              {evidence.map((x) => {
                const on = att.includes(x.id);
                return (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => onAtt(on ? att.filter((a) => a !== x.id) : [...att, x.id])}
                    aria-pressed={on}
                    className={cn(
                      "grid w-full cursor-pointer grid-cols-[20px_44px_minmax(0,1fr)] items-start gap-2.5 border-0 border-b border-ink/12 px-3.5 py-2.5 text-left text-ink hover:bg-[#f8f3e7]",
                      on ? "bg-[#f3e6c6]" : "bg-transparent",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 flex h-4.5 w-4.5 items-center justify-center border-[1.5px] border-ink text-xs leading-none font-bold text-paper",
                        on ? "bg-seal" : "bg-transparent",
                      )}
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className="border-[1.5px] border-seal pt-0.75 pb-0.5 text-center font-data text-[11px] font-bold whitespace-nowrap text-seal">
                      {x.exhibit_ref}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13.5px] leading-[1.35] font-bold">{x.title}</span>
                      <span className="text-xs leading-[1.35] text-ink-meta">
                        {x.source || x.evidence_type}
                        {x.private && " · privileged, tendered when you cite it in court"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </Scroller>
          </div>
        </>
      )}
    </>
  );
}
