"use client";

import { useEffect, useRef, useState } from "react";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";

// Fixed strip under the header: "You're offline", then "Back online" for 2.5s once reconnected.
export default function OfflineBanner() {
  const online = useOnline();
  const [back, setBack] = useState(false);
  const [top, setTop] = useState(0);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setBack(true);
    const t = window.setTimeout(() => setBack(false), 2500);
    return () => window.clearTimeout(t);
  }, [online]);

  // Sit just below whichever header the page has.
  useEffect(() => {
    if (online && !back) return;
    const header = document.querySelector("header");
    const measure = () =>
      setTop(header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [online, back]);

  if (online && !back) return null;
  const isBack = online && back;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[45] overflow-hidden pb-[30px]"
      style={{ top }}
    >
      <div role="status" aria-live="polite" className="flex justify-center [animation:ac-slide-down_.3s_ease_both]">
        <div
          className={cn(
            "pointer-events-auto flex w-full flex-wrap items-center justify-center gap-3 border-y px-[18px] py-[9px] text-center font-type text-[0.84375rem] leading-[1.4] shadow-[0_10px_30px_rgba(0,0,0,.45)]",
            isBack
              ? "border-green bg-[#1f4a28] text-[#e6f0e2]"
              : "border-amber-hi bg-ink text-paper",
          )}
        >
          <span
            aria-hidden="true"
            className={cn("h-2 w-2 flex-none", isBack ? "bg-[#9fd0a4]" : "bg-[#e9a33a]")}
          />
          <strong className="font-display text-sm font-normal tracking-[0.08em]">
            {isBack ? "BACK ONLINE." : "YOU’RE OFFLINE."}
          </strong>
          <span>
            {isBack
              ? "Everything is working again."
              : "Some actions are paused until your connection returns. Nothing you’ve typed will be lost."}
          </span>
        </div>
      </div>
    </div>
  );
}
