import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

// A string snapshot keeps useSyncExternalStore stable between renders.
const snapshot = () => `${window.innerWidth}x${window.innerHeight}`;

/** Window size, live. Before hydration it reports a desktop-sized window. */
export function useViewport(): { w: number; h: number } {
  const [w, h] = useSyncExternalStore(subscribe, snapshot, () => "1200x900")
    .split("x")
    .map(Number);
  return { w, h };
}
