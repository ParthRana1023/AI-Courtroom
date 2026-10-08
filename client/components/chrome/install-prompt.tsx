"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { usePwaInstall } from "@/contexts/pwa-install-context";
import { buttonClass } from "@/components/court/button";

const DISMISSED_KEY = "pwa-install-modal-dismissed";
const NUMERALS = ["i.", "ii.", "iii."];

const COPY = {
  pwa: {
    form: "Form I-1 · Installation",
    title: "Install AI Courtroom",
    body: "Add AI Courtroom to your home screen for instant access, faster loading, and offline support.",
    feats: [
      "Works offline — view past cases anytime",
      "Instant launch from your home screen",
      "No app store needed",
    ],
    cta: "Install",
    busy: "Installing…",
    stamp: "INSTALLED",
    done: "AI Courtroom is on your device. Open it from your home screen or app list.",
  },
  apk: {
    form: "Form D-2 · Download",
    title: "Download AI Courtroom",
    body: "Download the AI Courtroom Android app for the best mobile experience with native performance.",
    feats: [
      "Native Android app — smooth performance",
      "Instant launch from your home screen",
      "Full offline support",
    ],
    cta: "Download APK",
    busy: "Starting download…",
    stamp: "DOWNLOADING",
    done: "The APK is downloading. Open it from your notifications to finish installing.",
  },
} as const;

function rememberDismissal() {
  try {
    sessionStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

export default function InstallPrompt() {
  const pathname = usePathname();
  const { canInstall, installMode, promptInstall, promptOpen, openPrompt, closePrompt } =
    usePwaInstall();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const copy = COPY[installMode];

  // Opens by itself once per session on the landing page.
  useEffect(() => {
    if (pathname !== "/" || !canInstall) return;
    let seen = false;
    try {
      seen = !!sessionStorage.getItem(DISMISSED_KEY);
    } catch {
      /* storage unavailable */
    }
    if (seen) return;
    const t = window.setTimeout(openPrompt, 2000);
    return () => window.clearTimeout(t);
  }, [pathname, canInstall, openPrompt]);

  const close = () => {
    rememberDismissal();
    closePrompt();
    setDone(false);
    setBusy(false);
  };

  const install = async () => {
    setBusy(true);
    const ok = await promptInstall();
    setBusy(false);
    if (ok) setDone(true);
    else close();
  };

  return (
    <Dialog.Root open={promptOpen} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-100 bg-(--scrim) animate-[ac-fade_.25s_ease_both]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-4 bottom-4 z-101 mx-auto flex max-w-100 flex-col bg-paper text-ink shadow-dialog outline-none animate-[ac-rise_.32s_cubic-bezier(.2,.9,.3,1)_both] min-[560px]:bottom-auto min-[560px]:top-1/2 min-[560px]:-translate-y-1/2"
        >
          <div className="flex items-center justify-between gap-3 border-b-[3px] border-double border-ink pb-2.5 pl-5.5 pr-2.5 pt-3 font-type text-label font-bold uppercase tracking-[0.2em] text-ink-label">
            <span>{copy.form}</span>
            <Dialog.Close
              aria-label="Dismiss install prompt"
              className="h-9 w-11 cursor-pointer font-type text-[1.375rem] leading-none text-ink-label hover:text-seal"
            >
              ×
            </Dialog.Close>
          </div>

          {done ? (
            <div role="status" className="flex flex-col items-center gap-4.5 px-5.5 pb-5.5 pt-7.5 text-center">
              <span className="inline-block border-4 border-double border-seal px-4.5 pb-1.5 pt-2 font-display text-[2.375rem] leading-none tracking-[0.08em] text-seal animate-[ac-stamp_.35s_cubic-bezier(.2,.9,.3,1.2)_both] transform-[rotate(-5deg)]">
                {copy.stamp}
              </span>
              <Dialog.Title className="m-0 max-w-[320px] text-balance font-type text-body font-normal leading-[1.55] text-ink-label">
                {copy.done}
              </Dialog.Title>
              <button type="button" autoFocus onClick={close} className={buttonClass("ink", "md", "w-full")}>
                Done
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 px-5.5 pb-5.5 pt-5">
              <div className="flex flex-col gap-1.5">
                <Dialog.Title className="m-0 font-display text-h2 font-normal leading-[1.1]">
                  {copy.title}
                </Dialog.Title>
                <span className="font-type text-label font-bold uppercase tracking-[0.16em] text-seal">
                  Get the full app experience
                </span>
              </div>
              <p className="m-0 text-pretty font-type text-body leading-[1.55] text-ink-label">
                {copy.body}
              </p>
              <ol className="m-0 flex list-none flex-col border-t border-ink/20 p-0">
                {copy.feats.map((f, i) => (
                  <li
                    key={f}
                    className="grid grid-cols-[34px_minmax(0,1fr)] gap-1.5 border-b border-ink/12 py-2.5 font-type text-body leading-[1.45]"
                  >
                    <span className="font-display text-body text-seal">{NUMERALS[i]}</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={install}
                  disabled={busy}
                  className={buttonClass("seal", "lg", "flex-[1_1_180px] px-4.5")}
                >
                  {busy ? copy.busy : copy.cta}
                </button>
                <button type="button" onClick={close} className={buttonClass("paper", "lg", "flex-none px-4.5 text-xs")}>
                  Not now
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
