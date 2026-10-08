"use client";

import { useEffect, useRef, useState } from "react";
import { pickLoaderModel, type Builders, type LoaderModel } from "@/lib/three/loader-models";

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Route loader: a random object from the landing scene that turns slowly and can be dragged.
 * Without WebGL (or if the scene fails) only the status line shows.
 */
export default function CourtModelLoader({
  status = "Loading…",
  tone = "desk",
}: {
  status?: string;
  /** "paper" inside a document card, "desk" on the page background. */
  tone?: "paper" | "desk";
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [model, setModel] = useState<LoaderModel | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasWebGL()) {
      setFailed(true);
      return;
    }
    setModel(pickLoaderModel());
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!model || !stage) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const [THREE, mod] = await Promise.all([import("three"), model.load()]);
      if (disposed) return;

      const canvas = document.createElement("canvas");
      canvas.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .6s ease";
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.3;
      stage.appendChild(canvas);

      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(32, 4 / 3, 0.01, 100);
      scene.add(new THREE.HemisphereLight("#fff4e0", "#5a4632", 1.6));
      const key = new THREE.DirectionalLight("#ffe2b8", 2.4);
      key.position.set(2.5, 4, 3);
      scene.add(key);
      const rim = new THREE.DirectionalLight("#c9d8ff", 0.9);
      rim.position.set(-3, 2, -2.5);
      scene.add(rim);

      const built = model.build(THREE, mod as Builders);
      const pivot = new THREE.Group();
      pivot.add(built.obj);
      scene.add(pivot);
      const box = new THREE.Box3().setFromObject(built.obj);
      built.obj.position.sub(box.getCenter(new THREE.Vector3()));
      const rad = box.getSize(new THREE.Vector3()).length() / 2 || 1;
      const dist = (rad / Math.sin((cam.fov * Math.PI) / 180 / 2)) * 0.82;
      cam.position.set(0, rad * 0.35, dist);
      cam.lookAt(0, 0, 0);

      let yaw = -0.6,
        pitch = 0.12,
        vy = 0,
        idle = 0;
      let drag: { x: number; y: number } | null = null;
      const onDown = (e: PointerEvent) => {
        drag = { x: e.clientX, y: e.clientY };
        stage.setPointerCapture(e.pointerId);
        stage.style.cursor = "grabbing";
        idle = performance.now();
      };
      const onMove = (e: PointerEvent) => {
        if (!drag) return;
        const dx = e.clientX - drag.x,
          dy = e.clientY - drag.y;
        drag = { x: e.clientX, y: e.clientY };
        yaw += dx * 0.011;
        vy = dx * 0.011;
        pitch = Math.max(-0.5, Math.min(0.75, pitch + dy * 0.008));
      };
      const onUp = () => {
        drag = null;
        stage.style.cursor = "grab";
        idle = performance.now();
      };
      stage.addEventListener("pointerdown", onDown);
      stage.addEventListener("pointermove", onMove);
      stage.addEventListener("pointerup", onUp);
      stage.addEventListener("pointercancel", onUp);

      const fit = () => {
        const w = stage.clientWidth || 1,
          h = stage.clientHeight || 1;
        renderer.setSize(w, h, false);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(fit);
      ro.observe(stage);
      fit();

      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const t0 = performance.now();
      let raf = 0;
      const loop = (now: number) => {
        if (!drag) {
          vy *= 0.92;
          yaw += vy;
          if (!reduce && now - idle > 1500) yaw += 0.006;
        }
        pivot.rotation.set(pitch, yaw, 0);
        if (built.tick && !reduce) built.tick((now - t0) / 1000);
        renderer.render(scene, cam);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      window.setTimeout(() => (canvas.style.opacity = "1"), 30);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        stage.removeEventListener("pointerdown", onDown);
        stage.removeEventListener("pointermove", onMove);
        stage.removeEventListener("pointerup", onUp);
        stage.removeEventListener("pointercancel", onUp);
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      };
    })().catch(() => !disposed && setFailed(true));

    return () => {
      disposed = true;
      cleanup();
    };
  }, [model]);

  return (
    <div
      role="status"
      className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-3.5 text-center"
    >
      {!failed && (
        <div
          ref={stageRef}
          data-testid="loader-stage"
          className="relative aspect-4/3 max-h-[min(46vh,330px)] min-h-35 w-[min(100%,440px)] flex-[0_1_auto] cursor-grab touch-none"
        />
      )}
      <div className="flex flex-col items-center gap-1.5 px-4">
        <span
          className={`font-display text-xl leading-tight ${tone === "paper" ? "text-ink" : "text-desk-ink"}`}
        >
          {status}
        </span>
        {model && !failed && (
          <span
            className={`text-balance font-type text-meta leading-[1.45] ${tone === "paper" ? "text-ink-muted" : "text-desk-muted"}`}
          >
            {model.name}, from {model.where}. Drag to turn it.
          </span>
        )}
      </div>
    </div>
  );
}
