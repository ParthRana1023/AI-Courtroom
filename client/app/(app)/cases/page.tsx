"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { toast } from "sonner";
import {
  ArchiveIcon,
  BulkBar,
  CaseList,
  ListMessage,
  nextSort,
  OfflineStrip,
  PageHead,
  RowAction,
  SearchBox,
  SelectToggle,
  SortSelect,
  sortRows,
  STATUSES,
  StrikeIcon,
  formatDate,
  type CaseRow,
  type SortState,
} from "@/components/cases/kit";
import { buttonClass } from "@/components/court/button";
import ConfirmDialog, { type ConfirmCopy } from "@/components/court/confirm-dialog";
import { useSettings } from "@/contexts/settings-context";
import { useOnline } from "@/hooks/use-online";
import { useViewport } from "@/hooks/use-viewport";
import { caseAPI } from "@/lib/api";
import { cn } from "@/lib/utils";

const OFFLINE_TOAST = "You’re offline. Try again when you’re back online.";
const UNDO_MS = 5000;

type Pending = { kind: "archive" | "delete"; cnrs: string[] };

export default function MyCasesPage() {
  const router = useRouter();
  const online = useOnline();
  const { w } = useViewport();
  const table = w >= 1000;
  const mob = w < 560;
  const { skipArchiveConfirmation, skipDeleteConfirmation } = useSettings();

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [archived, setArchived] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<string[]>([]);
  const [sort, setSort] = useState<SortState>({ field: "created_at", dir: "desc" });
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Pending | null>(null);
  // Deletes wait out the 5s undo window; they are sent at once if the page closes.
  const pendingDeletes = useRef(new Map<string, number>());

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [live, gone] = await Promise.all([caseAPI.listCases(), caseAPI.listDeletedCases().catch(() => [])]);
      setCases(live);
      setArchived(gone.length);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const pending = pendingDeletes.current;
    return () => {
      pending.forEach((timer, cnr) => {
        window.clearTimeout(timer);
        void caseAPI.permanentDeleteCase(cnr);
      });
    };
  }, [load]);

  const query = q.trim().toLowerCase();
  const rows = useMemo(
    () =>
      sortRows(
        cases.filter(
          (c) =>
            (!query || c.title.toLowerCase().includes(query) || c.cnr.toLowerCase().includes(query)) &&
            (!filters.length || filters.includes(c.status)),
        ),
        sort,
      ),
    [cases, query, filters, sort],
  );
  const filtered = !!(query || filters.length);
  const counts = (k?: string) => (k ? cases.filter((c) => c.status === k).length : cases.length);

  const toggleFilter = (k: string) => setFilters((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const clearAll = () => {
    setQ("");
    setFilters([]);
  };
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  // Escape leaves select mode when nothing else is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !confirm && selecting && stopSelecting();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, selecting]);

  const archive = async (cnrs: string[]) => {
    const removed = cases.filter((c) => cnrs.includes(c.cnr));
    setCases((cs) => cs.filter((c) => !cnrs.includes(c.cnr)));
    stopSelecting();
    try {
      await Promise.all(cnrs.map((cnr) => caseAPI.deleteCase(cnr)));
    } catch {
      setCases((cs) => [...cs, ...removed]);
      toast.error("Couldn’t archive. Please try again.");
      return;
    }
    setArchived((n) => n + removed.length);
    const one = removed.length === 1;
    toast(one ? `Case archived: ${removed[0].title}` : `${removed.length} cases archived`, {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: async () => {
          await Promise.all(cnrs.map((cnr) => caseAPI.restoreCase(cnr)));
          setCases((cs) => [...cs, ...removed]);
          setArchived((n) => n - removed.length);
          toast(one ? "Case restored" : `${removed.length} cases restored`, { duration: 2500 });
        },
      },
    });
  };

  const remove = (cnrs: string[]) => {
    const removed = cases.filter((c) => cnrs.includes(c.cnr));
    setCases((cs) => cs.filter((c) => !cnrs.includes(c.cnr)));
    stopSelecting();
    for (const cnr of cnrs) {
      pendingDeletes.current.set(
        cnr,
        window.setTimeout(() => {
          pendingDeletes.current.delete(cnr);
          void caseAPI.permanentDeleteCase(cnr).catch(() => toast.error("A case couldn’t be deleted. It’s back in your list."));
        }, UNDO_MS),
      );
    }
    const one = removed.length === 1;
    toast(one ? "Case will be permanently deleted" : `${removed.length} cases will be permanently deleted`, {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          for (const cnr of cnrs) {
            window.clearTimeout(pendingDeletes.current.get(cnr));
            pendingDeletes.current.delete(cnr);
          }
          setCases((cs) => [...cs, ...removed]);
          toast(one ? "Case restored" : `${removed.length} cases restored`, { duration: 2500 });
        },
      },
    });
  };

  const ask = (kind: Pending["kind"], cnrs: string[]) => {
    if (!online) {
      toast(OFFLINE_TOAST, { duration: 3000 });
      return;
    }
    const skip = kind === "archive" ? skipArchiveConfirmation : skipDeleteConfirmation;
    if (skip) void (kind === "archive" ? archive(cnrs) : remove(cnrs));
    else setConfirm({ kind, cnrs });
  };

  const n = confirm?.cnrs.length ?? 0;
  const firstTitle = cases.find((c) => c.cnr === confirm?.cnrs[0])?.title ?? "";
  const copy: ConfirmCopy | null = !confirm
    ? null
    : confirm.kind === "archive"
      ? {
          kicker: "Archive",
          count: n > 1 ? `${n} cases` : "",
          title: n > 1 ? `Archive ${n} cases?` : "Archive this case?",
          body: `${n > 1 ? "These cases" : `“${firstTitle}”`} will move to Archived Cases. You can restore ${n > 1 ? "them" : "it"} later or delete ${n > 1 ? "them" : "it"} there.`,
          cta: "Archive",
          tone: "ink",
        }
      : {
          kicker: "Delete",
          count: n > 1 ? `${n} cases` : "",
          title: n > 1 ? `Delete ${n} cases?` : "Delete this case?",
          warn: `This permanently deletes ${n > 1 ? "the cases" : "the case"} and all of ${n > 1 ? "their" : "its"} data.`,
          body: "You’ll have 5 seconds to undo after confirming.",
          cta: "Delete permanently",
          tone: "danger",
        };

  const chips = [{ k: "", t: "All", n: counts() }, ...STATUSES.map(([k, t]) => ({ k, t, n: counts(k) }))];
  const filterLabel = !filters.length
    ? "All cases"
    : filters.length === 1
      ? STATUSES.find(([k]) => k === filters[0])?.[1]
      : `Status (${filters.length})`;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-300 flex-1 flex-col gap-2.5 px-3 pb-2.5 pt-3 min-[560px]:gap-3.5 min-[560px]:px-[4vw] min-[560px]:pb-4.5 min-[560px]:pt-5">
      <PageHead kicker={`Cause list · ${formatDate(new Date().toISOString())}`} title="MY CASES">
        <div className="flex flex-col items-stretch gap-0.5 min-[560px]:flex-row min-[560px]:flex-wrap min-[560px]:items-center min-[560px]:gap-x-5 min-[560px]:gap-y-2.5">
          <Link
            href="/cases/archived"
            className="flex min-h-8.5 items-center gap-2 border-b border-desk-ink/30 text-xs uppercase tracking-[0.16em] text-desk-soft hover:text-desk-hover min-[560px]:min-h-11"
          >
            <ArchiveIcon />
            <span>Archived{archived ? ` (${archived})` : ""}</span>
          </Link>
          <Link href="/cases/new" className={buttonClass("seal", "md", "h-10 px-3.5 min-[560px]:h-11 min-[560px]:px-5.5")}>
            + New case
          </Link>
        </div>
      </PageHead>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder={mob ? "Search cases" : "Search by title or case number"}
          className={cn(mob ? "flex-[1_1_100%]" : "flex-[1_1_200px]", table ? "max-w-95" : "max-w-full")}
        />
        {!mob && (
          <div
            role="group"
            aria-label="Filter by status"
            className={cn("flex min-w-0 gap-1.5", table ? "order-0 ml-auto flex-[0_1_auto]" : "order-3 flex-[1_1_100%]")}
          >
            {chips.map((c) => {
              const on = c.k ? filters.includes(c.k) : !filters.length;
              return (
                <button
                  key={c.t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => (c.k ? toggleFilter(c.k) : setFilters([]))}
                  className={cn(
                    "flex h-9.5 min-w-0 cursor-pointer items-center justify-center whitespace-nowrap border text-meta leading-none",
                    table ? "flex-none px-3" : "flex-auto px-2.5",
                    on ? "border-paper bg-paper text-ink" : "border-desk-rule-mid bg-transparent text-desk-soft",
                  )}
                >
                  <span className="flex translate-y-px items-baseline gap-2">
                    <span>{c.t}</span>
                    <span className="font-data text-[11.5px] font-medium tabular-nums opacity-75">{c.n}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className={cn("flex min-w-0 items-center gap-2", table! && "ml-auto", mob ? "flex-[1_1_100%]" : "flex-none")}>
          {mob && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                className={cn(
                  "flex h-9.5 flex-none cursor-pointer items-center gap-2 whitespace-nowrap border px-2.5 text-meta",
                  filters.length ? "border-paper bg-paper text-ink" : "border-desk-ink/35 bg-transparent text-desk-ink",
                )}
              >
                <span>{filterLabel}</span>
                <span aria-hidden="true" className="text-[10.5px]">▾</span>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="start"
                  sideOffset={6}
                  aria-label="Filter by status"
                  className="z-36 flex min-w-57.5 flex-col bg-paper py-1.5 text-ink shadow-menu"
                >
                  {chips.map((c, i) => {
                    const on = c.k ? filters.includes(c.k) : !filters.length;
                    return (
                      <DropdownMenu.CheckboxItem
                        key={c.t}
                        checked={on}
                        onSelect={(e) => {
                          e.preventDefault();
                          if (c.k) toggleFilter(c.k);
                          else setFilters([]);
                        }}
                        className={cn(
                          "flex min-h-11.5 cursor-pointer items-center gap-3 px-4 text-body outline-none data-highlighted:bg-paper-hi",
                          i === 1 && "border-t border-ink/18",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex h-4.5 w-4.5 flex-none items-center justify-center border-2 border-ink font-data text-xs font-bold text-paper",
                            on ? "bg-ink" : "bg-transparent",
                          )}
                        >
                          {on ? "✓" : ""}
                        </span>
                        <span className="flex-1">{c.k ? c.t : "All cases"}</span>
                        <span className="font-data text-xs font-medium text-ink-hint">{c.n}</span>
                      </DropdownMenu.CheckboxItem>
                    );
                  })}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
          {!table && (
            <SortSelect
              sort={sort}
              onChange={setSort}
              options={[
                ["created_at:desc", "Newest first"],
                ["created_at:asc", "Oldest first"],
                ["title:asc", "Title A–Z"],
                ["status:asc", "Status"],
                ["cnr:asc", "Case number"],
              ]}
            />
          )}
          <SelectToggle selecting={selecting} onToggle={() => (selecting ? stopSelecting() : setSelecting(true))} />
        </div>
      </div>

      {filtered && (
        <div className="-mt-1 flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5 text-meta text-desk-muted">
          <span>
            Showing {rows.length} of {cases.length} cases
          </span>
          <button type="button" onClick={clearAll} className="cursor-pointer border-b border-desk-ink/40 py-1 text-meta text-desk-ink">
            Clear filters
          </button>
        </div>
      )}

      {!online && <OfflineStrip>Showing the list as it was last loaded. Archiving and deleting are paused.</OfflineStrip>}

      <CaseList
        rows={rows}
        total={cases.length}
        columns={["cnr", "title", "user_role", "status", "created_at"]}
        table={table}
        loading={loading}
        loadingStatus="Calling the cause list…"
        sort={sort}
        onSort={(f) => setSort((s) => nextSort(s, f))}
        selecting={selecting}
        selected={selected}
        onToggle={(cnr) =>
          setSelected((s) => {
            const next = new Set(s);
            if (next.has(cnr)) next.delete(cnr);
            else next.add(cnr);
            return next;
          })
        }
        onToggleAll={() =>
          setSelected((s) => (rows.length && rows.every((r) => s.has(r.cnr)) ? new Set() : new Set(rows.map((r) => r.cnr))))
        }
        onOpen={(cnr) => router.push(`/cases/${cnr}`)}
        actions={(row) => (
          <>
            <RowAction label={`Archive ${row.title}`} title="Archive" hover="amber" onClick={() => ask("archive", [row.cnr])}>
              <ArchiveIcon />
            </RowAction>
            <RowAction label={`Delete ${row.title}`} title="Strike off (delete)" hover="red" onClick={() => ask("delete", [row.cnr])}>
              <StrikeIcon />
            </RowAction>
          </>
        )}
        error={
          failed ? (
            <ListMessage title="Couldn’t load your cases." body="Check your connection and try again.">
              <button type="button" onClick={load} className={buttonClass("paper", "md", "px-4.5")}>
                Try again
              </button>
            </ListMessage>
          ) : undefined
        }
        empty={
          <ListMessage
            big
            kicker="No matters listed"
            title="Your cause list is empty."
            body="Generate a case, pick a side, and prepare your arguments before you go into court."
          >
            <Link href="/cases/new" className={buttonClass("seal", "lg", "h-13 px-6")}>
              Create your first case →
            </Link>
          </ListMessage>
        }
        noMatch={
          <ListMessage title="No cases match." body="Try another search or clear the filters.">
            <button type="button" onClick={clearAll} className={buttonClass("paper", "md", "h-11 px-4.5")}>
              Clear filters
            </button>
          </ListMessage>
        }
      />

      {selecting && (
        <BulkBar
          count={selected.size}
          onDone={stopSelecting}
          actions={[
            { label: "Archive", onClick: () => ask("archive", [...selected]) },
            { label: "Delete", danger: true, onClick: () => ask("delete", [...selected]) },
          ]}
        />
      )}

      <ConfirmDialog
        copy={copy}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          setConfirm(null);
          void (confirm.kind === "archive" ? archive(confirm.cnrs) : remove(confirm.cnrs));
        }}
      />
    </div>
  );
}
