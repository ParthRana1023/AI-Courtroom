"use client";

// Shared pieces of the cause list (My Cases.dc.html) and the archive (Archived Cases.dc.html).

import type { ReactNode } from "react";
import CourtModelLoader from "@/components/court/court-model-loader";
import Scroller from "@/components/court/scroller";
import Select from "@/components/court/select";
import { cn } from "@/lib/utils";

export interface CaseRow {
  cnr: string;
  title: string;
  status: string;
  outcome?: "won" | "lost" | "partial" | null;
  user_role?: string | null;
  created_at: string;
  deleted_at?: string | null;
}

export type SortField = "cnr" | "title" | "user_role" | "status" | "created_at" | "deleted_at";
export interface SortState {
  field: SortField;
  dir: "asc" | "desc";
}

export const STATUSES = [
  ["active", "Active", "#2f6b3a"],
  ["not started", "Not started", "#4a3e30"],
  ["adjourned", "Adjourned", "#9a5b12"],
  ["resolved", "Resolved", "#120d09"],
] as const;

const OUTCOMES = { won: ["Won", "#2f6b3a"], lost: ["Lost", "#8e1f19"], partial: ["Partly won", "#9a5b12"] } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function sideLabel(role?: string | null) {
  return role === "plaintiff" ? "Plaintiff" : role === "defendant" ? "Defence" : "Not chosen";
}

function statusOf(status: string) {
  return STATUSES.find(([k]) => k === status) ?? ([status, status, "#4a3e30"] as const);
}

export function sortRows(rows: CaseRow[], sort: SortState) {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const A = String(a[sort.field] ?? "").toLowerCase();
    const B = String(b[sort.field] ?? "").toLowerCase();
    return A < B ? -dir : A > B ? dir : 0;
  });
}

/** Clicking a column sorts by it; clicking again flips the direction. Dates start newest first. */
export function nextSort(cur: SortState, field: SortField): SortState {
  if (cur.field === field) return { field, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { field, dir: field.endsWith("_at") ? "desc" : "asc" };
}

/** `wrap`: the actions drop under the title on phones (Archived) instead of sitting beside it. */
export function PageHead({
  kicker,
  title,
  wrap,
  children,
}: {
  kicker: string;
  title: string;
  wrap?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-x-6 gap-y-3", wrap ? "flex-wrap" : "flex-nowrap min-[560px]:flex-wrap")}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="whitespace-nowrap text-[10.5px] uppercase tracking-[0.16em] text-desk-red min-[560px]:text-label min-[560px]:tracking-[0.3em]">
          {kicker}
        </span>
        <h1 className="m-0 font-display text-[clamp(34px,11vw,54px)] font-normal leading-none min-[560px]:text-[clamp(56px,7vw,96px)]">
          {title}
        </h1>
      </div>
      {children}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="square"
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-desk-muted"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5 21 21" />
      </svg>
      <input
        type="search"
        aria-label="Search cases"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10.5 w-full rounded-none border border-desk-rule-mid bg-desk-ink/6 pl-10.5 pr-10 font-data text-[15px] text-desk-ink outline-none placeholder:text-desk-muted focus:border-desk-amber focus:bg-desk-ink/10 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-0 top-0 h-10.5 w-11 cursor-pointer font-data text-xl text-desk-muted hover:text-desk-hover"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function SortSelect({
  sort,
  onChange,
  options,
}: {
  sort: SortState;
  onChange: (s: SortState) => void;
  options: [string, string][];
}) {
  return (
    <Select
      aria-label="Sort cases"
      value={`${sort.field}:${sort.dir}`}
      onChange={(v) => {
        const [field, dir] = v.split(":");
        onChange({ field: field as SortField, dir: dir as "asc" | "desc" });
      }}
      options={options.map(([value, label]) => ({ value, label }))}
      className="h-9.5 flex-auto border border-desk-rule-mid bg-desk px-2.5 text-meta text-desk-ink"
    />
  );
}

export function SelectToggle({ selecting, onToggle, className }: { selecting: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selecting}
      onClick={onToggle}
      className={cn(
        "h-9.75 w-24.25 flex-none cursor-pointer whitespace-nowrap border border-desk-ink/40 px-3.5 text-meta",
        selecting ? "bg-paper text-ink" : "bg-transparent text-desk-soft",
        className,
      )}
    >
      {selecting ? "Cancel" : "Select"}
    </button>
  );
}

export function OfflineStrip({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="-mt-1 flex flex-wrap items-baseline gap-2.5 border border-[rgba(233,163,58,.5)] bg-[rgba(233,163,58,.08)] px-3.5 py-2.25 text-[13.5px] leading-[1.45] text-desk-amber"
    >
      <strong className="text-label font-bold uppercase tracking-[0.16em]">Offline</strong>
      <span>{children}</span>
    </div>
  );
}

