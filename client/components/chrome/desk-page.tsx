import type { ReactNode } from "react";
import Scroller from "@/components/court/scroller";
import { cn } from "@/lib/utils";
import SiteHeader from "./site-header";

/**
 * Viewport-high desk page: the warm top-right glow, the site header, then the page. The document
 * itself never scrolls. Pages that fill the height (My Cases) scroll their own lists; anything
 * taller than the viewport scrolls below the header.
 */
export default function DeskPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-dvh flex-col overflow-hidden bg-[radial-gradient(ellipse_80%_50%_at_80%_0%,var(--desk-glow)_0%,var(--desk-bg)_70%)] font-type text-desk-ink",
        className,
      )}
    >
      <SiteHeader />
      <Scroller tone="desk" className="flex flex-1 flex-col">
        {children}
      </Scroller>
    </div>
  );
}
