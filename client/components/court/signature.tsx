"use client";

import { useEffect, useRef } from "react";
import { SIG_SPACING, type SigFont } from "@/lib/signature";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  font: SigFont;
  color?: string;
  stroke?: number;
  spacing?: number;
  /** Drawing time in ms. */
  duration?: number;
  delay?: number;
  /** Already signed: drawn at once. Reduced motion always draws at once. */
  instant?: boolean;
  align?: "left" | "right";
  className?: string;
};

/** `name` handwritten on one line, scaled to fit the box and sitting on its bottom edge. */
export default function Signature({
  name,
  font,
  color = "#1f2a44",
  stroke = 1.6,
  spacing,
  duration = 1900,
  delay = 0,
  instant = false,
  align = "left",
  className,
}: Props) {
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const now = instant || matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Vara draws into an element it finds by selector, at a fixed size until it is measured.
    const inner = document.createElement("span");
    inner.id = `sig-${Math.random().toString(36).slice(2, 9)}`;
    inner.setAttribute("aria-hidden", "true");
    inner.style.cssText = "position:absolute;left:0;bottom:0;display:block;width:900px;height:120px;visibility:hidden";
    el.appendChild(inner);

    void import("vara").then(({ default: Vara }) => {
      if (!live) return;
      const v = new Vara(`#${inner.id}`, `/vara/fonts/${font}`, [
        {
          id: "n",
          text: name,
          fontSize: 40,
          strokeWidth: stroke,
          color,
          duration: now ? 1 : duration,
          textAlign: "left",
          autoAnimation: false,
          letterSpacing: spacing ?? SIG_SPACING[font],
        },
      ]);
      v.ready(() => {
        const svg = inner.querySelector("svg");
        if (!live || !svg) return;
        try {
          const b = svg.getBBox();
          svg.setAttribute("viewBox", `${b.x - 3} ${b.y - 3} ${b.width + 6} ${b.height + 6}`);
        } catch {
          // getBBox throws while the svg isn't rendered; keep Vara's own box.
        }
        svg.setAttribute("preserveAspectRatio", align === "right" ? "xMaxYMax meet" : "xMinYMax meet");
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.style.width = svg.style.height = "100%";
        inner.style.width = inner.style.height = "100%";
        inner.style.visibility = "visible";
        timer = setTimeout(() => v.draw("n"), now ? 0 : delay);
      });
    });

    return () => {
      live = false;
      clearTimeout(timer);
      inner.remove();
    };
  }, [name, font, color, stroke, spacing, duration, delay, instant, align]);

  return <span ref={host} role="img" aria-label={`Signed: ${name}`} className={cn("relative block overflow-hidden", className)} />;
}
