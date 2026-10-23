"use client";

import type { CSSProperties, ReactNode, Ref } from "react";
import Scroller from "@/components/court/scroller";
import { RefChips } from "./exhibit-pin";
import { cn } from "@/lib/utils";
import { CourtroomProceedingsEventType as T, type CourtroomProceedingsEvent, type EvidenceItem } from "@/types";

export type Side = "plaintiff" | "defendant";
export type Ev = CourtroomProceedingsEvent & { id: string };

export const SIDE: Record<Side, string> = { plaintiff: "Counsel for the Plaintiff", defendant: "Counsel for the Defence" };
export const THE: Record<Side, string> = { plaintiff: "The Plaintiff", defendant: "The Defence" };

const SPOKEN = new Set<string>([T.ARGUMENT, T.AI_ARGUMENT, T.OPENING_STATEMENT, T.CLOSING_STATEMENT]);
/** After one of these, the hearing has moved on from the entry before it. */
export const MOVES_ON = new Set<string>([...SPOKEN, T.WITNESS_EXAMINED_Q]);

const pad = (n: number) => String(n).padStart(2, "0");

/** HH:MM. The database hands back naive UTC times. */
function clock(ts: string) {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`);
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The AI said it: the other side's arguments, questions and leave requests, every answer and ruling. */
export function aiMade(e: Ev, ai: Side) {
  if (e.type === T.WITNESS_EXAMINED_A || e.type === T.RULING) return true;
  // In a settlement hearing everyone but the user speaks through the AI.
  if (e.type === T.SETTLEMENT) return e.speaker_role !== (ai === "plaintiff" ? "defendant" : "plaintiff");
  return e.speaker_role === ai && (MOVES_ON.has(e.type) || e.type === T.LEAVE_REQUEST);
}

type Group = { kind: "group"; id: string; items: { e: Ev; i: number }[]; done: boolean };
export type Row = { kind: "entry"; e: Ev; i: number } | Group;

/** Each witness's examination, from being called to stepping down, folds into one entry. */
export function buildRows(events: Ev[]): Row[] {
  const rows: Row[] = [];
  let group: Group | null = null;
  events.forEach((e, i) => {
    if (e.type === T.WITNESS_CALLED) {
      group = { kind: "group", id: e.id, items: [{ e, i }], done: false };
      rows.push(group);
      return;
    }
    if (group) {
      group.items.push({ e, i });
      if (e.type === T.WITNESS_DISMISSED) {
        group.done = true;
        group = null;
      }
      return;
    }
    rows.push({ kind: "entry", e, i });
  });
  return rows;
}

export interface RecordCtx {
  me: Side;
  ai: Side;
  mob: boolean;
  typing: { id: string; n: number } | null;
  /** Fresh entries (not in the record when the page opened) animate in. */
  fresh: (id: string) => boolean;
  /** party id → name */
  names: Record<string, string>;
  evidence: EvidenceItem[];
  /** The one entry the user may object to now. */
  objectable: string | null;
  onObject: (e: Ev) => void;
  reported: Set<string>;
  onReport: (e: Ev, no: string) => void;
  /** The leave request waiting for the user's answer. */
  leaveOpen: string | null;
  onNoObjection: () => void;
  canExtract: boolean;
  extracting: string | null;
  onExtract: (e: Ev) => void;
  onExhibit: (id: string) => void;
}

const LABEL = "text-[10.5px] font-bold uppercase tracking-[0.18em]";

export function Caret() {
  return (
    <span aria-hidden="true" className="ml-0.75 inline-block h-0.5 w-2 animate-[ac-cursor_1s_steps(1)_infinite] bg-seal align-baseline" />
  );
}

const sideOf = (role?: string): Side => (role === "defendant" ? "defendant" : "plaintiff");

/** The text of a line from the court. */
function sysText(e: Ev, names: Record<string, string>) {
  const name = names[e.witness_id ?? ""] || (e.type === T.WITNESS_CALLED ? e.speaker_name : "") || "The witness";
  if (e.type === T.WITNESS_CALLED) return `${THE[sideOf(e.speaker_role)]} calls ${name} to the stand`;
  if (e.type === T.WITNESS_DISMISSED) return `${name} steps down`;
  return e.content;
}

function ObjectButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        LABEL,
        "ml-auto h-7 cursor-pointer border-[1.5px] border-seal bg-transparent px-2.5 tracking-[0.16em] text-seal transition-colors hover:bg-seal hover:text-cream",
      )}
    >
      Object
    </button>
  );
}

function ReportButton({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={done}
      aria-label={done ? "Response reported" : "Report this AI response"}
      className="flex min-h-8 cursor-pointer items-center gap-1.5 self-start border-0 bg-transparent p-0 text-xs tracking-[0.06em] text-ink-meta hover:text-seal disabled:cursor-default disabled:hover:text-ink-meta"
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2 border-l-[1.5px] border-current bg-[linear-gradient(currentColor,currentColor)] bg-size-[6px_5px] bg-position-[1.5px_0] bg-no-repeat"
      />
      <span>{done ? "Reported" : "Report"}</span>
    </button>
  );
}

function Struck({ e }: { e: Ev }) {
  if (!e.struck) return null;
  return (
    <span
      className={cn(
        LABEL,
        "rotate-[-1.5deg] self-start border-[1.5px] border-ink-label px-2 pt-0.75 pb-0.5 tracking-[0.14em] text-ink-label",
      )}
    >
      {e.struck === "withdrawn" ? "Question withdrawn" : "Struck from the record"}
    </span>
  );
}

function ExhibitChips({ e, ctx }: { e: Ev; ctx: RecordCtx }) {
  const refs = Array.from(new Set([...(e.exhibit_refs ?? []), ...(e.content.match(/\bEX-\d+\b/g) ?? [])]));
  return <RefChips refs={refs} evidence={ctx.evidence} onExhibit={ctx.onExhibit} />;
}

function Entry({ e, i, ctx }: { e: Ev; i: number; ctx: RecordCtx }) {
  const { me, ai, mob, typing } = ctx;
  const no = pad(i + 1);
  const mine = e.speaker_role === me;
  const isTyping = typing?.id === e.id;
  const text = isTyping ? e.content.slice(0, typing.n) : e.content;
  const canReport = aiMade(e, ai) && !isTyping && e.type !== T.WITNESS_EXAMINED_A && e.type !== T.SETTLEMENT;
  const canObject = ctx.objectable === e.id && !isTyping;
  const fs = mob ? "text-[15px]" : "text-base";
  const op = e.struck ? 0.5 : 1;

  let body: ReactNode;
  if (e.type === T.WITNESS_EXAMINED_Q) {
    body = (
      <div className={cn("grid min-w-0 grid-cols-[28px_minmax(0,1fr)] gap-x-2", !mob && "pl-6")}>
        <span className={cn("font-display text-lg leading-[1.35]", mine ? "text-seal" : "text-ink")}>Q.</span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className={cn(LABEL, "text-ink-meta")}>{mine ? `You · ${SIDE[me]}` : `${SIDE[ai]} · AI`}</span>
            {canObject && <ObjectButton onClick={() => ctx.onObject(e)} />}
          </div>
          <p className={cn("m-0 max-w-[72ch] leading-[1.6] text-pretty text-ink italic", fs)} style={{ opacity: op }}>
            {text}
            {isTyping && <Caret />}
          </p>
          {!isTyping && <ExhibitChips e={e} ctx={ctx} />}
          {canReport && <ReportButton done={ctx.reported.has(e.id)} onClick={() => ctx.onReport(e, no)} />}
          <Struck e={e} />
        </div>
      </div>
    );
  } else if (e.type === T.WITNESS_EXAMINED_A) {
    const logged = ctx.evidence.find((x) => x.origin_id === e.id);
    const busy = ctx.extracting === e.id;
    body = (
      <div
        className={cn(
          "grid min-w-0 grid-cols-[28px_minmax(0,1fr)] gap-x-2 border border-[rgba(154,91,18,.3)] bg-[#f3e6c6] py-3 pr-4 pl-2.5",
          !mob && "ml-6",
        )}
      >
        <span className="font-display text-lg leading-[1.35] text-amber">A.</span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={cn(LABEL, "text-amber")}>Testimony · {ctx.names[e.witness_id ?? ""] || e.speaker_name || "Witness"}</span>
          <p className={cn("m-0 max-w-[72ch] leading-[1.65] text-pretty whitespace-pre-wrap text-ink", fs)} style={{ opacity: op }}>
            <span>{text}</span>
            {isTyping && <Caret />}
          </p>
          {logged ? (
            <span
              className={cn(
                LABEL,
                "rotate-[-1.5deg] self-start border-[1.5px] border-seal px-2.25 pt-1 pb-0.75 tracking-[0.14em] whitespace-nowrap text-seal",
              )}
            >
              {logged.extracted_by === ai ? `Logged by ${THE[ai].replace("The ", "the ")} as` : "Logged as"} {logged.exhibit_ref}
            </span>
          ) : (
            ctx.canExtract &&
            !isTyping &&
            !e.struck && (
              <button
                type="button"
                onClick={() => ctx.onExtract(e)}
                disabled={busy}
                className={cn(
                  LABEL,
                  "flex h-7.5 cursor-pointer items-center gap-1.5 self-start border border-[rgba(122,74,12,.5)] bg-transparent px-2.5 tracking-[0.14em] text-[#5a3608] hover:border-[#5a3608] hover:bg-[#f8efd9]",
                )}
              >
                <span aria-hidden="true">+</span>
                <span>{busy ? "Extracting…" : "Extract as evidence"}</span>
              </button>
            )
          )}
          <Struck e={e} />
        </div>
      </div>
    );
  } else if (SPOKEN.has(e.type) || e.type === T.LEAVE_REQUEST || e.type === T.OBJECTION || e.type === T.RULING || e.type === T.SETTLEMENT) {
    // Settling in court: counsel asking for time, and the hearing of a filed compromise, where the
    // court, the State and the complainants each speak and the court rules.
    const settling = e.type === T.SETTLEMENT;
    const ruling = e.type === T.RULING || (settling && e.speaker_role === "judge");
    const settleTag = e.tag ?? (e.sustained == null ? null : e.sustained ? "Granted" : "Refused");
    const tag = settling
      ? settleTag
      : ruling
        ? e.sustained
          ? "Sustained"
          : "Overruled"
        : e.type === T.OBJECTION
          ? "Objection"
          : e.type === T.OPENING_STATEMENT
            ? "Opening"
            : e.type === T.CLOSING_STATEMENT
              ? "Closing"
              : e.type === T.LEAVE_REQUEST
                ? "Seeks leave"
                : null;
    const tagC = settling
      ? (({ Granted: "#3f6b3a", Refused: "#8e1f19", Adjourned: "#7a4a0c", Unsure: "#7a4a0c" } as Record<string, string>)[settleTag ?? ""] ??
        "#120d09")
      : ruling
        ? e.sustained
          ? "#3f6b3a"
          : "#8e1f19"
        : e.type === T.LEAVE_REQUEST
          ? "#7a4a0c"
          : mine
            ? "#8e1f19"
            : "#120d09";
    const ink = ruling ? "#7a4a0c" : mine ? "#8e1f19" : "#120d09";
    const leaveOpen = ctx.leaveOpen === e.id && !isTyping;
    body = (
      <div className="flex min-w-0 flex-col gap-1.5 border-l-[3px] pl-3.5" style={{ borderLeftColor: ink }}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className={LABEL} style={{ color: ink }}>
            {mine
              ? `You · ${SIDE[me]}`
              : settling
                ? e.speaker_role === "judge" && !e.speaker_name?.startsWith("The Court")
                  ? "The Court"
                  : e.speaker_name || "The Court"
                : ruling
                  ? "The Court"
                  : `${SIDE[ai]} · AI`}
          </span>
          {tag && (
            <span className={cn(LABEL, "border px-1.5 pt-0.5 pb-px tracking-[0.16em]")} style={{ borderColor: tagC, color: tagC }}>
              {tag}
            </span>
          )}
          {canObject && <ObjectButton onClick={() => ctx.onObject(e)} />}
        </div>
        <p className={cn("m-0 max-w-[76ch] leading-[1.7] text-pretty whitespace-pre-wrap text-ink", fs)} style={{ opacity: op }}>
          <span>{text}</span>
          {isTyping && <Caret />}
        </p>
        {leaveOpen && (
          <div
            role="group"
            aria-labelledby={`lv-${no}`}
            className="flex max-w-[76ch] flex-col gap-2.5 border-[1.5px] border-amber bg-[#f6e3b8] px-3.5 py-3"
          >
            <span id={`lv-${no}`} className={cn(LABEL, "text-amber")}>
              The court awaits your response
            </span>
            <span className="text-sm leading-normal text-pretty text-ink-label">The hearing is paused until you answer.</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={ctx.onNoObjection}
                className="h-10 cursor-pointer bg-ink px-4 text-[11.5px] font-bold tracking-[0.14em] text-paper uppercase hover:bg-ink-label"
              >
                No objection
              </button>
              <button
                type="button"
                onClick={() => ctx.onObject(e)}
                className="h-10 cursor-pointer border-[1.5px] border-seal bg-transparent px-4 text-[11.5px] font-bold tracking-[0.14em] text-seal uppercase hover:bg-seal hover:text-cream"
              >
                Object
              </button>
            </div>
          </div>
        )}
        {canReport && <ReportButton done={ctx.reported.has(e.id)} onClick={() => ctx.onReport(e, no)} />}
        {!isTyping && <ExhibitChips e={e} ctx={ctx} />}
        <Struck e={e} />
      </div>
    );
  } else {
    body = (
      <div className="flex min-w-0 items-center gap-3.5 py-0.5">
        <span className="flex-1 border-t border-ink/30" />
        <span className={cn(LABEL, "max-w-3/4 text-center text-balance text-ink-label")}>{sysText(e, ctx.names)}</span>
        <span className="flex-1 border-t border-ink/30" />
      </div>
    );
  }

  return (
    <div data-ev="" className={cn("grid", ctx.fresh(e.id) && "animate-[ac-enter_.38s_cubic-bezier(.2,.8,.2,1)_both]")} style={gutter(mob)}>
      <div className="flex flex-col items-end gap-0.5 pt-0.75">
        <span className="font-data text-[11.5px] font-medium text-ink-meta">{no}</span>
        {!mob && <span className="font-data text-[10.5px] font-medium text-ink-meta">{clock(e.timestamp)}</span>}
      </div>
      {body}
    </div>
  );
}

function gutter(mob: boolean): CSSProperties {
  return { gridTemplateColumns: `${mob ? 26 : 52}px minmax(0,1fr)`, columnGap: mob ? 10 : 18 };
}

function GroupEntry({ row, ctx, open, onToggle }: { row: Group; ctx: RecordCtx; open: boolean; onToggle: () => void }) {
  const first = row.items[0];
  const last = row.items[row.items.length - 1];
  const name = ctx.names[first.e.witness_id ?? ""] || first.e.speaker_name || "The witness";
  const by = THE[sideOf(first.e.speaker_role)];
  const qs = row.items.filter((x) => x.e.type === T.WITNESS_EXAMINED_Q).length;
  const sub = `${qs} ${qs === 1 ? "question" : "questions"} · called by ${by.replace("The ", "the ")} · ${clock(first.e.timestamp)}${row.done ? `–${clock(last.e.timestamp)}` : ""}`;
  return (
    <div
      data-ev=""
      className={cn("grid", ctx.fresh(first.e.id) && "animate-[ac-enter_.38s_cubic-bezier(.2,.8,.2,1)_both]")}
      style={gutter(ctx.mob)}
    >
      <div className="flex flex-col items-end gap-0.5 pt-3.5">
        <span className="font-data text-[11.5px] font-medium whitespace-nowrap text-ink-meta">
          {pad(first.i + 1)}
          {row.items.length > 1 && `–${pad(last.i + 1)}`}
        </span>
      </div>
      <div className={cn("flex min-w-0 flex-col border border-[rgba(154,91,18,.35)]", row.done ? "bg-[#f3e6c6]" : "bg-[#f6e3b8]")}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-0 bg-transparent px-3.5 py-3 text-left text-ink transition-colors hover:bg-[rgba(154,91,18,.08)]"
        >
          <span className="flex min-w-0 flex-col gap-1">
            <span className={cn(LABEL, "flex items-center gap-2 text-amber")}>
              {!row.done && <span aria-hidden="true" className="h-1.75 w-1.75 bg-[#b07a1a]" />}
              <span>{row.done ? "Witness examination" : "On the stand now"}</span>
            </span>
            <span className="font-display text-lg leading-[1.2]">{name}</span>
            <span className="text-[12.5px] leading-[1.4] text-[#5a3608]">{sub}</span>
          </span>
          <span className={cn(LABEL, "flex items-center gap-2 whitespace-nowrap text-[#5a3608]")}>
            <span>{open ? "Hide" : "Show"}</span>
            <span
              aria-hidden="true"
              className={cn(
                "inline-block text-[13px] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]",
                open && "rotate-180",
              )}
            >
              ▾
            </span>
          </span>
        </button>
        {open && (
          <div className="flex animate-[ac-enter_.36s_cubic-bezier(.2,.8,.2,1)_both] flex-col gap-4.5 border-t border-[rgba(154,91,18,.25)] bg-paper pt-3.5 pr-3.5 pb-4">
            {row.items.map(({ e, i }) => (
              <Entry key={e.id} e={e} i={i} ctx={ctx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Proceedings({
  rows,
  ctx,
  open,
  onToggle,
  thinking,
  scRef,
  count,
}: {
  rows: Row[];
  ctx: RecordCtx;
  /** witness group id → open (default: open while the witness is on the stand) */
  open: Record<string, boolean>;
  onToggle: (id: string, open: boolean) => void;
  /** who is preparing a reply, while the AI thinks */
  thinking: string | null;
  scRef: Ref<HTMLDivElement>;
  count: number;
}) {
  const mob = ctx.mob;
  return (
    <>
      <div
        className={cn(
          LABEL,
          "flex flex-none justify-between gap-3 border-b-[3px] border-double border-ink pt-3 pb-2.5 text-[11px] tracking-[0.2em] text-ink-label",
          mob ? "px-3.5" : "px-6.5",
        )}
      >
        <span className="truncate">Record of proceedings</span>
        <span className="whitespace-nowrap">{count} entries</span>
      </div>
      <Scroller
        ref={scRef}
        role="log"
        aria-live="polite"
        aria-label="Record of proceedings"
        tabIndex={0}
        className={cn("flex flex-1 flex-col gap-5.5", mob ? "px-3.5 pt-4 pb-5" : "px-7.5 pt-5.5 pb-6.5")}
      >
        {rows.map((r) => {
          if (r.kind === "entry") return <Entry key={r.e.id} e={r.e} i={r.i} ctx={ctx} />;
          const isOpen = open[r.id] ?? false; // collapsed until the reader opens it
          return <GroupEntry key={r.id} row={r} ctx={ctx} open={isOpen} onToggle={() => onToggle(r.id, !isOpen)} />;
        })}
        {thinking && (
          <div role="status" className="grid" style={gutter(mob)}>
            <span />
            <div className="flex flex-col gap-1.5 border-l-[3px] border-ink pl-3.5">
              <span className={cn(LABEL, "text-ink")}>{thinking} · AI</span>
              <span className="flex items-center gap-1.5 text-[14.5px] text-ink-meta italic">
                <span>Preparing a reply</span>
                <Caret />
              </span>
            </div>
          </div>
        )}
      </Scroller>
    </>
  );
}
