"use client";

import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { Loader2 } from "lucide-react";
import { useRef } from "react";

interface GoogleSignInButtonProps {
  onSuccess: (credential: string) => Promise<void>;
  onError?: () => void;
  text?: "signin" | "signup" | "continue";
  isLoading?: boolean;
  disabled?: boolean;
}

export default function GoogleSignInButton({
  onSuccess,
  onError,
  text = "signin",
  isLoading = false,
  disabled = false,
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleGoogleSuccess = async (
    credentialResponse: CredentialResponse
  ) => {
    if (credentialResponse.credential) {
      await onSuccess(credentialResponse.credential);
    }
  };

  const handleGoogleError = () => {
    onError?.();
  };

  const buttonText =
    text === "signin"
      ? "Sign in with Google"
      : text === "signup"
      ? "Sign up with Google"
      : "Continue with Google";

  const handleCustomButtonClick = () => {
    // Find and click the hidden Google button
    const googleButton = containerRef.current?.querySelector(
      'div[role="button"]'
    ) as HTMLElement;
    if (googleButton) {
      googleButton.click();
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Custom styled button */}
      <button
        type="button"
        onClick={handleCustomButtonClick}
        disabled={disabled || isLoading}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 dark:border-zinc-600 rounded-lg shadow-sm bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
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

      {/* Hidden actual Google Login button */}
      <div className="absolute opacity-0 pointer-events-none top-0 left-0">
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={handleGoogleError}
          useOneTap={false}
          auto_select={false}
        />
      </div>
    </div>
  );
}