export function BulkBar({
  count,
  actions,
  onDone,
}: {
  count: number;
  actions: { label: string; onClick: () => void; danger?: boolean }[];
  onDone: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-4 z-40 flex justify-center">
      <div
        role="toolbar"
        aria-label="Selected cases"
        className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 border border-paper/25 bg-ink py-2 pl-4.5 pr-2 text-sm text-paper shadow-menu"
      >
        <span className="whitespace-nowrap pr-2">{count} selected</span>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            disabled={!count}
            className={cn(
              "h-10.5 cursor-pointer px-4 text-xs font-bold uppercase tracking-[0.12em] disabled:cursor-not-allowed",
              a.danger
                ? "bg-seal text-cream disabled:bg-[#3a2b22]"
                : "border border-paper/35 bg-transparent text-paper disabled:text-[#6f6556]",
            )}
          >
            {a.label}
          </button>
        ))}
        <button type="button" onClick={onDone} className="h-10.5 cursor-pointer px-3 text-meta text-desk-muted hover:text-white">
          Done
        </button>
      </div>
    </div>
  );
}

const COLUMN_LABEL: Record<SortField, string> = {
  cnr: "Case no.",
  title: "Title",
  user_role: "Side",
  status: "Status",
  created_at: "Filed",
  deleted_at: "Archived",
};
const COLUMN_WIDTH: Record<SortField, string> = {
  cnr: "150px",
  title: "minmax(220px,1fr)",
  user_role: "84px",
  status: "130px",
  created_at: "108px",
  deleted_at: "108px",
};

function Tick({ on, mixed }: { on: boolean; mixed?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-5 w-5 items-center justify-center border-2 border-ink font-data text-meta font-bold text-paper",
        on || mixed ? "bg-ink" : "bg-transparent",
      )}
    >
      {on ? "✓" : mixed ? "–" : ""}
    </span>
  );
}

function StatusTag({ status, compact }: { status: string; compact?: boolean }) {
  const [, label, color] = statusOf(status);
  return (
    <span
      style={{ color, borderColor: color }}
      className={cn(
        "flex-none whitespace-nowrap border-[1.5px] font-bold uppercase",
        compact ? "px-1.75 pb-0.5 pt-0.75 text-[10.5px] tracking-[0.12em]" : "px-2 pb-0.5 pt-0.75 text-label tracking-[0.14em]",
      )}
    >
      {label}
    </span>
  );
}

function Outcome({ row }: { row: CaseRow }) {
  if (row.status !== "resolved" || !row.outcome) return null;
  const [label, color] = OUTCOMES[row.outcome];
  return (
    <span style={{ color }} className="font-bold">
      {label}
    </span>
  );
}

