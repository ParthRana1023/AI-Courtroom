"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BulkBar,
  CaseList,
  ListMessage,
  nextSort,
  OfflineStrip,
  PageHead,
  RestoreIcon,
  RowAction,
  SearchBox,
  SelectToggle,
  SortSelect,
  sortRows,
  StrikeIcon,
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

type Pending = { kind: "restore" | "delete" | "empty"; cnrs: string[] };

export default function ArchivedCasesPage() {
  const router = useRouter();
  const online = useOnline();
  const { w } = useViewport();
  const table = w >= 1000;
  const { skipDeleteConfirmation } = useSettings();

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ field: "deleted_at", dir: "desc" });
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Pending | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setCases(await caseAPI.listDeletedCases());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const query = q.trim().toLowerCase();
  const rows = useMemo(
    () =>
      sortRows(
        cases.filter((c) => !query || c.title.toLowerCase().includes(query) || c.cnr.toLowerCase().includes(query)),
        sort,
      ),
    [cases, query, sort],
  );

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const drop = (cnrs: string[]) => {
    const removed = cases.filter((c) => cnrs.includes(c.cnr));
    setCases((cs) => cs.filter((c) => !cnrs.includes(c.cnr)));
    stopSelecting();
    return removed;
  };

  const restore = async (cnrs: string[]) => {
    const removed = drop(cnrs);
    try {
      await Promise.all(cnrs.map((cnr) => caseAPI.restoreCase(cnr)));
    } catch {
      setCases((cs) => [...cs, ...removed]);
      toast.error("Couldn’t restore. Please try again.");
      return;
    }
    const one = removed.length === 1;
    toast(one ? `Restored to My Cases: ${removed[0].title}` : `${removed.length} cases restored to My Cases`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: async () => {
          await Promise.all(cnrs.map((cnr) => caseAPI.deleteCase(cnr)));
          setCases((cs) => [...cs, ...removed]);
          toast(one ? "Case archived again" : `${removed.length} cases archived again`, { duration: 2500 });
        },
      },
    });
  };

  const destroy = async (pending: Pending) => {
    const removed = drop(pending.cnrs);
    try {
      if (pending.kind === "empty") await caseAPI.emptyArchive();
      else await Promise.all(pending.cnrs.map((cnr) => caseAPI.permanentDeleteCase(cnr)));
    } catch {
      setCases((cs) => [...cs, ...removed]);
      toast.error("Couldn’t delete. Please try again.");
      return;
    }
    toast(removed.length === 1 ? "Case permanently deleted" : `${removed.length} cases permanently deleted`, {
      duration: 3000,
    });
  };

  const ask = (kind: Pending["kind"], cnrs: string[]) => {
    if (!online) {
      toast(OFFLINE_TOAST, { duration: 3000 });
      return;
    }
    if (kind === "delete" && skipDeleteConfirmation) void destroy({ kind, cnrs });
    else setConfirm({ kind, cnrs });
  };

  const n = confirm?.cnrs.length ?? 0;
  const firstTitle = cases.find((c) => c.cnr === confirm?.cnrs[0])?.title ?? "";
  const copy: ConfirmCopy | null = !confirm
    ? null
    : confirm.kind === "restore"
      ? { kicker: "Restore", count: `${n} cases`, title: `Restore ${n} cases?`, body: "They’ll go back to My Cases.", cta: "Restore", tone: "green" }
      : confirm.kind === "delete"
        ? {
            kicker: "Delete permanently",
            count: n > 1 ? `${n} cases` : "",
            title: n > 1 ? `Delete ${n} cases?` : "Delete this case?",
            warn: "This can’t be undone.",
            body: `${n > 1 ? "These cases" : `“${firstTitle}”`} and all ${n > 1 ? "their" : "its"} data will be permanently deleted.`,
            cta: "Delete permanently",
            tone: "danger",
          }
        : {
            kicker: "Empty archive",
            count: `${n} ${n === 1 ? "case" : "cases"}`,
            title: "Empty the archive?",
            warn: "This can’t be undone.",
            body: `All ${n} archived ${n === 1 ? "case" : "cases"} and their data will be permanently deleted.`,
            cta: "Delete all",
            tone: "danger",
          };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-300 flex-1 flex-col gap-2.5 px-3 pb-2.5 pt-3 min-[560px]:gap-3.5 min-[560px]:px-[4vw] min-[560px]:pb-4.5 min-[560px]:pt-5">
      <PageHead kicker={`Archive · ${cases.length} ${cases.length === 1 ? "case" : "cases"}`} title="ARCHIVED" />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder={table ? "Search by title or case number" : "Search archive"}
          className={cn("flex-[1_1_200px]", table ? "max-w-95" : "max-w-full")}
        />
        {!table && (
          <div className="flex min-w-0 flex-[1_1_100%] min-[560px]:flex-none">
            <SortSelect
              sort={sort}
              onChange={setSort}
              options={[
                ["deleted_at:desc", "Recently archived"],
                ["deleted_at:asc", "Archived longest ago"],
                ["created_at:desc", "Newest first"],
                ["title:asc", "Title A–Z"],
              ]}
            />
          </div>
        )}
        <div className="ml-auto flex max-w-full flex-nowrap items-center gap-3.5">
          <Link
            href="/cases"
            className="mr-1.5 flex min-h-10 flex-none items-center gap-2 whitespace-nowrap border-b border-desk-ink/30 text-xs uppercase tracking-[0.16em] text-desk-soft hover:text-desk-hover min-[560px]:min-h-11"
          >
            <span aria-hidden="true">←</span>
            <span>My cases</span>
          </Link>
          <SelectToggle selecting={selecting} onToggle={() => (selecting ? stopSelecting() : setSelecting(true))} className="h-10 w-auto min-[560px]:h-11" />
          {cases.length > 0 && (
            <button
              type="button"
              onClick={() => ask("empty", cases.map((c) => c.cnr))}
              className="flex h-10 flex-none cursor-pointer items-center justify-center whitespace-nowrap border-[1.5px] border-seal-hover px-3.5 text-meta font-bold uppercase tracking-[0.14em] text-desk-ink hover:bg-seal hover:text-cream min-[560px]:h-11 min-[560px]:px-5.5"
            >
              Empty archive
            </button>
          )}
        </div>
      </div>

      {!online && <OfflineStrip>Showing the archive as it was last loaded. Restoring and deleting are paused.</OfflineStrip>}

      <CaseList
        rows={rows}
        total={cases.length}
        columns={["cnr", "title", "status", "created_at", "deleted_at"]}
        table={table}
        loading={loading}
        loadingStatus="Opening the archive…"
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
            <RowAction label={`Restore ${row.title}`} title="Restore to My Cases" hover="green" onClick={() => (online ? void restore([row.cnr]) : toast(OFFLINE_TOAST, { duration: 3000 }))}>
              <RestoreIcon />
            </RowAction>
            <RowAction label={`Delete ${row.title}`} title="Delete permanently" hover="red" onClick={() => ask("delete", [row.cnr])}>
              <StrikeIcon />
            </RowAction>
          </>
        )}
        error={
          failed ? (
            <ListMessage title="Couldn’t load the archive." body="Check your connection and try again.">
              <button type="button" onClick={load} className={buttonClass("paper", "md", "px-4.5")}>
                Try again
              </button>
            </ListMessage>
          ) : undefined
        }
        empty={
          <ListMessage
            big
            kicker="Nothing archived"
            title="The archive is empty."
            body="Cases you archive from My Cases are kept here until you restore or delete them."
          >
            <Link href="/cases" className={buttonClass("seal", "lg", "h-13 px-6")}>
              ← Back to my cases
            </Link>
          </ListMessage>
        }
        noMatch={
          <ListMessage title="No cases match." body="Try another title or case number.">
            <button type="button" onClick={() => setQ("")} className={buttonClass("paper", "md", "h-11 px-4.5")}>
              Clear search
            </button>
          </ListMessage>
        }
      />

      {selecting && (
        <BulkBar
          count={selected.size}
          onDone={stopSelecting}
          actions={[
            { label: "Restore", onClick: () => ask("restore", [...selected]) },
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
          void (confirm.kind === "restore" ? restore(confirm.cnrs) : destroy(confirm));
        }}
      />
    </div>
  );
}
