import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import SiteHeader from "./site-header";

/** Full-height desk page: the warm top-right glow, the site header, then the page. */
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
        "flex min-h-dvh flex-col bg-[radial-gradient(ellipse_80%_50%_at_80%_0%,var(--desk-glow)_0%,var(--desk-bg)_70%)] font-type text-desk-ink",
        className,
      )}
    >
      <SiteHeader />
      {children}
    </div>
  );
}
