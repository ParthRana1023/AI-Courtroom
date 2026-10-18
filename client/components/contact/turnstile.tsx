"use client";

import { useEffect, useRef } from "react";

/** Set in production (Cloudflare dashboard -> Turnstile). Without it there's no check. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile didn’t load")));
    script.onerror = () => {
      loading = null; // let a later mount try again
      reject(new Error("Turnstile didn’t load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile, the robot check on the signed-out Contact form. It stays
 * invisible unless Cloudflare wants a click. Each token works once, so remount it
 * (change its `key`) for a fresh one after a send.
 */
export default function Turnstile({ onToken, onError }: { onToken: (token: string | null) => void; onError: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onToken, onError });
  useEffect(() => {
    handlers.current = { onToken, onError };
  });

  useEffect(() => {
    let widget: string | null = null;
    let live = true;
    loadTurnstile()
      .then((turnstile) => {
        if (!live || !box.current) return;
        widget = turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          // The server only accepts tokens minted for this action (TURNSTILE_ACTION).
          action: "contact",
          theme: "light",
          size: "flexible",
          appearance: "interaction-only",
          callback: (token: string) => handlers.current.onToken(token),
          "expired-callback": () => handlers.current.onToken(null),
          "error-callback": () => {
            handlers.current.onToken(null);
            handlers.current.onError();
          },
        });
      })
      .catch(() => live && handlers.current.onError());
    return () => {
      live = false;
      if (widget) window.turnstile?.remove(widget);
    };
  }, []);

  return <div ref={box} className="max-w-full" />;
}
