"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMounted } from "@/hooks/use-mounted";
import LandingClassic, { hasWebGL, type FallbackReason } from "./landing-classic";

// three.js and the scene load only when the 3D landing is chosen.
const Landing3D = dynamic(() => import("./landing-3d"), { ssr: false });

type View = { kind: "3d" } | { kind: "classic"; why?: FallbackReason };

/**
 * The 3D courtroom, or Landing Classic when there's no WebGL, the device looks too weak or the
 * visitor chose the simple view. `?view=3d` always tries the 3D one.
 */
function choose(): View {
  if (!hasWebGL()) return { kind: "classic", why: "nogl" };
  let forced = false;
  let pref: string | null = null;
  try {
    forced = new URLSearchParams(window.location.search).get("view") === "3d";
    pref = localStorage.getItem("aiCourtroom-landing");
  } catch {
    // No storage: decide on the device alone.
  }
  if (forced) return { kind: "3d" };
  if (pref === "classic") return { kind: "classic", why: "chosen" };
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weak = (nav.deviceMemory && nav.deviceMemory <= 2) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2);
  if (pref !== "3d" && weak) return { kind: "classic", why: "slow" };
  return { kind: "3d" };
}

export default function Landing() {
  // The choice needs the browser (WebGL, storage), so the server sends only the dark desk.
  const mounted = useMounted();
  const chosen = useMemo(() => (mounted ? choose() : null), [mounted]);
  // Set when the scene fails or the visitor picks the simple view.
  const [fallback, setFallback] = useState<FallbackReason | null>(null);

  if (!chosen) return <div className="fixed inset-0 bg-[#070504]" />;
  if (fallback) return <LandingClassic why={fallback} />;
  if (chosen.kind === "3d") return <Landing3D onFallback={setFallback} />;
  return <LandingClassic why={chosen.why} />;
}
