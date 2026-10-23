"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import CaseFileBody from "@/components/cases/case-file-body";
import CourtModelLoader from "@/components/court/court-model-loader";
import PaperMarkdown from "@/components/court/paper-markdown";
import Scroller from "@/components/court/scroller";
import Signature from "@/components/court/signature";
import type { CaseFile } from "@/lib/case-file";
import { caseFonts } from "@/lib/signature";
import { cn } from "@/lib/utils";
import type { CaseOutcome } from "@/types";

const LABEL = "text-[10.5px] font-bold uppercase tracking-[0.18em]";

/** These dialogs open from state, not a Radix trigger, so return focus to whatever opened them. */
export function useReturnFocus() {
  const ret = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      ret.current = document.activeElement as HTMLElement | null;
    },
    onCloseAutoFocus: (e: Event) => {
      if (!ret.current?.isConnected) return;
      e.preventDefault();
      ret.current.focus();
    },
  };
}

export const CLOSE = "h-10 w-10 flex-none cursor-pointer border-0 bg-ink text-[22px] leading-none text-paper hover:bg-seal";

const OUTCOME: Record<CaseOutcome, [string, string]> = {
  won: ["WON", "#3f6b3a"],
  lost: ["LOST", "#8e1f19"],
  partial: ["PARTLY WON", "#7a4a0c"],
  settled: ["SETTLED", "#120d09"],
};