export function CaseList({
  rows,
  total,
  columns,
  table,
  loading,
  loadingStatus,
  sort,
  onSort,
  selecting,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  actions,
  empty,
  noMatch,
  error,
}: {
  rows: CaseRow[];
  total: number;
  columns: SortField[];
  table: boolean;
  loading: boolean;
  loadingStatus: string;
  sort: SortState;
  onSort: (field: SortField) => void;
  selecting: boolean;
  selected: Set<string>;
  onToggle: (cnr: string) => void;
  onToggleAll: () => void;
  onOpen: (cnr: string) => void;
  actions: (row: CaseRow) => ReactNode;
  empty: ReactNode;
  noMatch: ReactNode;
  error?: ReactNode;
}) {
  const grid = [selecting ? "22px" : "", ...columns.map((c) => COLUMN_WIDTH[c]), selecting ? "0px" : "88px"]
    .filter(Boolean)
    .join(" ");
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.cnr));
  const someOn = selected.size > 0;

  return (
    <section aria-label="Cases" className="flex min-h-0 flex-1 flex-col bg-paper text-ink shadow-sheet">
      {table && rows.length > 0 && !loading && (
        <div
          style={{ gridTemplateColumns: grid }}
          className="grid items-center gap-x-4.5 border-b-[3px] border-double border-ink px-5.5 text-label font-bold uppercase tracking-[0.16em] text-ink-label"
        >
          {selecting && (
            <button
              type="button"
              role="checkbox"
              aria-checked={allOn ? true : someOn ? "mixed" : false}
              aria-label="Select all"
              onClick={onToggleAll}
              className="-ml-2.75 flex h-10 w-11 cursor-pointer items-center justify-center"
            >
              <Tick on={allOn} mixed={someOn} />
            </button>
          )}
          {columns.map((c) => {
            const on = sort.field === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onSort(c)}
                aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                className={cn(
                  "flex h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap text-left uppercase tracking-[0.16em] hover:text-seal",
                  on ? "text-ink" : "text-ink-label",
                )}
              >
                <span>{COLUMN_LABEL[c]}</span>
                <span aria-hidden="true">{on ? (sort.dir === "asc" ? "↑" : "↓") : ""}</span>
              </button>
            );
          })}
          <span />
        </div>
      )}

      <Scroller className={cn("flex-1", loading && "overflow-hidden", selecting && "pb-20")}>
        {loading ? (
          <div className="flex h-full min-h-85 items-center justify-center px-3 py-6">
            <CourtModelLoader status={loadingStatus} tone="paper" />
          </div>
        ) : error ? (
          error
        ) : total === 0 ? (
          empty
        ) : rows.length === 0 ? (
          noMatch
        ) : (
          rows.map((row) => {
            const on = selected.has(row.cnr);
            const activate = () => (selecting ? onToggle(row.cnr) : onOpen(row.cnr));
            const [, statusLabel] = statusOf(row.status);
            return (
              <div
                key={row.cnr}
                role="link"
                tabIndex={0}
                aria-label={`${row.title}, ${statusLabel}, case ${row.cnr}`}
                onClick={activate}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    activate();
                  }
                }}
                style={table ? { gridTemplateColumns: grid } : undefined}
                className={cn(
                  "relative cursor-pointer items-center gap-x-4.5 gap-y-1.5 border-b border-ink/16 hover:bg-paper-hi",
                  table ? "grid px-5.5 py-2" : "flex pb-2.5 pl-4.5 pr-3 pt-2.75",
                  on && "bg-paper-hi",
                )}
              >
                {selecting && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`Select ${row.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(row.cnr);
                    }}
                    className="-ml-2.75 flex h-11 w-11 flex-none cursor-pointer items-center justify-center"
                  >
                    <Tick on={on} />
                  </button>
                )}
                {table ? (
                  columns.map((c) =>
                    c === "cnr" ? (
                      <span key={c} className="font-data text-meta font-medium tracking-[0.04em] text-ink-label">{row.cnr}</span>
                    ) : c === "title" ? (
                      <span key={c} className="min-w-0 text-pretty text-base font-bold leading-[1.35]">{row.title}</span>
                    ) : c === "user_role" ? (
                      <span key={c} className="text-sm text-ink-label">{sideLabel(row.user_role)}</span>
                    ) : c === "status" ? (
                      <span key={c} className="flex flex-col items-start gap-1 text-meta">
                        <StatusTag status={row.status} />
                        <Outcome row={row} />
                      </span>
                    ) : (
                      <span key={c} className="whitespace-nowrap text-sm text-ink-label">{formatDate(row[c])}</span>
                    ),
                  )
                ) : (
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between gap-2.5">
                      <span className="break-all font-data text-xs font-medium text-ink-label">{row.cnr}</span>
                      <StatusTag status={row.status} compact />
                    </div>
                    <span className="text-pretty text-base font-bold leading-[1.35]">{row.title}</span>
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-meta text-ink-label">
                      {columns.includes("user_role") && <span>{sideLabel(row.user_role)}</span>}
                      <span>Filed {formatDate(row.created_at)}</span>
                      {columns.includes("deleted_at") && <span>Archived {formatDate(row.deleted_at)}</span>}
                      <Outcome row={row} />
                    </span>
                  </div>
                )}
                {!selecting && (
                  <span className={cn("flex justify-end gap-0.5", table ? "self-center" : "self-start")}>
                    {actions(row)}
                  </span>
                )}
              </div>
            );
          })
        )}
      </Scroller>
    </section>
  );
}

/** 44px icon button used for the per-row actions. */
export function RowAction({
  label,
  title,
  onClick,
  hover,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  hover: "amber" | "red" | "green";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex h-11 w-11 cursor-pointer items-center justify-center text-ink-hint hover:bg-ink/6",
        hover === "amber" ? "hover:text-amber-deep" : hover === "green" ? "hover:text-green" : "hover:text-seal",
      )}
    >
      {children}
    </button>
  );
}

const icon = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "square" as const,
  "aria-hidden": true,
};

export const ArchiveIcon = () => (
  <svg {...icon}>
    <path d="M3 4h18v4H3z" />
    <path d="M4.5 8v12h15V8" />
    <path d="M9 12h6v3H9z" />
  </svg>
);

export const StrikeIcon = () => (
  <svg {...icon}>
    <path d="M5 3h10l4 4v14H5z" />
    <path d="M15 3v4h4" />
    <path d="M8 11h8M8 14.5h8M8 18h5" />
    <path d="M3.5 21.5 20.5 6.5" strokeWidth="2" />
  </svg>
);

export const RestoreIcon = () => (
  <svg {...icon}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4h4" />
  </svg>
);

/** Centred message inside the list (empty archive, no matches, load error). */
export function ListMessage({
  kicker,
  title,
  body,
  big,
  children,
}: {
  kicker?: string;
  title: string;
  body: string;
  big?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-full flex-col items-center justify-center text-center",
        big ? "gap-4 px-5.5 py-9 min-[560px]:px-12 min-[560px]:py-16" : "gap-3 px-5.5 py-12",
      )}
    >
      {kicker && <span className="text-label font-bold uppercase tracking-[0.2em] text-seal">{kicker}</span>}
      <span className={cn("font-display", big ? "text-[30px] leading-[1.1] min-[560px]:text-[40px]" : "text-2xl")}>{title}</span>
      <span className={cn("max-w-115 text-balance text-ink-muted", big ? "text-base leading-[1.55]" : "text-body")}>{body}</span>
      {children}
    </div>
  );
}
