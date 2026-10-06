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
 * "Google" on the sign-in slips. Web: authorization-code popup with our signed
 * state (fetched ahead so the popup isn't blocked). Native app: Google Sign-In plugin.
 */
export default function GoogleButton({
  onSuccess,
  onError,
  disabled,
}: {
  onSuccess: (data: GoogleAuthData) => Promise<void>;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const isNative = isNativePlatform();
  const nativeReady = useRef(false);
  const [state, setState] = useState<string | null>(null);

  const login = useGoogleLogin({
    flow: "auth-code",
    ux_mode: "popup",
    onSuccess: async ({ code }) => {
      await onSuccess({ code, state: sessionStorage.getItem("oauth_state") ?? undefined });
    },
    onError: () => onError("Google sign-in was cancelled or blocked. Please try again."),
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
    try {
      if (!isNative) {
        if (!state) throw new Error("Google sign-in is not ready yet. Please try again.");
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
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled || (!isNative && !state)}
      className={outlineButton}
    >
      <GoogleMark />
      <span>Google</span>
    </button>
  );
}
