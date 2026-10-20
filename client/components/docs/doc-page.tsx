"use client";

import { useRef, type ReactNode } from "react";
import DocFooter from "@/components/chrome/doc-footer";
import SiteHeader from "@/components/chrome/site-header";
import { useSectionIndex } from "@/hooks/use-section-index";
import { useViewport } from "@/hooks/use-viewport";
import { cn, roman } from "@/lib/utils";
import { K } from "./kit";


/**
 * An indexed paper document (About, Privacy, Terms, Cookies, Help, Changelog,
 * Accessibility): a sticky numbered index on the left that follows the scroll, or a
 * "Jump to section" select on narrow screens, and the paper sheet with its footer.
 */
export default function DocPage({
  current,
  kicker,
  title,
  lede,
  updated,
  form,
  label,
  index,
  children,
}: {
  current: string;
  kicker: string;
  title: string;
  lede: string;
  updated?: string;
  form: [string, string];
  label: string;
  index: [string, string][];
  children: ReactNode;
}) {
  const { w } = useViewport();
  const wide = w >= 860;
  const mob = w < 560;
  // The index column is 280px and a word can't wrap, so long ones (ACCESSIBILITY) shrink to fit.
  const longest = Math.max(...title.split(/\s+/).map((word) => word.length));
  const titleSize = `min(clamp(32px, 3.6vw, 48px), ${(280 / (longest * 0.6)).toFixed(1)}px)`;
  const { scRef, active, jump, onScroll } = useSectionIndex(index.map(([id]) => id));
  const navRef = useRef<HTMLElement>(null);

  // The index scrolls along with the document, so the current entry stays in view.
  const follow = () => {
    const sc = scRef.current;
    const nv = navRef.current;
    if (sc && nv) {
      const max = sc.scrollHeight - sc.clientHeight;
      nv.scrollTop = max > 0 ? (sc.scrollTop / max) * (nv.scrollHeight - nv.clientHeight) : 0;
    }
    onScroll();
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[radial-gradient(ellipse_80%_50%_at_80%_0%,var(--desk-glow)_0%,var(--desk-bg)_70%)] font-type leading-[normal] text-desk-ink">
      <SiteHeader />
      <main className={cn("mx-auto flex min-h-0 w-full max-w-300 flex-1 flex-col", mob ? "gap-2.5 px-3 pb-2.5 pt-3" : "gap-3.5 px-[4vw] pb-4.5 pt-5")}>
        {!wide && (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1.5">
              <span className="whitespace-nowrap text-[10.5px] uppercase tracking-[0.16em] text-desk-red">{kicker}</span>
              <h1 className="m-0 font-display text-[clamp(28px,8.5vw,40px)]/none font-normal">{title}</h1>
            </div>
            <select
              aria-label="Jump to section"
              value={active}
              onChange={(e) => jump(e.target.value)}
              className="h-10 cursor-pointer rounded-none border border-[rgba(239,230,211,.22)] bg-ink px-2.5 text-[13px] text-paper"
            >
              {index.map(([id, t], i) => (
                <option key={id} value={id}>
                  {roman(i + 1)}. {t}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={cn("grid min-h-0 flex-1", wide ? "grid-cols-[280px_minmax(0,1fr)] gap-10" : "grid-cols-1")}>
          {wide && (
            <div className="flex min-h-0 flex-col gap-5 overflow-hidden">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] uppercase tracking-[0.3em] text-desk-red">{kicker}</span>
                <h1 className="m-0 font-display font-normal leading-[1.02] text-balance" style={{ fontSize: titleSize }}>
                  {title}
                </h1>
              </div>
              <p className="m-0 text-[15px]/[1.55] text-desk-soft text-pretty">{lede}</p>
              {updated && <span className="font-data text-xs font-medium text-desk-muted">Last updated: {updated}</span>}
              <nav
                ref={navRef}
                aria-label="Contents"
                className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain border-t border-[rgba(239,230,211,.16)] pb-6 mask-[linear-gradient(#000_calc(100%-32px),transparent)] scrollbar-none light:border-[rgba(18,13,9,.24)] [&::-webkit-scrollbar]:hidden"
              >
                {index.map(([id, t], i) => {
                  const cur = active === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => jump(id)}
                      aria-current={cur}
                      className={cn(
                        "grid flex-none cursor-pointer grid-cols-[36px_1fr] items-baseline gap-1.5 border-0 border-b border-desk-rule bg-transparent py-2.25 text-left hover:text-desk-hover",
                        cur ? "text-desk-strong" : "text-desk-muted",
                      )}
                    >
                      <span className="font-display text-[15px] text-desk-amber">{roman(i + 1)}</span>
                      <span className="text-sm/[1.35]">{t}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          )}
          <article aria-label={label} className="flex min-h-0 flex-col bg-paper text-ink shadow-sheet">
            <div className={cn("flex justify-between gap-3 border-b-[3px] border-double border-ink pb-2.5 pt-3.5 text-[11px] font-bold uppercase tracking-[0.2em] text-ink-label", mob ? "px-4" : "px-8")}>
              <span className="whitespace-nowrap">{form[0]}</span>
              <span className="min-w-0 truncate">{form[1]}</span>
            </div>
            <div
              ref={scRef}
              data-scroller=""
              onScroll={follow}
              className={cn("relative flex min-h-0 flex-1 flex-col gap-9 overflow-y-auto overscroll-contain", mob ? "px-4 pb-5.5 pt-4.5" : "px-10 pb-7.5 pt-6.5")}
            >
              {!wide && (
                <div className="flex flex-col gap-2">
                  <p className={K.p}>{lede}</p>
                  {updated && <span className="font-data text-xs font-medium text-ink-hint">Last updated: {updated}</span>}
                </div>
              )}
              {children}
              <DocFooter current={current} />
            </div>
          </article>
        </div>
      </main>
    </div>
  );
}