/** A paper dialog: header strip with the close ×, a scrolling body, an optional footer. */
function Shell({
  open,
  onClose,
  label,
  extra,
  title,
  max,
  small,
  z = 64,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  extra?: ReactNode;
  /** accessible title (the visible heading lives in the body) */
  title: string;
  max: string;
  small: boolean;
  z?: number;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const focus = useReturnFocus();
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 animate-[ac-fade_.24s_ease_both] bg-(--scrim)" style={{ zIndex: z }} />
        <Dialog.Content
          aria-describedby={undefined}
          {...focus}
          className={cn(
            "fixed inset-0 m-auto flex h-fit w-full animate-[ac-rise_.42s_cubic-bezier(.2,.8,.2,1)_both] flex-col bg-paper font-type text-ink shadow-dialog outline-none",
            max,
            small ? "max-h-dvh" : "max-h-[calc(100dvh-48px)] w-[calc(100%-48px)]",
          )}
          style={{ zIndex: z + 1 }}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <div className="flex flex-none items-center justify-between gap-3 border-b-[3px] border-double border-ink pt-3 pr-3.5 pb-2.5 pl-5.5">
            <span className={cn(LABEL, "text-ink-label")}>{label}</span>
            <div className="flex items-center gap-2.5">
              {extra}
              <Dialog.Close aria-label="Close" className={CLOSE}>
                ×
              </Dialog.Close>
            </div>
          </div>
          <Scroller tabIndex={0} className={cn("flex flex-1 flex-col gap-4.5", small ? "px-4 pt-4.5 pb-5.5" : "px-8 pt-6 pb-7")}>
            {children}
          </Scroller>
          {footer}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const H2 = (small: boolean) => cn("m-0 font-display font-normal", small ? "text-[26px]" : "text-[32px]");

export function CaseFilePanel({
  open,
  onClose,
  cnr,
  title,
  file,
  meta,
  small,
}: {
  open: boolean;
  onClose: () => void;
  cnr: string;
  title: string;
  file: CaseFile;
  meta: string;
  small: boolean;
}) {
  const focus = useReturnFocus();
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-63 animate-[ac-fade_.24s_ease_both] bg-(--scrim)" />
        <Dialog.Content
          aria-describedby={undefined}
          {...focus}
          className="fixed inset-y-0 right-0 z-64 flex w-[min(720px,100%)] animate-[ac-panel_.44s_cubic-bezier(.2,.8,.2,1)_both] flex-col bg-paper font-type text-ink shadow-[-30px_0_80px_rgba(0,0,0,.6)] outline-none light:shadow-[-30px_0_80px_rgba(60,44,28,.25)]"
        >
          <div className="flex flex-none items-center justify-between gap-3 border-b-[3px] border-double border-ink pt-3 pr-3.5 pb-2.5 pl-5.5">
            <span className={cn(LABEL, "text-ink-label")}>Case file · {cnr}</span>
            <Dialog.Close aria-label="Close" className={CLOSE}>
              ×
            </Dialog.Close>
          </div>
          <Scroller tabIndex={0} className={cn("flex flex-1 flex-col gap-7", small ? "px-4 pt-4.5 pb-6.5" : "px-8.5 pt-6 pb-8")}>
            <Dialog.Title className="m-0 font-display text-[28px] leading-[1.15] font-normal">{title}</Dialog.Title>
            {meta && <span className="-mt-4.5 text-[13.5px] text-ink-muted">{meta}</span>}
            <CaseFileBody file={file} mob={small} />
            <Link
              href={`/cases/${cnr}`}
              className="self-start border-b border-ink pb-0.5 text-[11px] font-bold tracking-[0.16em] text-ink uppercase hover:border-seal hover:text-seal"
            >
              Open the full case file →
            </Link>
          </Scroller>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type StampKind =
  "session" | "adjourned" | "limit" | "deliberating" | "considering" | "seeking" | "objected" | "sustained" | "overruled";

const STAMPS: Record<StampKind, { k: string; t: string; c: string; wait?: boolean }> = {
  session: { k: "COURT IS IN SESSION", t: "All rise. Counsel may address the court.", c: "#9fd0a4" },
  adjourned: { k: "COURT ADJOURNED", t: "The hearing is paused. You can resume it later from here or from Case Prep.", c: "#e9c77e" },
  limit: { k: "COURT ADJOURNED", t: "That was the last argument allowed today. The court will sit again tomorrow.", c: "#e9c77e" },
  deliberating: { k: "THE COURT IS DELIBERATING", t: "Closing statements are complete. Judgment will follow.", c: "#efe6d3", wait: true },
  considering: { k: "OBJECTION", t: "The court is considering the objection.", c: "#e9c77e", wait: true },
  seeking: { k: "TIME TO SETTLE", t: "The court is considering counsel’s request for an adjournment.", c: "#e9c77e", wait: true },
  objected: { k: "OBJECTION", t: "Opposing counsel objects. The court is considering the objection.", c: "#e9c77e", wait: true },
  sustained: { k: "SUSTAINED", t: "The objection is upheld.", c: "#9fd0a4" },
  overruled: { k: "OVERRULED", t: "The objection is rejected.", c: "#e0786c" },
};

/** A rubber stamp over the desk: session opened, adjourned, deliberating, the ruling on an objection. */
export function Stamp({ kind, small }: { kind: StampKind | null; small: boolean }) {
  if (!kind) return null;
  const s = STAMPS[kind];
  return (
    <div
      className={cn(
        "fixed inset-0 z-66 flex animate-[ac-fade_.24s_ease_both] items-center justify-center bg-[rgba(7,5,4,.82)]",
        small ? "p-0" : "p-6",
      )}
    >
      <div
        key={kind}
        role="status"
        aria-live="assertive"
        className="flex max-w-130 animate-[ac-pop_.52s_cubic-bezier(.3,1.4,.5,1)_both] flex-col items-center gap-4.5 px-4 text-center"
      >
        <span
          className={cn(
            "-rotate-4 border-[5px] border-double bg-[rgba(7,5,4,.4)] px-6 pt-3.5 pb-2.5 font-display leading-none tracking-[0.08em]",
            small ? "text-[30px]" : "text-[46px]",
          )}
          style={{ borderColor: s.c, color: s.c }}
        >
          {s.k}
        </span>
        <span className="text-[15px] leading-[1.55] text-balance text-[#d8ccb4]">{s.t}</span>
        {s.wait && <span aria-hidden="true" className="inline-block h-0.5 w-2.5 animate-[ac-cursor_1s_steps(1)_infinite] bg-cursor" />}
      </div>
    </div>
  );
}

/** "The Defence calls … to the witness stand." */
export function CallAlert({ alert, small }: { alert: { by: string; name: string } | null; small: boolean }) {
  if (!alert) return null;
  return (
    <div
      className={cn(
        "fixed inset-0 z-65 flex animate-[ac-fade_.24s_ease_both] items-center justify-center bg-(--scrim)",
        small ? "p-0" : "p-6",
      )}
    >
      <div
        role="alertdialog"
        aria-labelledby="al-t"
        className="flex w-full max-w-120 animate-[ac-rise_.42s_cubic-bezier(.2,.8,.2,1)_both] flex-col items-center gap-2.5 bg-paper px-7 pt-6.5 pb-6 text-center font-type text-ink shadow-dialog"
      >
        <span className={cn(LABEL, "text-seal")}>{alert.by} calls</span>
        <span id="al-t" className="font-display text-[32px] leading-[1.1]">
          {alert.name}
        </span>
        <span className="text-sm text-ink-label">to the witness stand</span>
      </div>
    </div>
  );
}

export const GROUNDS = {
  leave: ["Irrelevant to the charge", "Not on the witness list", "Repetitive evidence", "Unfair surprise"],
  question: ["Leading question", "Hearsay", "Speculation", "Asked and answered", "Irrelevant"],
  argument: ["Facts not in evidence", "Misstates the evidence", "Argumentative", "Irrelevant"],
};
const PLACEHOLDER = {
  leave: "For example: she wasn’t at the site office and can’t speak to the sanction letter.",
  question: "For example: the question puts words in the witness’s mouth.",
  argument: "For example: nothing in the record supports that figure.",
};

export function ObjectionDialog({
  target,
  onClose,
  onRaise,
  small,
}: {
  target: { kind: keyof typeof GROUNDS; who: string; text: string } | null;
  onClose: () => void;
  onRaise: (grounds: string, details: string) => void;
  small: boolean;
}) {
  const [g, setG] = useState("");
  const [reason, setReason] = useState("");
  const close = () => {
    setG("");
    setReason("");
    onClose();
  };
  const kind = target?.kind ?? "argument";
  return (
    <Shell
      open={!!target}
      onClose={close}
      label="Raise an objection"
      title="Objection, your honour."
      max="max-w-150"
      small={small}
      footer={
        <div className="flex flex-none flex-wrap justify-end gap-2 border-t-[3px] border-double border-ink px-4.5 pt-3 pb-3.5">
          <button
            type="button"
            onClick={close}
            className="h-11.5 cursor-pointer border-[1.5px] border-ink bg-transparent px-4.5 text-xs font-bold tracking-[0.14em] whitespace-nowrap text-ink uppercase hover:bg-[#f8f3e7]"
          >
            Withdraw
          </button>
          <button
            type="button"
            onClick={() => {
              onRaise(g, reason.trim());
              if (g) {
                setG("");
                setReason("");
              }
            }}
            aria-disabled={!g}
            className={cn(
              "h-11.5 cursor-pointer border-0 px-5 text-xs font-bold tracking-[0.14em] whitespace-nowrap text-cream uppercase",
              g ? "bg-seal hover:bg-seal-hover" : "bg-ink-disabled",
            )}
          >
            Raise objection
          </button>
        </div>
      }
    >
      <h2 className={cn(H2(small), "leading-[1.05] text-seal")}>Objection, your honour.</h2>
      <div className="flex flex-col gap-1.5 border-l-[3px] border-ink py-1 pl-3.5">
        <span className={cn(LABEL, "text-ink-meta")}>{target?.who}</span>
        <p className="m-0 line-clamp-4 text-[14.5px] leading-[1.6] text-[#2a2018]">{target?.text}</p>
      </div>
      <div className="flex flex-col gap-2">
        <span id="ob-g" className={cn(LABEL, "text-ink-label")}>
          Grounds
        </span>
        <div role="radiogroup" aria-labelledby="ob-g" className="flex flex-wrap gap-1.5">
          {GROUNDS[kind].map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={g === t}
              onClick={() => setG(t)}
              className={cn(
                "min-h-9.5 cursor-pointer border-[1.5px] border-ink px-3 text-[13.5px] transition-colors hover:border-seal",
                g === t ? "bg-ink text-paper" : "bg-transparent text-ink",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-2">
        <span className={cn(LABEL, "text-ink-label")}>
          Reason <span className="font-normal tracking-[0.08em] text-ink-meta normal-case">· optional · tell the court why</span>
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 500))}
          maxLength={500}
          rows={3}
          placeholder={PLACEHOLDER[kind]}
          className="h-24 w-full resize-y rounded-none border-[1.5px] border-ink bg-[#f8f3e7] px-3 py-2.5 font-type text-[14.5px] leading-normal text-ink outline-none placeholder:text-[#8f8574] focus:border-seal focus:shadow-[0_0_0_3px_rgba(142,31,25,.18)]"
        />
        <span className="text-[12.5px] text-ink-muted">{reason.length} / 500</span>
      </label>
    </Shell>
  );
}

const REASONS: [string, string, string][] = [
  ["law", "Wrong law or procedure", "Cites the wrong BNS/BNSS section or misstates a rule."],
  ["facts", "Made-up facts or evidence", "Refers to something not in the case file or record."],
  ["harm", "Harmful or offensive", "Abusive, biased or unsafe content."],
  ["role", "Out of character", "Doesn’t act like a judge, counsel or witness would."],
  ["other", "Something else", "Describe it in the details box."],
];

export function ReportDialog({
  target,
  onClose,
  onSend,
  small,
}: {
  target: { who: string; text: string; no: string } | null;
  onClose: () => void;
  /** resolves true once sent */
  onSend: (reason: string, details: string) => Promise<boolean>;
  small: boolean;
}) {
  const [r, setR] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const focus = useReturnFocus();
  const close = () => {
    setR("");
    setNote("");
    onClose();
  };
  return (
    <Dialog.Root open={!!target} onOpenChange={(o) => !o && !busy && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-68 animate-[ac-fade_.24s_ease_both] bg-(--scrim)" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={focus.onCloseAutoFocus}
          onOpenAutoFocus={(e) => {
            focus.onOpenAutoFocus();
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector<HTMLElement>("[role=radio]")?.focus();
          }}
          className={cn(
            "fixed inset-0 z-69 m-auto flex h-fit w-full max-w-140 animate-[ac-rise_.42s_cubic-bezier(.2,.8,.2,1)_both] flex-col bg-paper font-type text-ink shadow-dialog outline-none",
            small ? "max-h-dvh" : "max-h-[calc(100dvh-48px)] w-[calc(100%-48px)]",
          )}
        >
          <form
            noValidate
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              const ok = await onSend(r, note.trim());
              setBusy(false);
              if (ok) close();
            }}
          >
            <div className="flex flex-none items-center justify-between gap-3 border-b-[3px] border-double border-ink pt-3 pr-3.5 pb-2.5 pl-5.5">
              <span className={cn(LABEL, "text-ink-label")}>Form F-1 · Report a response</span>
              <Dialog.Close aria-label="Close" className={CLOSE}>
                ×
              </Dialog.Close>
            </div>
            <Scroller tabIndex={0} className={cn("flex flex-1 flex-col gap-4.5", small ? "px-4 pt-4.5 pb-5.5" : "px-8 pt-6 pb-7")}>
              <div className="flex flex-col gap-1.5">
                <Dialog.Title className={cn(H2(small), "leading-[1.05]")}>What’s wrong with this response?</Dialog.Title>
                <p className="m-0 text-sm leading-normal text-pretty text-ink-muted">
                  Reports go to the maker himself, not the court. The hearing isn’t affected.
                </p>
              </div>
              <div className="flex flex-col gap-1.5 border-l-[3px] border-ink py-1 pl-3.5">
                <span className={cn(LABEL, "text-ink-meta")}>{target?.who}</span>
                <p className="m-0 line-clamp-4 text-[14.5px] leading-[1.6] text-[#2a2018]">{target?.text}</p>
              </div>
              <div role="radiogroup" aria-labelledby="rp-r" className="flex flex-col">
                <span id="rp-r" className={cn(LABEL, "pb-1.5 text-ink-label")}>
                  Reason
                </span>
                {REASONS.map(([k, t, d]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={r === k}
                    onClick={() => setR(k)}
                    className="flex cursor-pointer items-start gap-3 border-0 border-t border-ink/12 bg-transparent py-2.5 text-left text-ink"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-4.5 w-4.5 flex-none items-center justify-center rounded-full border-2 border-ink"
                    >
                      <span className={cn("h-2 w-2 rounded-full", r === k ? "bg-seal" : "bg-transparent")} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[15px] font-bold">{t}</span>
                      <span className="text-[13px] leading-[1.45] text-ink-muted">{d}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1.75">
                <label htmlFor="rp-n" className={cn(LABEL, "text-ink-label")}>
                  Details (optional)
                </label>
                <textarea
                  id="rp-n"
                  rows={3}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 500))}
                  placeholder="For example: Section 318 BNS is cheating, not criminal breach of trust."
                  className="w-full resize-y rounded-none border-0 border-b-2 border-ink/55 bg-paper-alt px-3.5 py-3 font-type text-[15px] leading-normal text-ink outline-none placeholder:text-[#8f8574] focus:bg-[#f8f3e7]"
                />
                <span className="text-[12.5px] text-ink-muted">
                  {note.length} / 500 · Your case number and entry {target?.no} are attached automatically.
                </span>
              </div>
            </Scroller>
            <div className="flex flex-none flex-wrap gap-2 border-t-[3px] border-double border-ink px-5.5 pt-3 pb-4">
              <Dialog.Close className="h-11.5 cursor-pointer border-[1.5px] border-ink bg-transparent px-4.5 text-xs font-bold tracking-[0.14em] text-ink uppercase hover:bg-[#f8f3e7]">
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                aria-disabled={!r}
                className={cn(
                  "h-11.5 flex-[1_1_200px] cursor-pointer border-0 px-4.5 text-xs font-bold tracking-[0.14em] text-cream uppercase",
                  r ? "bg-seal" : "bg-ink-disabled",
                )}
              >
                {busy ? "Sending…" : "Send report"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function VerdictDialog({
  open,
  onClose,
  cnr,
  verdict,
  outcome,
  meta,
  reported,
  onReport,
  onAnalyse,
  small,
}: {
  open: boolean;
  onClose: () => void;
  cnr: string;
  verdict: string;
  outcome: CaseOutcome | null | undefined;
  meta: string;
  reported: boolean;
  onReport: () => void;
  onAnalyse: () => void;
  small: boolean;
}) {
  const out = outcome ? OUTCOME[outcome] : null;
  const sig = useMemo(() => signedBy(verdict), [verdict]);
  const font = useMemo(() => (sig.judge ? caseFonts(cnr, [sig.judge])[sig.judge] : null), [cnr, sig.judge]);
  return (
    <Shell
      open={open}
      onClose={onClose}
      label={`Judgment · ${cnr}`}
      title="Verdict"
      max="max-w-195"
      small={small}
      footer={
        <div className="flex flex-none flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-t-[3px] border-double border-ink px-4.5 pt-3 pb-3.5">
          <span className="flex flex-[1_1_220px] flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-[12.5px] leading-[1.45] text-pretty text-ink-muted">
            <span>An AI-generated ruling for practice. It is not legal advice.</span>
            <button
              type="button"
              onClick={onReport}
              disabled={reported}
              className="min-h-8 cursor-pointer border-0 border-b border-[rgba(142,31,25,.45)] bg-transparent p-0 text-[12.5px] text-seal hover:text-ink disabled:cursor-default"
            >
              {reported ? "Ruling reported" : "Report this ruling"}
            </button>
          </span>
          <button
            type="button"
            onClick={onAnalyse}
            className="h-11.5 cursor-pointer border-0 bg-seal px-4.5 text-xs font-bold tracking-[0.14em] whitespace-nowrap text-cream uppercase hover:bg-seal-hover"
          >
            Analyse my case →
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-ink/25 pb-3.5">
        <div className="flex flex-col gap-1">
          <h2 className={cn(H2(small), "leading-[1.1]")}>Verdict</h2>
          {meta && <span className="text-[13.5px] text-ink-muted">{meta}</span>}
        </div>
        {out && (
          <span
            className="-rotate-3 border-[3px] border-double px-3.5 pt-1.75 pb-1.25 font-display text-[17px] leading-none tracking-[0.06em]"
            style={{ borderColor: out[1], color: out[1] }}
          >
            {out[0]}
          </span>
        )}
      </div>
      <PaperMarkdown text={sig.body} />
      {sig.judge && font && (
        <div className="flex w-[min(230px,100%)] flex-col items-end gap-0.75 self-end">
          <Signature
            name={sig.judge}
            font={font}
            color="#120d09"
            align="right"
            delay={600}
            className="h-10 w-full max-w-52.5 origin-bottom-left -rotate-2"
          />
          <span className="self-stretch border-t-[1.5px] border-ink" />
          <span className="text-[13px] font-bold text-ink">{sig.judge}, J.</span>
          {sig.tail.map((t) => (
            <span key={t} className="text-[12.5px] text-ink-label">
              {t}
            </span>
          ))}
        </div>
      )}
    </Shell>
  );
}

/**
 * The judge named in the coram ("CORAM: HON'BLE R. K. Mehta, J."), and the judgment without its
 * closing signature lines (name, seat, date), which are drawn as a signature block instead.
 */
function signedBy(md: string) {
  const strip = (s: string) => s.replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
  // "R. K. MEHTA" → "R. K. Mehta": the header is often in capitals; a signature isn't.
  const proper = (s: string) =>
    s === s.toUpperCase() ? s.replace(/([A-Z])([A-Z']+)/g, (_, a: string, b: string) => a + b.toLowerCase()) : s;
  const judge = strip(md.match(/CORAM:\s*\**\s*HON'?BLE\s+(?:(?:MR|MS|MRS|DR)\.?\s+)?(?:JUSTICE\s+)?(.+?),\s*J\.?/i)?.[1] ?? "");
  if (!judge) return { body: md, judge: "", tail: [] as string[] };
  const lines = md.trimEnd().split("\n");
  // Only the last few lines: the coram line at the top also carries the name.
  const at = lines.findLastIndex((l, i) => i >= lines.length - 6 && strip(l).toLowerCase().includes(judge.toLowerCase()));
  if (at < 0) return { body: md, judge: proper(judge), tail: [] as string[] };
  const line = strip(lines[at]);
  const from = line.toLowerCase().indexOf(judge.toLowerCase());
  return {
    body: lines.slice(0, at).join("\n"),
    judge: proper(line.slice(from, from + judge.length)),
    tail: lines
      .slice(at + 1)
      .map(strip)
      .filter(Boolean),
  };
}

/** "### Mistakes" → its own group, with a mark for its bullets. */
function analysisGroups(md: string) {
  const parts = md.split(/^#{1,3}\s+(.+)$/m);
  const groups: { t: string; body: string }[] = [];
  if (parts[0].trim()) groups.push({ t: "", body: parts[0] });
  for (let i = 1; i < parts.length; i += 2) groups.push({ t: parts[i].replace(/\*/g, "").trim(), body: parts[i + 1] ?? "" });
  return groups.map((g) => {
    const [mark, c] = /mistake|didn|weak/i.test(g.t)
      ? ["−", "#8e1f19"]
      : /suggest|worked|strength/i.test(g.t)
        ? ["+", "#3f6b3a"]
        : ["→", "#120d09"];
    return { ...g, mark, c };
  });
}

export function AnalysisDialog({
  open,
  onClose,
  state,
  onRetry,
  outcome,
  sub,
  foot,
  small,
  label = "Case analysis",
  title = "How you argued",
  loading = "Reviewing how you argued…",
  badge,
}: {
  open: boolean;
  onClose: () => void;
  state: { text: string } | "loading" | "error";
  onRetry: () => void;
  outcome: CaseOutcome | null | undefined;
  sub: string;
  foot: [string, string];
  small: boolean;
  label?: string;
  title?: string;
  loading?: string;
  badge?: [string, string]; // [text, colour] in place of the outcome
}) {
  const out = badge ?? (outcome ? OUTCOME[outcome] : null);
  return (
    <Shell
      open={open}
      onClose={onClose}
      label={label}
      title={title}
      max="max-w-195"
      small={small}
      extra={
        out && (
          <span
            className={cn(LABEL, "border-[1.5px] px-2.25 pt-1 pb-0.75 tracking-[0.16em]")}
            style={{ borderColor: out[1], color: out[1] }}
          >
            {out[0]}
          </span>
        )
      }
      footer={
        <div className="flex flex-none flex-wrap justify-between gap-2.5 border-t-[3px] border-double border-ink px-5.5 pt-3 pb-3.5 text-[12.5px] text-ink-muted">
          <span>{foot[0]}</span>
          <span>{foot[1]}</span>
        </div>
      }
    >
      <div className="flex flex-col gap-1">
        <h2 className={cn(H2(small), "leading-[1.1]")}>{title}</h2>
        <span className="text-[13.5px] text-ink-muted">{sub}</span>
      </div>
      {state === "loading" && (
        <div className="flex flex-col items-center gap-3 py-6">
          <CourtModelLoader status={loading} tone="paper" />
        </div>
      )}
      {state === "error" && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <span className="text-[15px] leading-normal text-ink-label">The analysis couldn’t be prepared. Please try again.</span>
          <button
            type="button"
            onClick={onRetry}
            className="h-11.5 cursor-pointer border-0 bg-seal px-4.5 text-xs font-bold tracking-[0.14em] text-cream uppercase hover:bg-seal-hover"
          >
            Try again
          </button>
        </div>
      )}
      {typeof state === "object" &&
        analysisGroups(state.text).map((g, i) => (
          <div key={i} className="flex flex-col gap-2.5">
            {g.t && (
              <h3 className="m-0 border-b border-ink/25 pb-2 text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: g.c }}>
                {g.t}
              </h3>
            )}
            <PaperMarkdown text={g.body} mark={g.mark} markColor={g.c} />
          </div>
        ))}
      {typeof state === "object" && !state.text.trim() && <p className="m-0 text-ink-hint italic">No analysis was generated.</p>}
    </Shell>
  );
}
