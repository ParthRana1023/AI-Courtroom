import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A section index over a scrolling panel (Settings, the document pages). Sections are
 * `[data-sec]` elements with id `s-{id}`. `jump` scrolls to one with an eased glide
 * (stopped by the wheel or a touch); `onScroll` keeps `active` on the section in view.
 */
export function useSectionIndex(ids: string[]) {
  const scRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(ids[0]);
  const lock = useRef(0);
  const raf = useRef(0);

  const jump = useCallback((id: string) => {
    const sc = scRef.current;
    const el = sc?.querySelector<HTMLElement>(`#s-${id}`);
    setActive(id);
    if (!sc || !el) return;
    const from = sc.scrollTop;
    const to = Math.max(0, Math.min(el.offsetTop - 14, sc.scrollHeight - sc.clientHeight));
    const dist = to - from;
    cancelAnimationFrame(raf.current);
    lock.current = Date.now() + 2000;
    const done = () => {
      lock.current = Date.now();
      sc.removeEventListener("wheel", cancel);
      sc.removeEventListener("touchstart", cancel);
    };
    const cancel = () => {
      cancelAnimationFrame(raf.current);
      done();
    };
    if (Math.abs(dist) < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sc.scrollTop = to;
      return done();
    }
    sc.addEventListener("wheel", cancel, { passive: true });
    sc.addEventListener("touchstart", cancel, { passive: true });
    const dur = Math.min(950, 420 + Math.abs(dist) * 0.22);
    const t0 = performance.now();
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      sc.scrollTop = from + dist * ease(p);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else done();
    };
    raf.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onScroll = () => {
    if (Date.now() - lock.current < 700) return;
    const sc = scRef.current;
    if (!sc || !ids.length) return;
    let cur = ids[0];
    sc.querySelectorAll<HTMLElement>("[data-sec]").forEach((el) => {
      if (el.offsetTop - 60 <= sc.scrollTop) cur = el.id.slice(2);
    });
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) cur = ids[ids.length - 1];
    if (cur !== active) setActive(cur);
  };

  return { scRef, active, jump, onScroll };
}
