import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The document pages' building blocks, one class string per inline style in the handoff.

const TAG =
  "min-w-19 flex-none border-[1.5px] border-current px-1.75 pb-px pt-0.5 text-center text-[10.5px] font-bold uppercase tracking-[0.12em]";
const BTN = "flex h-11.5 items-center gap-2.5 border-[1.5px] border-ink px-4.5 text-xs font-bold uppercase tracking-[0.12em]";

export const K = {
  p: "m-0 text-base/[1.65] text-[#2a2018] text-pretty",
  note: "text-[15px]/[1.55] text-ink-label text-pretty",
  a: "border-b border-seal text-seal",
  stack: "flex flex-col",
  bullets: "m-0 flex list-none flex-col gap-2 p-0",
  bulletRow: "flex items-baseline gap-3 text-[15px]/[1.55] text-[#2a2018]",
  bullet: "flex-none font-data text-[15px] font-bold text-seal",
  defs: "m-0 flex list-none flex-col border-t border-ink/15 p-0",
  defRow: "grid grid-cols-1 gap-x-5 gap-y-1 border-b border-ink/15 py-3 min-[560px]:grid-cols-[190px_minmax(0,1fr)]",
  term: "text-[15px]/[1.45] font-bold text-ink",
  faq: "flex flex-col gap-1.5 border-t border-ink/15 py-3.5",
  faqQ: "m-0 text-base/[1.4] font-bold text-ink",
  faqA: "flex flex-col gap-2.5 text-[15px]/[1.6] text-ink-label text-pretty",
  tagNew: cn(TAG, "text-green"),
  tagFix: cn(TAG, "text-amber-deep"),
  tagRed: cn(TAG, "text-seal"),
  grid2: "grid grid-cols-1 gap-x-7 min-[560px]:grid-cols-2",
  grid3: "grid grid-cols-1 gap-2.5 min-[1000px]:grid-cols-3",
  feature: "flex flex-col gap-1.5 border-t border-ink/20 py-3.5",
  featureT: "text-base font-bold",
  card: "flex flex-col gap-2 border-[1.5px] border-ink/25 px-4.5 py-4",
  cardN: "font-display text-[26px] text-seal",
  cardT: "font-display text-[19px]/[1.25]",
  callout: "flex flex-col gap-2 bg-ink px-5 py-4.5 text-paper",
  calloutT: "font-display text-[17px]/[1.3] font-normal tracking-[0.04em] text-amber-hi",
  calloutD: "text-[15px]/[1.6] text-[#d8ccb4] text-pretty",
  makerRow: "flex flex-wrap items-start gap-x-6 gap-y-4.5",
  makerIni: "flex size-19 flex-none items-center justify-center rounded-full bg-ink font-display text-[28px] text-paper",
  makerBody: "flex min-w-0 flex-[1_1_280px] flex-col gap-2.5",
  makerName: "font-display text-[22px]/[1.2]",
  makerRole: "text-[11px] font-bold uppercase tracking-[0.16em] text-seal",
  makerLinks: "flex flex-wrap gap-2 pt-1",
  btnOutline: cn(BTN, "bg-transparent text-ink hover:bg-[#f8f3e7] hover:text-ink"),
  btnDark: cn(BTN, "bg-ink text-paper hover:bg-ink-label hover:text-white"),
};

/** A numbered section; the index and the scroll spy find it by `s-{id}` and data-sec. */
export function Sec({ id, n, title, children }: { id: string; n: string; title: string; children: ReactNode }) {
  return (
    <section id={`s-${id}`} data-sec="" className="flex flex-col gap-3.5">
      <h2 className="m-0 flex items-baseline gap-3 border-b border-ink/25 pb-2 font-normal">
        <span className="min-w-9.5 font-display text-[22px] text-seal">{n}</span>
        <span className="flex-1 font-display text-[22px]/[1.2]">{title}</span>
      </h2>
      {children}
    </section>
  );
}
