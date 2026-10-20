"use client";

import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import Link from "next/link";
import localFont from "next/font/local";
import { AccountMenu } from "@/components/chrome/site-header";
import { useAuth } from "@/contexts/auth-context";
import { useSettings } from "@/contexts/settings-context";
import { ACTS, ASSETS, pickCases, type LandingCase } from "@/lib/landing-cases";
import { cn } from "@/lib/utils";
import type { FallbackReason } from "./landing-classic";

// AI Courtroom Landing.dc.html: the real-time 3D walk-through (lib/three/courtroom-experience.js).

// Handwriting on the case documents, drawn into canvas textures; loaded only with this page.
const caveat = localFont({ src: "../../app/fonts/Caveat-400.woff2", variable: "--font-caveat", display: "swap", preload: false });
const homemadeApple = localFont({
  src: "../../app/fonts/HomemadeApple-400.woff2",
  variable: "--font-homemade-apple",
  display: "swap",
  preload: false,
});

interface SceneApi {
  reveal: () => void;
  skip: () => void;
  select: (i: number) => void;
  setBlueprint: (on: boolean) => void;
  setSound: (on: boolean) => void;
  setVolume: (v: number) => void;
  setMovie: (on: boolean) => void;
  setPlateName: (name: string) => void;
  destroy: () => void;
}
interface SceneState {
  ready?: boolean;
  act?: number;
  maxAct?: number;
  atDoor?: boolean;
  atCaseGate?: boolean;
  selected?: number | null;
  hoverCase?: { i: number; x: number; y: number } | null;
  hoverDoc?: { x: number; y: number; label: string } | null;
  inspecting?: boolean;
  final?: boolean;
  movie?: boolean;
  deskHold?: boolean;
}

const DOCKET: [string, string, number][] = [
  ["Item 1", "Chambers unlocked", 0.3],
  ["Item 2", "Brass plaque polished", 0.5],
  ["Item 3", "Law library shelved", 0.66],
  ["Item 4", "Case files sealed", 0.84],
  ["Item 5", "Courtroom lit", 1],
];
const FEATURES = [
  ["AI Judge", "Evaluates arguments and courtroom interaction."],
  ["AI Opposing Lawyer", "Challenges the user throughout the trial."],
  ["AI-Generated Cases", "Creates fictional and hypothetical cases for repeated practice."],
  ["Courtroom Simulation", "Lets users experience an interactive mock trial."],
  ["Moot Court Practice", "Designed particularly for students developing advocacy and legal reasoning skills."],
];
const STATION_RANGES = ["0.628,0.64,0.655,0.667", "0.672,0.684,0.698,0.708", "0.712,0.724,0.738,0.748", "0.752,0.764,0.782,0.79"];
const TOUCH_TX = {
  enter: "TAP THE DOOR OR SWIPE UP TO ENTER",
  walk: "SWIPE UP TO WALK IN",
  take: "TAP HERE TO TAKE THIS CASE",
  draw: "SWIPE UP TO DRAW OUT THE EVIDENCE",
  orFile: "or tap the file",
  lift: "TAP A DOCUMENT TO INSPECT IT",
  inspectDoc: "TAP A DOCUMENT TO INSPECT IT",
  investigate: "TAP TO INSPECT · SWIPE UP TO INVESTIGATE",
  cont: "SWIPE UP TO CONTINUE",
  putBack: "TAP OR SWIPE TO PUT IT BACK",
  fwd: "SWIPE UP TO PROGRESS",
  back: "SWIPE DOWN TO REWIND",
};
const POINTER_TX: typeof TOUCH_TX = {
  enter: "CLICK THE DOOR, SCROLL OR PRESS SPACE TO ENTER",
  walk: "SCROLL TO WALK IN",
  take: "CLICK TO TAKE THIS CASE",
  draw: "SCROLL TO DRAW OUT THE EVIDENCE",
  orFile: "or click the file",
  lift: "HOVER TO LIFT · CLICK TO INSPECT",
  inspectDoc: "CLICK A DOCUMENT TO INSPECT IT",
  investigate: "HOVER TO LIFT · CLICK TO INSPECT · SCROLL TO INVESTIGATE",
  cont: "SCROLL TO CONTINUE",
  putBack: "CLICK, SCROLL OR PRESS ESC TO PUT IT BACK",
  fwd: "SCROLL DOWN TO PROGRESS",
  back: "SCROLL UP TO REWIND",
};

const LABEL = "text-[11px] tracking-[0.3em]";
const BAR_BTN =
  "relative flex cursor-pointer items-center gap-2 whitespace-nowrap border-0 bg-transparent py-2.25 text-[11px] font-medium uppercase tracking-widest text-[#b9ad97] before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] hover:text-white";
