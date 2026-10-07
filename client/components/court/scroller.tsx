"use client";

import { useEffect, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * A scroll area with the paper scrollbar. On paper (`tone="paper"`) it uses the dark thumb on a paper
 * inset; on the desk it uses the theme thumb. The bar styles live in globals.css; on touch screens
 * `TouchScrollbars` draws the same bar over it.
 */
export default function Scroller({
  tone = "paper",
  className,
  ...props
}: ComponentProps<"div"> & { tone?: "paper" | "desk" }) {
  return (
    <div
      data-scroller={tone === "paper" ? "" : undefined}
      className={cn("min-h-0 overflow-y-auto overscroll-contain", className)}
      {...props}
    />
  );
}

const DIALOG = "[role=dialog],[role=alertdialog],[aria-modal=true],dialog[open]";

type Bar = {
  el: HTMLElement;
  root: boolean;
  track: HTMLDivElement;
  thumb: HTMLDivElement;
  line: HTMLDivElement;
  drag: { y: number; top: number } | null;
  light: boolean | null;
  h?: number;
  th?: number;
};

/** Luminance of the first opaque background behind `el`, so the bar picks paper or desk colours. */
function lum(el: Element | null) {
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    const m = getComputedStyle(e).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    if (m && (m[4] === undefined || +m[4] > 0.5)) return (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
  }
  return 0.05;
}

/**
 * Touch screens draw overlay scrollbars that ignore CSS, so on coarse pointers the native bars are
 * hidden and the paper scrollbar is drawn over every scrollable element instead. Mounted once.
 */
export function TouchScrollbars() {
  useEffect(() => {
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    const html = document.documentElement;
    html.classList.add("ac-touch");

    const layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147482000";
    document.body.appendChild(layer);

    const bars = new Map<HTMLElement, Bar>();
    let raf = 0;
    let scanT: ReturnType<typeof setTimeout> | 0 = 0;

    const paint = (b: Bar, hot: boolean) => {
      if (b.light === null) b.light = lum(b.root ? document.body : b.el) > 0.5;
      b.thumb.style.backgroundColor = hot ? (b.light ? "#8e1f19" : "#e0453a") : b.light ? "#3e3326" : "#8a7f70";
      b.line.style.backgroundColor = b.light ? "rgba(18,13,9,.22)" : "rgba(239,230,211,.16)";
    };

    const make = (el: HTMLElement) => {
      const root = el === document.scrollingElement;
      const track = document.createElement("div");
      const line = document.createElement("div");
      const thumb = document.createElement("div");
      const hit = document.createElement("div");
      track.style.cssText = "position:fixed;width:12px;pointer-events:none;display:none";
      line.style.cssText = "position:absolute;left:5.5px;top:0;bottom:0;width:1px";
      thumb.style.cssText = "position:absolute;left:4px;width:4px;min-height:32px;transition:background-color .15s";
      hit.style.cssText = "position:absolute;left:-10px;right:-6px;top:-8px;bottom:-8px;pointer-events:auto;touch-action:none";
      track.appendChild(line);
      thumb.appendChild(hit);
      track.appendChild(thumb);
      layer.appendChild(track);
      const b: Bar = { el, root, track, thumb, line, drag: null, light: null };
      hit.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        hit.setPointerCapture(e.pointerId);
        b.drag = { y: e.clientY, top: root ? window.scrollY : el.scrollTop };
        paint(b, true);
      });
      hit.addEventListener("pointermove", (e) => {
        if (!b.drag) return;
        e.preventDefault();
        const sh = el.scrollHeight;
        const ch = root ? window.innerHeight : el.clientHeight;
        const room = Math.max(1, (b.h || ch) - (b.th || 32));
        const top = b.drag.top + ((e.clientY - b.drag.y) / room) * (sh - ch);
        if (root) window.scrollTo(0, top);
        else el.scrollTop = top;
      });
      const end = () => {
        b.drag = null;
        paint(b, false);
      };
      hit.addEventListener("pointerup", end);
      hit.addEventListener("pointercancel", end);
      bars.set(el, b);
    };

    const hide = (b: Bar) => {
      b.track.style.display = "none";
    };

    const place = (b: Bar) => {
      const { el, root } = b;
      const sh = el.scrollHeight;
      const ch = root ? window.innerHeight : el.clientHeight;
      if (!el.isConnected || sh <= ch + 2) return hide(b);
      const r = root
        ? { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight }
        : el.getBoundingClientRect();
      if (r.height < 60 || r.bottom <= 0 || r.top >= window.innerHeight) return hide(b);
      if (!root) {
        // Hidden scrollers get no bar; a bar is only suppressed by a dialog stacked over its scroller.
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || +cs.opacity < 0.05) return hide(b);
        const cx = Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2));
        const cy = Math.min(window.innerHeight - 1, Math.max(0, r.top + r.height / 2));
        for (const se of document.elementsFromPoint(cx, cy)) {
          if (se === el || el.contains(se)) break;
          if (layer.contains(se)) continue;
          const dialog = se.closest(DIALOG);
          if (dialog && !dialog.contains(el)) return hide(b);
        }
      }
      const pad = 3;
      const h = r.height - pad * 2;
      const th = Math.max(32, (h * ch) / sh);
      const st = root ? window.scrollY : el.scrollTop;
      const y = (h - th) * (st / Math.max(1, sh - ch));
      b.h = h;
      b.th = th;
      b.track.style.display = "block";
      b.track.style.top = `${r.top + pad}px`;
      b.track.style.height = `${h}px`;
      b.track.style.left = `${r.right - 12}px`;
      b.thumb.style.height = `${th}px`;
      b.thumb.style.transform = `translateY(${y}px)`;
      if (b.light === null) paint(b, false);
    };

    const frame = () => {
      raf = 0;
      bars.forEach(place);
    };
    const req = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const scan = () => {
      scanT = 0;
      const se = document.scrollingElement as HTMLElement | null;
      if (
        se &&
        !bars.has(se) &&
        getComputedStyle(document.body).overflowY !== "hidden" &&
        getComputedStyle(html).overflowY !== "hidden"
      )
        make(se);
      for (const el of document.body.getElementsByTagName("*")) {
        if (!(el instanceof HTMLElement) || bars.has(el) || layer.contains(el) || el.tagName === "SELECT") continue;
        const oy = getComputedStyle(el).overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 2) make(el);
      }
      bars.forEach((b, el) => {
        if (!el.isConnected) {
          b.track.remove();
          bars.delete(el);
        }
      });
      req();
    };
    const queue = () => {
      if (!scanT) scanT = setTimeout(scan, 250);
    };
    const repaint = () => {
      bars.forEach((b) => (b.light = null));
    };

    const observer = new MutationObserver((ms) => {
      if (ms.some((m) => !layer.contains(m.target))) queue();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "open", "hidden"],
    });
    // The theme flips `data-theme` on <html>, outside the body observer.
    const themeObserver = new MutationObserver(() => {
      repaint();
      setTimeout(req, 40);
    });
    themeObserver.observe(html, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const onResize = () => {
      repaint();
      queue();
    };
    window.addEventListener("scroll", req, true);
    window.addEventListener("resize", onResize);
    const tick = setInterval(req, 800);
    scan();

    return () => {
      observer.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("scroll", req, true);
      window.removeEventListener("resize", onResize);
      clearInterval(tick);
      if (scanT) clearTimeout(scanT);
      if (raf) cancelAnimationFrame(raf);
      layer.remove();
      html.classList.remove("ac-touch");
    };
  }, []);

  return null;
}
