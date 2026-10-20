"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { plain } from "@/lib/case-file";
import { cn } from "@/lib/utils";
import type { EvidenceItem, PersonInvolved } from "@/types";
import { initials } from "./people";

const STATUS = {
  generated: ["Image ready", "#3f6b3a"],
  pending: ["Image pending", "#b07a1a"],
  failed: ["Image failed", "#8e1f19"],
  not_requested: ["No image", "#8a7f70"],
} as const;

const reduce = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const statusText = (e: EvidenceItem) => STATUS[e.media_status]?.[0] ?? "No image";

function added(e: EvidenceItem) {
  if (!e.origin_id) return "With the case file";
  if (e.private) return "Saved by you from an interview. Privileged: only you can see it until you cite it in court";
  return e.origin_id.includes(":") ? "Extracted by you in Case Prep" : "Extracted from the courtroom record";
}

/** Parties whose surname appears in the exhibit. */
function mentioned(e: EvidenceItem, parties: PersonInvolved[]) {
  const hay = `${e.title} ${e.source ?? ""} ${e.description}`;
  return parties.filter((p) => {
    const sur = plain(p.name).split(" ").pop();
    return !!sur && sur.length > 2 && hay.includes(sur);
  });
}

const plateBg = (e: EvidenceItem, big?: boolean) => {
  if (e.media_status === "failed") return "#f3e2c4";
  if (e.media_status === "pending") return "#e9dfca";
  const s = big ? 14 : 12;
  return `repeating-linear-gradient(135deg,#e3d8c0 0 ${s}px,#ddd1b7 ${s}px ${s * 2}px)`;
};

/** The image area of a card or the viewer: the picture, or what's happening to it. */
function Plate({ e, big, regen, onRegen }: { e: EvidenceItem; big?: boolean; regen: string | null; onRegen: (id: string) => void }) {
  const busy = regen === e.id;
  return (
    <>
      {e.media_status === "generated" && e.image_url ? (
        <Image
          src={e.image_url}
          alt={`${e.exhibit_ref}: ${e.title}`}
          fill
          unoptimized
          sizes={big ? "(min-width: 820px) 440px, 100vw" : "(min-width: 560px) 320px, 100vw"}
          className="object-cover"
        />
      ) : e.media_status === "pending" ? (
        <span role="status" className={cn("text-ink-label", big ? "text-sm" : "text-[13.5px]")}>
          Preparing exhibit image…
        </span>
      ) : e.media_status === "failed" ? (
        <>
          <span className={cn("font-bold text-[#7a3a06]", big ? "text-sm" : "text-[13px]")}>Image generation failed</span>
          <button
            type="button"
            disabled={busy}
            onClick={(ev) => {
              ev.stopPropagation();
              onRegen(e.id);
            }}
            className={cn(
              "cursor-pointer border-[1.5px] border-[#7a3a06] bg-paper text-[11px] font-bold tracking-[0.14em] text-[#7a3a06] uppercase hover:bg-[#f8f3e7] disabled:cursor-wait",
              big ? "h-10 px-4" : "h-9 px-3.5",
            )}
          >
            {busy ? "Regenerating…" : "↻ Regenerate"}
          </button>
        </>
      ) : (
        <span className={cn("font-data font-medium tracking-[0.12em] text-ink-meta uppercase", big ? "text-xs" : "text-[11px]")}>
          Exhibit image
        </span>
      )}
      <span
        className={cn(
          "absolute flex-none border-[1.5px] border-seal bg-paper font-data font-bold whitespace-nowrap text-seal",
          big ? "top-3.5 left-3.5 px-2.25 pt-1 pb-0.75 text-sm" : "top-2.5 left-2.5 px-1.75 pt-0.75 pb-0.5 text-xs",
        )}
      >
        {e.exhibit_ref}
      </span>
    </>
  );
}

