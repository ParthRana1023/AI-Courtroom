"use client";

import { Capacitor } from "@capacitor/core";
import { useGoogleLogin } from "@react-oauth/google";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { useRef, useState, useEffect } from "react";

interface GoogleSignInButtonProps {
  onSuccess: (response: {
    credential?: string;
    access_token?: string;
    code?: string;
    state?: string;
  }) => Promise<void>;
  onError?: (error?: Error) => void;
  text?: "signin" | "signup" | "continue";
  isLoading?: boolean;
  disabled?: boolean;
}

import { apiBaseUrl, authAPI } from "@/lib/api";

export default function GoogleSignInButton({
  onSuccess,
  onError,
  text = "signin",
  isLoading = false,
  disabled = false,
}: GoogleSignInButtonProps) {
  const nativeGoogleInitializedRef = useRef(false);
  const isNativePlatform = Capacitor.isNativePlatform();

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      // Handle Authorization Code Flow
      if (tokenResponse.code) {
        console.log("Google Auth Code received");

        // Retrieve state from session storage for validation
        const storedState = sessionStorage.getItem("oauth_state");

        await onSuccess({
          code: tokenResponse.code,
          state: storedState || undefined,
        } as any);
      } else {
        // Fallback or error case
        console.error("No code received in Google login response");
      }
    },

    onError: () => {
      console.error("Google Login Failed");
      onError?.(new Error("Google rejected the sign-in popup request."));
    },
    flow: "auth-code", // Use Authorization Code flow for security
    ux_mode: "popup",
    // We can't set state dynamically here easily with the hook's current config unless we override the click handler completely
    // flexible solution: The hook usually handles state internally if we don't interfere,
    // but for our backend verification we need to send OUR state.
    // The useGoogleLogin hook allows passing `state` in the login() function options.
  });

  const handleNativeLogin = async () => {
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!googleClientId) {
      throw new Error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID");
    }

    const { GoogleSignIn } =
      await import("@capawesome/capacitor-google-sign-in");

    if (!nativeGoogleInitializedRef.current) {
      await GoogleSignIn.initialize({
        clientId: googleClientId,
      });
      nativeGoogleInitializedRef.current = true;
    }

    const result = await GoogleSignIn.signIn();

    if (!result.idToken) {
      throw new Error("No ID token received from native Google sign-in");
    }

    await onSuccess({
      credential: result.idToken,
      access_token: result.accessToken || undefined,
    });
  };

  const [oauthState, setOauthState] = useState<string | null>(null);
  const [isPreparingWebLogin, setIsPreparingWebLogin] =
    useState(!isNativePlatform);

  // Prefetch state to prevent popup blockers from intercepting an async onClick function (essential for mobile view/DevTools)
  useEffect(() => {
    if (isNativePlatform) {
      setIsPreparingWebLogin(false);
      return;
    }

    let isMounted = true;

    setIsPreparingWebLogin(true);
    authAPI
      .getOAuthState()
      .then((state) => {
        if (!isMounted) return;
        setOauthState(state);
        sessionStorage.setItem("oauth_state", state);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to prefetch OAuth state", err);
        setOauthState(null);
        onError?.(
          new Error(
            `Could not reach the auth service at ${apiBaseUrl}. Google sign-in cannot start until /auth/oauth/state responds.`,
          ),
        );
      })
      .finally(() => {
        if (!isMounted) return;
        setIsPreparingWebLogin(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isNativePlatform]);

  const handleLogin = async () => {
    try {
      if (isNativePlatform) {
        await handleNativeLogin();
        return;
      }

      if (!oauthState) {
        throw new Error("Google OAuth state is not ready yet");
      }

      // Trigger login synchronously without awaiting APIs (prevents popups from being blocked on mobile)
      // @ts-ignore
      login({ state: oauthState });
    } catch (err) {
      console.error("Failed to initialize Google login:", err);
      if (axios.isAxiosError(err)) {
        const detail =
          typeof err.response?.data?.detail === "string"
            ? err.response.data.detail
            : err.message;
        onError?.(
          new Error(
            `${detail} (API base URL: ${apiBaseUrl}${err.config?.url || ""})`,
          ),
        );
        return;
      }
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const buttonText =
    text === "signin"
      ? "Sign in with Google"
      : text === "signup"
        ? "Sign up with Google"
        : "Continue with Google";

  return (
    <div className="relative w-full">
      {/* Custom styled button */}
      <button
        type="button"
        onClick={handleLogin}
        disabled={
          disabled || isLoading || (!isNativePlatform && isPreparingWebLogin)
        }
        className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 dark:border-zinc-600 rounded-lg shadow-sm bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading || (!isNativePlatform && isPreparingWebLogin) ? (
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        )}
        <span className="text-gray-700 dark:text-gray-200 font-medium">
          {buttonText}
        </span>
      </button>
    </div>
  );
}
