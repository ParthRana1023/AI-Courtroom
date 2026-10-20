import { useCallback, useMemo, useRef } from "react";

/**
 * Keeps a scroll box on its newest content while the reader is at the end. Scrolling up to read
 * stops the following until they scroll back down to the end.
 *
 * `ref` goes on the scroll box; `follow()` scrolls to the end if the reader is following, and
 * `follow({ force: true })` always does (they just added something themselves).
 */
export function useFollowScroll() {
  const node = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);

  const ref = useCallback((c: HTMLDivElement | null) => {
    node.current = c;
    if (!c) return;
    following.current = true;
    c.scrollTop = c.scrollHeight;
    let last = c.scrollTop;
    const onScroll = () => {
      const gap = c.scrollHeight - c.scrollTop - c.clientHeight;
      // Moving up, and not because the content shrank under us: the reader is reading back.
      if (c.scrollTop < last - 1 && gap > 2) following.current = false;
      else if (gap < 32) following.current = true;
      last = c.scrollTop;
    };
    c.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      c.removeEventListener("scroll", onScroll);
      node.current = null;
    };
  }, []);

  const follow = useCallback(({ smooth = false, force = false } = {}) => {
    const c = node.current;
    if (!c) return;
    if (force) following.current = true;
    if (!following.current) return;
    if (smooth) c.scrollTo({ top: c.scrollHeight, behavior: "smooth" });
    else c.scrollTop = c.scrollHeight;
  }, []);

  return useMemo(() => ({ ref, follow }), [ref, follow]);
}
