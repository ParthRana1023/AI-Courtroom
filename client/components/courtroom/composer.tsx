"use client";

import type { KeyboardEvent, Ref } from "react";
import { cn } from "@/lib/utils";
import type { EvidenceItem } from "@/types";
import { PinButton, PinnedChips } from "./exhibit-pin";

const LABEL = "text-[10.5px] font-bold uppercase tracking-[0.18em]";
// Voice input is switched off until it's ready; set to true to bring dictation back.
const VOICE_INPUT = false;

export interface ComposerNote {
  k: string;
  t: string;
  c: string;
  btn?: string;
  go?: () => void;
}

/** The paper strip under the record: argue, pin exhibits, dictate, or read why you can't. */
export default function Composer({
  mob,
  canArgue,
  closingAvail,
  mode,
  onMode,
  meta,
  evidence,
  cite,
  att,
  onAtt,
  onExhibit,
  draft,
  onDraft,
  onSubmit,
  placeholder,
  sendLabel,
  sendOff,
  sendGrey,
  sendTip,
  enterSubmits,
  autoExpand,
  mic,
  note,
  argRef,
  pickMax,
}: {
  mob: boolean;
  canArgue: boolean;
  closingAvail: boolean;
  mode: "arg" | "close";
  onMode: (m: "arg" | "close") => void;
  meta: string;
  evidence: EvidenceItem[];
  /** exhibits can be pinned: normal arguments only, not the opening or the closing */
  cite: boolean;
  /** pinned exhibit ids */
  att: string[];
  onAtt: (ids: string[]) => void;
  onExhibit: (id: string) => void;
  draft: string;
  onDraft: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  sendLabel: string;
  sendOff: boolean;
  sendGrey: boolean;
  sendTip?: string;
  enterSubmits: boolean;
  autoExpand: boolean;
  /** onSoon explains why the button is off while VOICE_INPUT is false */
  mic: { supported: boolean; listening: boolean; onToggle: () => void; onSoon: () => void };
  note: ComposerNote | null;
  argRef: Ref<HTMLTextAreaElement>;
  /** room above the composer for the exhibit picker */
  pickMax: () => number;
}) {
  const closing = mode === "close";

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || mob) return;
    if (enterSubmits ? !e.shiftKey : e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onSubmit();
    }
  };
  const grow = (el: HTMLTextAreaElement) => {
    if (!autoExpand) return;
    el.style.height = "auto";
    const h = el.scrollHeight + 3;
    el.style.height = `${Math.min(180, Math.max(46, h))}px`;
    el.style.overflowY = h > 180 ? "auto" : "hidden";
  };

  return (
    <div className={cn("flex flex-none flex-col gap-2 border-t-[3px] border-double border-ink bg-paper-soft", mob ? "px-3 pb-3 pt-2.5" : "px-6.5 pb-3.5 pt-3")}>
      {canArgue && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {closingAvail ? (
              <div role="tablist" aria-label="Submission type" className="flex border-[1.5px] border-ink">
                {(
                  [
                    ["arg", "Argument"],
                    ["close", "Closing statement"],
                  ] as const
                ).map(([k, t]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={mode === k}
                    onClick={() => onMode(k)}
                    className={cn(
                      LABEL,
                      "h-8 cursor-pointer whitespace-nowrap border-0 px-3 tracking-[0.14em] transition-colors",
                      mode === k ? "bg-ink text-paper" : "bg-transparent text-ink",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            ) : (
              <span className={cn(LABEL, "text-ink-label")}>Your argument</span>
            )}
            <span className="text-[12.5px] text-ink-muted">{meta}</span>
          </div>
          {closing && (
            <span className="text-pretty text-[13px] leading-[1.45] text-seal">
              Your closing statement ends the hearing. The court will then deliver its verdict. Sum up from the record: you can’t cite exhibits, bring new
              evidence or call a witness.
            </span>
          )}
          {cite && <PinnedChips evidence={evidence} att={att} onAtt={onAtt} onExhibit={onExhibit} />}
          <div className="relative flex items-end gap-2">
            {cite && <PinButton evidence={evidence} att={att} onAtt={onAtt} title="Pin an exhibit to your argument" maxHeight={pickMax} />}
            <textarea
              ref={argRef}
              value={draft}
              onChange={(e) => {
                onDraft(e.target.value);
                grow(e.target);
              }}
              onKeyDown={onKey}
              rows={1}
              aria-label={closing ? "Closing statement" : "Your argument"}
              placeholder={placeholder}
              className={cn(
                "h-11.5 max-h-45 min-w-0 flex-1 resize-none rounded-none border-[1.5px] bg-[#f8f3e7] px-3 py-2.5 font-type text-[15px] leading-normal text-ink outline-none placeholder:truncate placeholder:text-[#8f8574] focus:border-seal focus:shadow-[0_0_0_3px_rgba(142,31,25,.18)]",
                closing ? "border-seal" : "border-ink",
                autoExpand ? "overflow-y-hidden" : "overflow-y-auto",
              )}
            />
            {!VOICE_INPUT ? (
              <button
                type="button"
                onClick={mic.onSoon}
                aria-disabled="true"
                aria-label="Voice input, coming in a future update"
                title="Voice input is coming in a future update"
                className="flex h-11.5 w-11.5 flex-none cursor-not-allowed items-center justify-center border-[1.5px] border-ink-disabled bg-transparent text-ink-disabled"
              >
                <MicIcon />
              </button>
            ) : (
              mic.supported && (
                <button
                  type="button"
                  onClick={mic.onToggle}
                  aria-pressed={mic.listening}
                  aria-label={mic.listening ? "Stop dictating" : "Dictate your argument"}
                  title={mic.listening ? "Stop dictating" : "Dictate your argument"}
                  className={cn(
                    "flex h-11.5 w-11.5 flex-none cursor-pointer items-center justify-center border-[1.5px] transition-colors hover:border-seal",
                    mic.listening ? "border-seal bg-seal text-cream" : "border-ink bg-transparent text-ink",
                  )}
                >
                  <MicIcon />
                </button>
              )
            )}
            <button
              type="button"
              onClick={onSubmit}
              disabled={sendOff}
              title={sendTip}
              className={cn(
                "h-11.5 flex-none cursor-pointer whitespace-nowrap border-0 text-xs font-bold uppercase tracking-[0.14em] text-cream transition-colors disabled:cursor-not-allowed",
                mob ? "px-3.5" : "px-5.5",
                sendGrey ? "bg-ink-disabled" : "bg-seal hover:bg-seal-hover",
              )}
            >
              {sendLabel}
            </button>
          </div>
          {mic.listening && (
            <span role="status" className="flex items-center gap-2 text-[12.5px] text-seal">
              <span aria-hidden="true" className="h-2 w-2 animate-[ac-cursor_1s_steps(1)_infinite] bg-cursor" />
              <span>Listening. Speak your argument, then tap the microphone to stop.</span>
            </span>
          )}
          {!mob && !mic.listening && (
            <span className="text-[11.5px] text-ink-meta">
              {enterSubmits ? "Enter to submit · Shift + Enter for a new line" : "Ctrl + Enter to submit · Enter for a new line"}
            </span>
          )}
        </>
      )}
      {note && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 py-1">
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.75">
            <strong className={LABEL} style={{ color: note.c }}>
              {note.k}
            </strong>
            <span className="text-[13.5px] leading-[1.45] text-ink-label">{note.t}</span>
          </div>
          {note.btn && (
            <button
              type="button"
              onClick={note.go}
              className="h-11 cursor-pointer whitespace-nowrap border-0 bg-ink px-4.5 text-xs font-bold uppercase tracking-[0.14em] text-paper hover:bg-seal"
            >
              {note.btn}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </svg>
  );
}
