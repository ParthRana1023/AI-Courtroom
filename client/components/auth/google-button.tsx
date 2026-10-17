"use client";

import { useEffect, useRef, useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { authAPI } from "@/lib/api";
import { getLogger } from "@/lib/logger";
import { isNativePlatform } from "@/lib/platform";
import { GoogleMark, outlineButton } from "./kit";

const logger = getLogger("auth");

export interface GoogleAuthData {
  credential?: string;
  code?: string;
  state?: string;
}

/**
 * Google sign-in, shared by the sign-in slips and Settings (Connect Google). Web:
 * authorization-code popup with our signed state (fetched ahead so the popup isn't
 * blocked). Native app: Google Sign-In plugin, which returns an ID token.
 */
export function useGoogleAuth({
  onSuccess,
  onError,
}: {
  onSuccess: (data: GoogleAuthData) => Promise<void>;
  onError: (message: string) => void;
}) {
  const isNative = isNativePlatform();
  const nativeReady = useRef(false);
  const [state, setState] = useState<string | null>(null);
  // From the click until our server has answered (or the popup was closed).
  const [busy, setBusy] = useState(false);

  const login = useGoogleLogin({
    flow: "auth-code",
    ux_mode: "popup",
    onSuccess: async ({ code }) => {
      try {
        await onSuccess({ code, state: sessionStorage.getItem("oauth_state") ?? undefined });
      } finally {
        setBusy(false);
      }
    },
    onError: () => {
      setBusy(false);
      onError("Google sign-in was cancelled or blocked. Please try again.");
    },
    // Closing the popup is a change of mind, not an error; a blocked popup needs saying.
    onNonOAuthError: ({ type }) => {
      setBusy(false);
      if (type === "popup_failed_to_open") onError("Your browser blocked the Google window. Allow pop-ups for this site and try again.");
    },
  });

  useEffect(() => {
    if (isNative) return;
    let live = true;
    authAPI
      .getOAuthState()
      .then((s: string) => {
        if (!live) return;
        setState(s);
        sessionStorage.setItem("oauth_state", s);
      })
      .catch((err: unknown) => logger.error("Failed to prefetch OAuth state", err as Error));
    return () => {
      live = false;
    };
  }, [isNative]);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!isNative) {
        if (!state) throw new Error("Google sign-in is not ready yet. Please try again.");
        // Busy stays on until the popup's callbacks above report back.
        (login as (o: { state: string }) => void)({ state });
        return;
      }
      const { GoogleSignIn } = await import("@capawesome/capacitor-google-sign-in");
      if (!nativeReady.current) {
        await GoogleSignIn.initialize({ clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "" });
        nativeReady.current = true;
      }
      const result = await GoogleSignIn.signIn();
      if (!result.idToken) throw new Error("Google did not return a sign-in token.");
      await onSuccess({ credential: result.idToken });
      setBusy(false);
    } catch (err) {
      setBusy(false);
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  return { ready: isNative || !!state, busy, start };
}

/** "Google" on the sign-in slips. ``onBusyChange`` lets the slip lock its other buttons meanwhile. */
export default function GoogleButton({
  onSuccess,
  onError,
  onBusyChange,
  disabled,
}: {
  onSuccess: (data: GoogleAuthData) => Promise<void>;
  onError: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const google = useGoogleAuth({ onSuccess, onError });
  useEffect(() => onBusyChange?.(google.busy), [google.busy, onBusyChange]);
  return (
    <button
      type="button"
      onClick={google.start}
      disabled={disabled || google.busy || !google.ready}
      aria-busy={google.busy || undefined}
      className={outlineButton}
    >
      <GoogleMark />
      <span>{google.busy ? "Signing in…" : "Google"}</span>
    </button>
  );
}