export function ExhibitGrid({
  evidence,
  small,
  mob,
  regen,
  onRegen,
  onOpen,
  focusId,
  title = "Exhibits",
  note = "You may extract more evidence from witness examination in the courtroom.",
  empty = "No exhibits yet. Exhibits come with the case file and from witness examination in the courtroom.",
}: {
  evidence: EvidenceItem[];
  title?: string;
  note?: string;
  empty?: string;
  small: boolean;
  mob: boolean;
  regen: string | null;
  onRegen: (id: string) => void;
  onOpen: (id: string) => void;
  focusId?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const arrivalFocus = useRef(focusId);

  // Cards rise in when the tab opens; an exhibit opened from elsewhere is scrolled to and ringed.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const r = reduce();
    root.querySelectorAll<HTMLElement>("[data-card]").forEach((c, i) =>
      c.animate?.(
        r
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: "translateY(16px)" },
              { opacity: 1, transform: "none" },
            ],
        {
          duration: 420,
          delay: Math.min(i, 8) * 55,
          easing: "cubic-bezier(.2,.8,.2,1)",
          fill: "backwards",
        },
      ),
    );
    const c = arrivalFocus.current && root.querySelector<HTMLElement>(`[data-card="${arrivalFocus.current}"]`);
    if (c) {
      root.scrollTop = Math.max(0, c.offsetTop - 70);
      c.animate?.(
        [{ boxShadow: "0 0 0 3px #8e1f19" }, { boxShadow: "0 0 0 3px #8e1f19", offset: 0.6 }, { boxShadow: "0 0 0 0 rgba(142,31,25,0)" }],
        { duration: 1600, delay: 300 },
      );
    }
  }, []);

  return (
    <div
      ref={ref}
      data-scroller=""
      className={cn(
        "relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain bg-paper text-ink shadow-sheet",
        mob ? "px-3.5 pt-3.5 pb-4.5" : "px-6.5 pt-5 pb-6.5",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2.5 border-b-[3px] border-double border-ink pb-2.5">
        <span className="text-label font-bold tracking-[0.2em] text-ink-label uppercase">
          {title} · {evidence.length}
        </span>
        <span className="text-[13px] text-ink-muted">{note}</span>
      </div>
      {evidence.length === 0 ? (
        <p className="m-0 py-6 text-body text-ink-hint italic">{empty}</p>
      ) : (
        <div className={cn("grid gap-3.5", small ? "grid-cols-[minmax(0,1fr)]" : "grid-cols-[repeat(auto-fill,minmax(270px,1fr))]")}>
          {evidence.map((e) => (
            <article
              key={e.id}
              data-card={e.id}
              role="button"
              tabIndex={0}
              aria-label={`Open ${e.exhibit_ref}, ${e.title}`}
              onClick={() => onOpen(e.id)}
              onKeyDown={(ev: KeyboardEvent) => {
                if (ev.target !== ev.currentTarget) return;
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  onOpen(e.id);
                }
              }}
              className="flex min-w-0 cursor-pointer flex-col border border-ink/20 bg-[#f8f3e7] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.75 hover:border-ink/45 hover:shadow-[0_14px_30px_-14px_rgba(18,13,9,.45)]"
            >
              <div
                className="relative flex h-37.5 flex-col items-center justify-center gap-2.5 overflow-hidden border-b border-ink/15 p-4 text-center"
                style={{ background: plateBg(e) }}
              >
                <Plate e={e} regen={regen} onRegen={onRegen} />
              </div>
              <div className="flex flex-col gap-1.75 px-4 pt-3.5 pb-4">
                <span className="text-[10px] font-bold tracking-[0.18em] text-ink-meta uppercase">
                  {e.evidence_type} · {statusText(e)}
                </span>
                <h3 className="m-0 font-display text-lg leading-tight font-normal text-balance">{e.title}</h3>
                {e.source && <span className="text-[12.5px] leading-[1.4] text-ink-muted">Source: {e.source}</span>}
                <p className="m-0 mt-0.5 text-[14.5px] leading-[1.6] text-pretty text-[#2a2018]">{e.description}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExhibitViewer({
  evidence: all,
  openId,
  onOpen,
  onClose,
  parties,
  mine,
  onParty,
  regen,
  onRegen,
  w,
}: {
  evidence: EvidenceItem[];
  openId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  parties: PersonInvolved[];
  mine: (p: PersonInvolved) => boolean;
  onParty: (id: string) => void;
  regen: string | null;
  onRegen: (id: string) => void;
  w: number;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const dir = useRef(1);
  const shown = useRef<string | null>(null);
  // Exhibits and privileged notes are paged through separately.
  const opened = all.find((x) => x.id === openId);
  const evidence = all.filter((x) => !!x.private === !!opened?.private);
  const i = evidence.findIndex((e) => e.id === openId);
  const e = i >= 0 ? evidence[i] : null;
  const wide = w >= 820;
  const small = w < 560;

  const step = (d: number) => {
    if (i < 0) return;
    dir.current = d;
    onOpen(evidence[(i + d + evidence.length) % evidence.length].id);
  };

  // Stepping slides the next exhibit in from the side it came from.
  useEffect(() => {
    const b = bodyRef.current;
    if (b && openId && shown.current && shown.current !== openId) {
      b.scrollTop = 0;
      b.animate?.(
        reduce()
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: `translateX(${dir.current * 30}px)` },
              { opacity: 1, transform: "none" },
            ],
        {
          duration: 340,
          easing: "cubic-bezier(.2,.8,.2,1)",
        },
      );
    }
    shown.current = openId;
  }, [openId]);

  const people = e ? mentioned(e, parties) : [];
  const rows = e
    ? [
        ["Exhibit", e.exhibit_ref],
        ["Type", e.evidence_type],
        ["Source", e.source || "—"],
        ["Added", added(e)],
      ]
    : [];

  return (
    <Dialog.Root open={!!e} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-62 animate-[ac-fade_.24s_ease_both] bg-(--scrim)" />
        {e && (
          <Dialog.Content
            aria-describedby={undefined}
            onOpenAutoFocus={(ev) => {
              ev.preventDefault();
              (ev.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-close]")?.focus({ preventScroll: true });
            }}
            onKeyDown={(ev) => {
              if (ev.key === "ArrowRight") step(1);
              else if (ev.key === "ArrowLeft") step(-1);
            }}
            className={cn(
              "fixed inset-0 z-63 m-auto flex h-fit w-full max-w-220 animate-[ac-rise_.42s_cubic-bezier(.2,.8,.2,1)_both] flex-col bg-paper text-ink shadow-dialog outline-none",
              small ? "max-h-dvh" : "max-h-[calc(100dvh-48px)] w-[calc(100%-48px)]",
            )}
          >
            <div className="flex flex-none items-center justify-between gap-3 border-b-[3px] border-double border-ink pt-3 pr-3.5 pb-2.5 pl-5">
              <span className="text-[10.5px] font-bold tracking-[0.18em] text-ink-label uppercase">
                {e.private ? "Privileged note" : "Exhibit"} {i + 1} of {evidence.length}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous exhibit"
                  className="h-10 w-10 cursor-pointer border-[1.5px] border-ink bg-transparent text-base leading-none text-ink hover:bg-ink hover:text-paper"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next exhibit"
                  className="h-10 w-10 cursor-pointer border-[1.5px] border-ink bg-transparent text-base leading-none text-ink hover:bg-ink hover:text-paper"
                >
                  →
                </button>
                <Dialog.Close
                  data-close=""
                  aria-label="Close"
                  className="h-10 w-10 cursor-pointer bg-ink text-[22px] leading-none text-paper hover:bg-seal"
                >
                  ×
                </Dialog.Close>
              </div>
            </div>
            <div
              ref={bodyRef}
              tabIndex={0}
              data-scroller=""
              className={cn(
                "grid min-h-0 flex-1 items-start overflow-y-auto overscroll-contain",
                wide ? "grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" : "grid-cols-[minmax(0,1fr)]",
              )}
            >
              <div
                className={cn(
                  "relative flex flex-col items-center justify-center gap-3 self-stretch overflow-hidden p-6 text-center",
                  wide ? "min-h-105 border-r border-ink/15" : "min-h-55 border-b border-ink/15",
                )}
                style={{ background: plateBg(e, true) }}
              >
                <Plate e={e} big regen={regen} onRegen={onRegen} />
              </div>
              <div className={cn("flex min-w-0 flex-col gap-4", small ? "px-4 pt-4.5 pb-6" : "px-7 pt-6 pb-7")}>
                <div className="flex flex-col gap-2">
                  <span className="flex items-center gap-2 text-[10.5px] font-bold tracking-[0.18em] text-ink-meta uppercase">
                    <span aria-hidden="true" className="h-1.75 w-1.75" style={{ background: STATUS[e.media_status]?.[1] ?? "#8a7f70" }} />
                    <span>
                      {e.evidence_type} · {statusText(e)}
                    </span>
                  </span>
                  <Dialog.Title
                    className={cn("m-0 font-display leading-[1.15] font-normal text-balance", small ? "text-2xl" : "text-[30px]")}
                  >
                    {e.title}
                  </Dialog.Title>
                </div>
                <p className="m-0 text-base leading-[1.7] text-pretty whitespace-pre-wrap text-[#2a2018]">{e.description}</p>
                <dl className="m-0 flex flex-col border-t border-ink/20">
                  {rows.map(([k, v]) => (
                    <div
                      key={k}
                      className={cn(
                        "grid gap-x-4 gap-y-0.5 border-b border-ink/20 py-2.5",
                        small ? "grid-cols-[minmax(0,1fr)]" : "grid-cols-[96px_minmax(0,1fr)]",
                      )}
                    >
                      <dt className="pt-0.5 text-[10.5px] font-bold tracking-[0.18em] text-ink-meta uppercase">{k}</dt>
                      <dd className="m-0 text-[14.5px] leading-normal text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                {people.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10.5px] font-bold tracking-[0.18em] text-ink-meta uppercase">Parties mentioned</span>
                    <div className="flex flex-wrap gap-1.5">
                      {people.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onParty(p.id)}
                          className="flex h-9 cursor-pointer items-center gap-2 border border-ink/30 bg-[#f8f3e7] pr-3 pl-1 text-[13.5px] text-ink hover:border-ink"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex h-7 w-7 items-center justify-center font-display text-xs",
                              mine(p) ? "bg-ink text-cream" : "border-[1.5px] border-ink-muted bg-transparent text-ink-muted",
                            )}
                          >
                            {initials(p.name)}
                          </span>
                          <span>{plain(p.name)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Dialog.Content>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