const MENU_ROW =
  "flex min-h-12 w-full cursor-pointer items-center justify-between gap-4 border-0 border-t border-ink/12 bg-transparent px-4 text-left text-[15px] normal-case tracking-normal text-ink hover:bg-[#f8f3e7] hover:text-seal";
const BIG_CTA = "flex items-center gap-3 whitespace-nowrap px-6.5 py-4.25 text-[13.5px] font-bold uppercase tracking-[0.12em]";

const readMovie = () => {
  try {
    return localStorage.getItem("aiCourtroom-movieMode") === "1";
  } catch {
    return false;
  }
};
const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered next time; nothing else depends on it.
  }
};

export default function Landing3D({ onFallback }: { onFallback: (why: FallbackReason) => void }) {
  const { user, isAuthenticated } = useAuth();
  const { devMode } = useSettings();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const [cases] = useState<LandingCase[]>(pickCases);
  const [s, setS] = useState<SceneState>({ act: 0, atDoor: true, selected: null });
  const [load, setLoad] = useState({ f: 0.04, l: "Unlocking the chambers…" });
  const [reveal, setReveal] = useState(false);
  const [loaderGone, setLoaderGone] = useState(false);
  const [movieOn, setMovieOn] = useState(readMovie);
  const [sound, setSound] = useState(true);
  const [volume, setVolume] = useState(20);
  const [bp, setBp] = useState(false);
  const [hint, setHint] = useState(false);
  const [barMenu, setBarMenu] = useState(false);
  const [cardH, setCardH] = useState(300);
  const [win, setWin] = useState({ w: 1200, h: 800, touch: false });

  const mob = win.w < 720;
  const plateName = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : "";
  const plateRef = useRef(plateName);
  plateRef.current = plateName;
  const fallbackRef = useRef(onFallback);
  fallbackRef.current = onFallback;

  useEffect(() => {
    const onResize = () =>
      setWin({ w: window.innerWidth, h: window.innerHeight, touch: !!window.matchMedia?.("(pointer: coarse)").matches });
    onResize();
    window.addEventListener("resize", onResize);
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setBarMenu(false);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onEsc);
    };
  }, []);

  // Mount the scene once. It reports progress and state; the page shows the copy.
  useEffect(() => {
    let gone = false;
    const timers: number[] = [];
    const t0 = performance.now();
    let readyAt = false;
    let lastAct = 0;
    let hintDone = false;
    const fail = (why: FallbackReason) => {
      if (gone) return;
      gone = true;
      apiRef.current?.destroy();
      fallbackRef.current(why);
    };
    // A scene that hasn't shown itself in 25s isn't going to. (e2e sets __acRevealTimeoutMs: software WebGL is slower.)
    const revealTimeout = (window as Window & { __acRevealTimeoutMs?: number }).__acRevealTimeoutMs ?? 25_000;
    timers.push(window.setTimeout(() => !readyAt && fail("failed"), revealTimeout));

    const css = getComputedStyle(rootRef.current!);
    const fam = (v: string, fallback: string) => `${css.getPropertyValue(v).trim() || fallback}`;
    const text = fam("--font-courier-prime", '"Courier Prime"') + ', "Courier New", monospace';

    import("@/lib/three/courtroom-experience.js")
      .then(({ mount }) =>
        mount(stageRef.current, rootRef.current, {
          onState: (st: SceneState) => {
            if (gone) return;
            setS((prev) => ({ ...prev, ...st }));
            if (st.act === 4 && lastAct !== 4 && !hintDone) {
              hintDone = true;
              setHint(true);
              timers.push(window.setTimeout(() => setHint(false), 5000));
            }
            lastAct = st.act ?? lastAct;
            if (st.ready && !readyAt) {
              readyAt = true;
              const wait = Math.max(1300, 3000 - (performance.now() - t0));
              timers.push(
                window.setTimeout(() => {
                  setReveal(true);
                  apiRef.current?.reveal();
                }, wait),
              );
              timers.push(window.setTimeout(() => setLoaderGone(true), wait + 1500));
            }
          },
          onLoad: (f: number, l: string) => !gone && setLoad({ f, l }),
          plateName: plateRef.current,
          motion: "system",
          movie: readMovie(),
          cases,
          acts: ACTS,
          assets: ASSETS,
          families: {
            SERIF: fam("--font-special-elite", '"Special Elite"') + ', "Courier Prime", monospace',
            TEXT: text,
            SANS: text,
            MONO: fam("--font-plex-mono", '"IBM Plex Mono"') + ", monospace",
            HAND: fam("--font-caveat", '"Caveat"') + ", cursive",
            SIGN: fam("--font-homemade-apple", '"Homemade Apple"') + ", cursive",
          },
        }),
      )
      .then((api: SceneApi) => {
        if (gone) return api.destroy();
        apiRef.current = api;
      })
      .catch(() => fail("failed"));

    return () => {
      gone = true;
      timers.forEach(clearTimeout);
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, [cases]);

  useEffect(() => {
    apiRef.current?.setPlateName(plateName);
  }, [plateName]);

  // The hover card sits above the file it describes; measure it so it never covers the file.
  const hoverI = s.hoverCase?.i;
  useEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && Math.abs(h - cardH) > 2) setCardH(h);
  }, [hoverI, cardH]);

  const tx = {
    ...(win.touch ? TOUCH_TX : POINTER_TX),
    ...(mob || win.w < 1200 ? { skip: "Skip", movie: "Movie" } : { skip: "Skip to the courtroom", movie: "Movie mode" }),
  };
  const c = cases[s.selected ?? 0];
  const hcv = s.hoverCase;
  const hc =
    hcv && cases[hcv.i]
      ? {
          ...cases[hcv.i],
          cx: mob ? Math.round(win.w / 2) : Math.min(Math.max(hcv.x, 176), win.w - 176),
          top: mob ? Math.max(84, win.h - 20 - cardH) : Math.max(84, hcv.y - 26 - cardH),
        }
      : null;
  const m = mob
    ? {
        a4lift: "110px",
        a4w: "88vw",
        stTop: "auto",
        stBottom: "6vh",
        stW: "88vw",
        actTop: "84px",
        a3Top: "max(13vh, 122px)",
        contB: "calc(11vh + 44px)",
        pbTop: "112px",
        pbBottom: "auto",
        hintTop: "112px",
        railR: "10px",
        finBg: "linear-gradient(180deg, rgba(7,5,4,.9) 0%, rgba(7,5,4,.86) 100%)",
      }
    : {
        a4lift: "0px",
        a4w: "min(620px, calc(88vw - 340px))",
        stTop: "112px",
        stBottom: "auto",
        stW: "min(440px, 60vw)",
        actTop: "74px",
        a3Top: "max(13vh, 104px)",
        contB: "11vh",
        pbTop: "auto",
        pbBottom: "4vh",
        hintTop: "calc(50% + 18vh + 16px)",
        railR: "28px",
        finBg: "linear-gradient(90deg, rgba(7,5,4,.93) 0%, rgba(7,5,4,.78) 42%, rgba(7,5,4,.15) 75%)",
      };
  const act = ACTS[s.act ?? 0] ?? ACTS[0];
  const sideHref = isAuthenticated ? "/cases" : "/register";
  const loginHref = isAuthenticated ? "/cases" : "/login";
  const loginLabel = isAuthenticated ? "My cases" : "Login";

  const toggleSound = () => {
    const v = !sound;
    setSound(v);
    apiRef.current?.setVolume(volume / 100);
    apiRef.current?.setSound(v);
  };
  const toggleMovie = () => {
    const v = !movieOn;
    setMovieOn(v);
    store("aiCourtroom-movieMode", v ? "1" : "0");
    apiRef.current?.setMovie(v);
  };
  const onVolume = (e: ChangeEvent<HTMLInputElement>) => {
    const v = +e.target.value;
    setVolume(v);
    apiRef.current?.setVolume(v / 100);
  };
  const chooseClassic = () => {
    store("aiCourtroom-landing", "classic");
    apiRef.current?.destroy();
    apiRef.current = null;
    onFallback("chosen");
  };
  const skip = () => {
    setBarMenu(false);
    apiRef.current?.skip();
  };
  const stop = (e: MouseEvent | React.PointerEvent) => e.stopPropagation();

  return (
    <div
      ref={rootRef}
      data-screen-label="AI Courtroom Landing"
      className={cn(
        caveat.variable,
        homemadeApple.variable,
        "fixed inset-0 overflow-hidden bg-[#070504] font-type leading-[normal] text-paper select-none [-webkit-touch-callout:none]",
      )}
    >
      <div ref={stageRef} className="absolute inset-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_70%_at_50%_48%,rgba(7,5,4,0)_55%,rgba(7,5,4,.72)_100%)]"
      />
      <div data-bp-layer="" aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" />

      {/* ACT I: door */}
      {s.atDoor && (
        <div
          className="absolute inset-x-[6vw] bottom-[12vh] flex max-w-115 flex-col gap-7 transition-transform delay-[1.2s] duration-[3.6s] ease-paper"
          style={{ opacity: "var(--ac-text, 0)", transform: `translateY(${reveal ? "0px" : "14px"})` }}
        >
          <div translate="no" className="text-xs tracking-[0.32em] text-gold">
            AI COURTROOM
          </div>
          <h1 className="m-0 font-display text-[clamp(40px,4.6vw,76px)]/[1.02] font-normal tracking-[0.01em] text-balance">
            YOUR FIRST CASE IS WAITING.
          </h1>
          <span className={cn(LABEL, "leading-[1.6]")}>{tx.enter}</span>
        </div>
      )}

      <Beat mode="scroll" range="0.066,0.072,0.1,0.118" className="inset-x-0 bottom-[7vh] flex flex-col items-center gap-3">
        <span className={cn(LABEL, "text-[#d8ccb4]")}>{tx.walk}</span>
        <span aria-hidden="true" className="h-11 w-px bg-[linear-gradient(#d8ccb4,rgba(216,204,180,0))]" />
      </Beat>

      {/* ACT II */}
      <Beat range="0.1,0.13,0.19,0.23" className="inset-x-0 top-[40%] flex justify-center px-[6vw]">
        <p className="m-0 text-center text-[clamp(26px,2.6vw,42px)]/[1.2] text-balance italic [text-shadow:0_2px_30px_rgba(0,0,0,.8)]">
          Every case begins with preparation.
        </p>
      </Beat>

      {/* ACT III: choose */}
      {s.atCaseGate && !s.hoverCase && (
        <div
          className="pointer-events-none absolute inset-x-0 flex flex-col items-center gap-2.5 px-[6vw] text-center [text-shadow:0_2px_24px_rgba(0,0,0,.9)]"
          style={{ top: m.a3Top }}
        >
          <span className="text-[11px] tracking-[0.32em] text-gold">THREE FILES ON THE DESK</span>
          <span className="font-display text-[clamp(24px,2.2vw,34px)]/[1.2]">Choose the case you will argue.</span>
        </div>
      )}

      {hc && (
        <div
          ref={cardRef}
          onClick={(e) => {
            e.stopPropagation();
            if (hcv) apiRef.current?.select(hcv.i);
          }}
          onPointerDown={stop}
          onPointerUp={stop}
          className="absolute flex w-80 max-w-[calc(100vw-32px)] -translate-x-1/2 cursor-pointer flex-col gap-2.5 border border-[rgba(201,164,92,.5)] bg-[rgba(12,9,7,.94)] px-5.5 py-5 shadow-[0_20px_60px_rgba(0,0,0,.6)]"
          style={{ left: hc.cx, top: hc.top, pointerEvents: win.touch ? "auto" : "none" }}
        >
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10.5px] tracking-[0.24em] text-gold uppercase">
            <span>{hc.area}</span>
            <span className="text-[#8f8574]">{hc.docket}</span>
          </div>
          <div className="text-[15px] text-[#e0786c] italic">{hc.q}</div>
          <div className="font-display text-[23px]/[1.15] text-balance text-cream">{hc.title}</div>
          <div className="text-[13.5px]/[1.5] text-pretty text-[#cfc4b0]">{hc.summary}</div>
          {hc.inspired && (
            <div className="border-t border-[rgba(239,230,211,.14)] pt-2.5 text-[12.5px] text-[#b9ad97] italic">{hc.inspired}</div>
          )}
          <div className="text-[10.5px] tracking-[0.24em] text-[#e0786c]">{tx.take}</div>
        </div>
      )}

      {/* ACT IV */}
      <Beat
        inspectHide
        range="0.405,0.43,0.5,0.53"
        className="left-[6vw] flex flex-col gap-3.5 [text-shadow:0_2px_30px_rgba(0,0,0,.9)]"
        style={{ bottom: `calc(11vh + ${m.a4lift})`, maxWidth: m.a4w }}
      >
        <span className="text-[11px] tracking-[0.32em] text-[#e0786c]">THIS IS YOUR CASE</span>
        <span className="font-display text-[clamp(34px,3.6vw,58px)]/[1.05] text-balance">{c?.title}</span>
        <span className="text-lg text-[#d8ccb4] italic">
          {c?.q} · {c?.docket}
        </span>
        {c?.inspired && <span className="text-xs tracking-[0.06em] text-[#b9ad97]">{c.inspired}</span>}
      </Beat>
      <Beat
        mode="scroll"
        inspectHide
        range="0.462,0.474,0.486,0.5"
        className="right-[6vw] bottom-[11vh] flex max-w-75 flex-col items-end gap-2 text-right [text-shadow:0_1px_12px_#000]"
      >
        <span className={LABEL}>{tx.draw}</span>
        <span className="text-sm text-[#b9ad97] italic">{tx.orFile}</span>
      </Beat>
      <Beat
        mode="movie"
        inspectHide
        range="0.505,0.525,0.585,0.6"
        className="inset-x-0 bottom-[6vh] flex justify-center px-[6vw] text-center"
      >
        <span className={cn(LABEL, "leading-[1.6] text-[#d8ccb4] [text-shadow:0_1px_12px_#000]")}>{tx.lift}</span>
      </Beat>
      <Beat mode="movie" inspectHide range="0.625,0.64,0.8,0.815" className="top-28 right-[6vw] flex justify-end">
        <span className="bg-[rgba(7,5,4,.6)] px-3 py-1.5 text-right text-[11px] tracking-[0.2em] text-[#d8ccb4] [text-shadow:0_1px_12px_#000]">
          {tx.inspectDoc}
        </span>
      </Beat>
      <Beat
        mode="scroll"
        inspectHide
        range="0.505,0.525,0.56,0.578"
        className="inset-x-0 bottom-[6vh] flex justify-center px-[6vw] text-center"
      >
        <span className={cn(LABEL, "leading-[1.6] text-[#d8ccb4] [text-shadow:0_1px_12px_#000]")}>{tx.investigate}</span>
      </Beat>
      {s.deskHold && !s.inspecting && (
        <div
          className="pointer-events-none absolute right-[6vw] flex max-w-75 flex-col items-end gap-2 text-right [text-shadow:0_1px_12px_#000]"
          style={{ bottom: m.contB }}
        >
          <span className={LABEL}>{tx.cont}</span>
          <span className="text-sm text-[#b9ad97] italic">Take your time with the evidence.</span>
        </div>
      )}
      {s.inspecting && (
        <div
          className="pointer-events-none absolute inset-x-0 flex items-start justify-center px-[6vw] text-center"
          style={{ top: m.pbTop, bottom: m.pbBottom }}
        >
          <span className={cn(LABEL, "bg-[rgba(7,5,4,.72)] px-3.5 py-2 leading-[1.6] text-[#d8ccb4]")}>{tx.putBack}</span>
        </div>
      )}
      {s.hoverDoc && (
        <div
          className="pointer-events-none absolute translate-x-4 translate-y-4 border border-[rgba(201,164,92,.45)] bg-[rgba(12,9,7,.9)] px-2.5 py-1.5 font-data text-[11px] whitespace-nowrap text-paper"
          style={{ left: s.hoverDoc.x, top: s.hoverDoc.y }}
        >
          {s.hoverDoc.label}
        </div>
      )}

      {/* ACT V: stations */}
      {(c?.board ?? []).map((b, i) => (
        <Beat
          key={i}
          range={STATION_RANGES[i]}
          className="left-[6vw] flex flex-col gap-3 border-t-2 border-[#a8231c] bg-[rgba(10,7,5,.8)] px-[clamp(18px,2vw,28px)] py-[clamp(18px,2vw,26px)]"
          style={{ top: m.stTop, bottom: m.stBottom, maxWidth: m.stW }}
        >
          <div className="flex items-baseline gap-3.5">
            <span className="font-display text-3xl text-[#e0786c]">{["I", "II", "III", "IV"][i]}</span>
            <span className="text-[11px] tracking-[0.3em] text-gold uppercase">{b.t}</span>
          </div>
          <div className="text-[clamp(16px,calc(1.2vw+10px),21px)]/[1.4] text-pretty">{b.d}</div>
        </Beat>
      ))}

      {/* ACT VII */}
      <Beat range="0.848,0.86,0.882,0.896" className="inset-x-0 top-[22vh] flex justify-center px-[6vw] text-center">
        <span className="text-[clamp(22px,2vw,32px)] italic [text-shadow:0_2px_24px_#000]">Follow the evidence.</span>
      </Beat>

      {/* ACT IX */}
      <Beat range="0.964,0.97,0.981,0.987" className="inset-0 flex items-center justify-center">
        <h2 className="m-0 px-[5vw] text-center font-display text-[clamp(44px,6.4vw,112px)]/none font-normal tracking-[0.02em] text-balance [text-shadow:0_4px_60px_rgba(0,0,0,.9)]">
          COURT IS NOW IN SESSION.
        </h2>
      </Beat>

      <Beat
        range="0.986,0.996,1,1"
        className="inset-x-0 top-0 bottom-0 flex scrollbar-gutter-stable flex-col justify-between gap-5 overflow-y-auto overscroll-contain px-[6vw] pt-[clamp(64px,11vh,140px)] pb-[3vh] select-text"
        style={{ background: m.finBg }}
        data-scroll=""
      >
        <div className="flex max-w-160 flex-col gap-[clamp(14px,2.6vh,26px)]">
          <span className="text-[11px] tracking-[0.3em] text-[#e0786c] uppercase">Case assigned · {c?.title}</span>
          <div className="flex flex-col gap-3">
            <h2 className="m-0 font-display text-[clamp(40px,4.4vw,74px)]/[1.02] font-normal text-balance">EVERY CASE HAS A STORY.</h2>
            <p className="m-0 font-display text-[clamp(22px,2.1vw,34px)]/[1.15] text-balance text-gold">{c?.closing}</p>
          </div>
          <p className="m-0 max-w-135 text-[17px]/[1.6] text-pretty text-[#d8ccb4]">
            Step into the role of an advocate. Analyse evidence, challenge an AI Opposing Lawyer, and argue your case before an AI Judge in
            immersive courtroom simulations.
          </p>
          <div className="flex flex-wrap items-center gap-3.5">
            <Link href={sideHref} className={cn(BIG_CTA, "bg-paper text-ink hover:bg-white hover:text-ink")}>
              Take a Side
            </Link>
            <Link href={loginHref} className={cn(BIG_CTA, "bg-seal text-cream hover:bg-seal-hover hover:text-white")}>
              {loginLabel}
            </Link>
          </div>
        </div>
        <div className="grid max-w-295 grid-cols-[repeat(auto-fit,minmax(140px,1fr))] border-t border-[rgba(239,230,211,.18)]">
          {FEATURES.map(([t, d]) => (
            <div key={t} className="flex flex-col gap-1.25 pt-3.5 pr-4 pb-0.5">
              <span className="font-display text-[clamp(14px,1.2vw,17px)] text-cream">{t}</span>
              <span className="text-[clamp(11.5px,.9vw,13px)]/[1.45] text-pretty text-[#b9ad97]">{d}</span>
            </div>
          ))}
        </div>
        <p className="m-0 max-w-295 text-label/normal text-pretty text-[#8f8574]">
          All cases are original works of fiction for legal education. Any resemblance to real persons or events is coincidental.
        </p>
      </Beat>

      {/* chrome */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 flex flex-nowrap justify-between gap-y-1 px-[6vw] pt-[clamp(14px,3vh,24px)] pb-1.5",
          // Phones: tighter, so the wordmark and Log in / Register fit side by side at 360px.
          mob ? "items-start gap-x-3" : "items-center gap-x-5",
          s.final && mob && "bg-[rgba(7,5,4,.96)]",
        )}
        style={{ opacity: "var(--ac-text, 0)" }}
      >
        <div translate="no" aria-label="AI Courtroom" className="pointer-events-auto flex min-h-9 flex-none items-center self-start">
          <span className="flex items-baseline gap-1.5">
            <span className="font-display text-[15px] tracking-[0.24em] whitespace-nowrap">AI COURTROOM</span>
            <span aria-hidden="true" className="h-0.5 w-2.25 bg-cursor motion-safe:animate-[ac-cursor_1.6s_steps(1,end)_infinite]" />
          </span>
        </div>
        <div
          className={cn(
            "pointer-events-auto ml-auto flex min-w-0 flex-nowrap items-center justify-end text-[11px] tracking-[0.2em] uppercase",
            mob ? "gap-x-2" : "gap-x-4.5",
          )}
        >
          {!mob && (
            <>
              <span
                aria-hidden={!sound}
                className={cn(
                  "flex items-center overflow-hidden transition-[width,margin,opacity] duration-400 ease-[cubic-bezier(.2,.8,.2,1)]",
                  sound ? "mr-0 w-21 opacity-100" : "-mr-4.5 w-0 opacity-0",
                )}
              >
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={volume}
                  onChange={onVolume}
                  aria-label="Volume"
                  tabIndex={sound ? 0 : -1}
                  className="m-0 h-6 w-21 flex-none cursor-pointer accent-[#b3261e]"
                />
              </span>
              <button type="button" aria-pressed={sound} onClick={toggleSound} className={BAR_BTN}>
                <span>Sound</span>
                <span className="text-paper">{sound ? "On" : "Off"}</span>
              </button>
              <button type="button" aria-pressed={movieOn} onClick={toggleMovie} className={BAR_BTN}>
                <span>{tx.movie}</span>
                <span className="text-paper">{movieOn ? "On" : "Off"}</span>
              </button>
            </>
          )}
          {devMode && (
            <button
              type="button"
              aria-pressed={bp}
              onClick={() => {
                setBp(!bp);
                apiRef.current?.setBlueprint(!bp);
              }}
              className="flex cursor-pointer items-center gap-2 border border-[rgba(201,164,92,.5)] bg-transparent px-3 py-2 text-[11px] font-medium tracking-widest whitespace-nowrap text-gold uppercase hover:border-gold hover:text-[#f0dcaa]"
            >
              <span>Blueprint</span>
              <span className="text-paper">{bp ? "On" : "Off"}</span>
            </button>
          )}
          {devMode && (
            <Link
              href="/blueprint"
              className="flex items-center border border-[rgba(201,164,92,.5)] px-3 py-2 text-[11px] font-medium tracking-widest whitespace-nowrap text-gold uppercase hover:border-gold hover:text-[#f0dcaa]"
            >
              Asset register
            </Link>
          )}
          {!mob && (
            <>
              <button type="button" onClick={skip} className={BAR_BTN}>
                {tx.skip}
              </button>
              <button type="button" onClick={chooseClassic} className={BAR_BTN}>
                Simple view
              </button>
            </>
          )}
          {isAuthenticated ? (
            <>
              <Link
                href="/cases"
                className="ml-1.5 flex h-9 items-center border border-[rgba(239,230,211,.45)] px-3.5 font-bold tracking-[0.16em] whitespace-nowrap text-paper hover:border-paper hover:text-white"
              >
                Cases
              </Link>
              <span className="ml-1.5 flex">
                <AccountMenu size={38} />
              </span>
            </>
          ) : (
            <div className={cn("flex items-center", mob ? "gap-1.5" : "ml-1.5 gap-2")}>
              <Link
                href="/login"
                className={cn(
                  "flex h-9 items-center border border-[rgba(239,230,211,.45)] font-bold tracking-[0.16em] whitespace-nowrap text-paper hover:border-paper hover:text-white",
                  mob ? "px-2.5" : "px-3.5",
                )}
              >
                Log in
              </Link>
              <Link
                href="/register"
                className={cn(
                  "flex h-9 items-center bg-paper font-bold tracking-[0.16em] whitespace-nowrap text-ink hover:bg-white hover:text-ink",
                  mob ? "px-2.5" : "px-3.5",
                )}
              >
                Register
              </Link>
            </div>
          )}
          {mob && (
            <div className="absolute top-[calc(clamp(14px,3vh,24px)+44px)] right-[6vw] z-3">
              <button
                type="button"
                onClick={() => setBarMenu(!barMenu)}
                aria-haspopup="menu"
                aria-expanded={barMenu}
                aria-label="Settings"
                title="Settings"
                className={cn(
                  "flex size-9 cursor-pointer items-center justify-center border border-[rgba(239,230,211,.45)] p-0 hover:border-paper",
                  barMenu ? "bg-paper text-ink" : "bg-transparent text-paper",
                )}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              {barMenu && (
                <>
                  <div onClick={() => setBarMenu(false)} className="pointer-events-auto fixed inset-0 z-55" />
                  <div
                    role="menu"
                    aria-label="Settings"
                    className="pointer-events-auto absolute top-[calc(100%+8px)] right-0 z-56 flex w-[min(260px,calc(100vw-28px))] flex-col bg-paper py-1.5 text-ink shadow-[0_20px_50px_rgba(0,0,0,.7)]"
                  >
                    <span className="px-4 pt-2 pb-1.5 text-[10.5px] font-bold tracking-[0.2em] text-ink-muted uppercase">Settings</span>
                    <button type="button" role="menuitemcheckbox" aria-checked={sound} onClick={toggleSound} className={MENU_ROW}>
                      <span>Sound</span>
                      <span aria-hidden="true" className="flex-none text-[11px] font-bold tracking-[0.14em] text-seal uppercase">
                        {sound ? "On" : "Off"}
                      </span>
                    </button>
                    {sound && (
                      <label className="flex min-h-11 items-center gap-3 px-4 text-[13px] tracking-normal text-ink-muted normal-case">
                        <span className="flex-none">Volume</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={volume}
                          onChange={onVolume}
                          aria-label="Volume"
                          className="m-0 h-6 min-w-0 flex-1 cursor-pointer accent-seal"
                        />
                      </label>
                    )}
                    <button type="button" role="menuitemcheckbox" aria-checked={movieOn} onClick={toggleMovie} className={MENU_ROW}>
                      <span>{tx.movie}</span>
                      <span aria-hidden="true" className="flex-none text-[11px] font-bold tracking-[0.14em] text-seal uppercase">
                        {movieOn ? "On" : "Off"}
                      </span>
                    </button>
                    <button type="button" role="menuitem" onClick={skip} className={MENU_ROW}>
                      <span className="whitespace-nowrap">{tx.skip}</span>
                      <span aria-hidden="true" className="text-seal">
                        →
                      </span>
                    </button>
                    <button type="button" role="menuitem" onClick={chooseClassic} className={MENU_ROW}>
                      <span className="whitespace-nowrap">Simple view</span>
                      <span aria-hidden="true" className="text-seal">
                        →
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {!s.final && (
        <div
          className="pointer-events-none absolute left-[6vw] flex items-baseline gap-2.5 text-[10.5px] tracking-[0.28em] whitespace-nowrap text-[#8f8574] uppercase"
          style={{ top: m.actTop, opacity: "var(--ac-text, 0)" }}
        >
          <span className="font-display text-sm tracking-[0.08em] text-gold">Act {act.n}</span>
          <span>{act.name}</span>
        </div>
      )}

      <div
        aria-hidden={!hint}
        className="pointer-events-none absolute right-5 flex flex-col items-end gap-1.5 text-right text-[10.5px] tracking-[0.2em] text-[#d8ccb4] transition-opacity duration-1000 [text-shadow:0_1px_8px_#000]"
        style={{ top: m.hintTop, opacity: hint && !s.final ? 1 : 0 }}
      >
        <span>{tx.fwd}</span>
        <span>{tx.back}</span>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 h-[36vh] w-px -translate-y-1/2 bg-[rgba(239,230,211,.14)] transition-opacity duration-600"
        style={{ right: m.railR, opacity: s.final && mob ? 0 : 1 }}
      >
        <div data-progress-fill="" className="absolute inset-0 origin-top scale-y-0 bg-[#b3261e]" />
      </div>

      {!loaderGone && (
        <div
          role="status"
          aria-busy={!reveal}
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_60%_55%_at_50%_50%,#140d09_0%,#070504_72%)] px-[6vw] py-[6vh] transition-opacity duration-[1.4s]",
            reveal ? "pointer-events-none opacity-0" : "opacity-100",
          )}
        >
          <div className="flex w-[min(560px,100%)] flex-col gap-6.5">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="text-[10.5px] tracking-[0.32em] text-gold uppercase">In the Court of</span>
              <span translate="no" className="pl-[.2em] font-display text-[clamp(26px,2.6vw,36px)] tracking-[0.2em]">
                AI COURTROOM
              </span>
              <span className="text-[15px] text-[#b9ad97] italic">Today’s cause list</span>
            </div>
            <div className="flex flex-col border-t-2 border-b border-t-paper border-b-[rgba(239,230,211,.3)]">
              {DOCKET.map(([no, t, th]) => (
                <div
                  key={no}
                  className="grid grid-cols-[64px_minmax(0,1fr)_96px] items-center gap-3.5 border-b border-[rgba(239,230,211,.1)] py-3"
                >
                  <span className="font-data text-xs text-[#8f8574]">{no}</span>
                  <span className="text-[17px]">{t}</span>
                  <span className="flex justify-end">
                    {load.f >= th ? (
                      <span className="-rotate-4 border-[1.5px] border-[#b3261e] px-2 py-1 text-[10.5px] font-bold tracking-[0.22em] text-[#e0786c]">
                        FILED
                      </span>
                    ) : (
                      <span className="py-1 text-[10.5px] tracking-[0.22em] text-[#6f6656]">PENDING</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex min-h-11 items-center justify-center">
              {load.f >= 1 ? (
                <span className="font-display text-[clamp(28px,3vw,42px)] tracking-[0.14em]">ALL RISE.</span>
              ) : (
                <span className="text-base text-[#b9ad97] italic">{load.l}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Copy the scene fades in and out over a scroll range (`data-range`); the scene sets its opacity. */
function Beat({
  range,
  mode,
  inspectHide,
  className,
  style,
  children,
  ...rest
}: {
  range: string;
  mode?: "scroll" | "movie";
  inspectHide?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  "data-scroll"?: string;
}) {
  return (
    <div
      data-beat=""
      data-range={range}
      data-mode={mode}
      data-inspect-hide={inspectHide ? "" : undefined}
      className={cn("pointer-events-none invisible absolute opacity-0", className)}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}
