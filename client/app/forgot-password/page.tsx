"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AuthShell,
  Field,
  Objection,
  primaryButton,
  Slip,
  SlipFoot,
  SlipHeading,
  slipInput,
  textLink,
  useAuthLayout,
} from "@/components/auth/kit";
import { authAPI } from "@/lib/api";
import { getErrorDetail } from "@/lib/error-utils";
import { cn } from "@/lib/utils";

type Step = "email" | "sent" | "new" | "done";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The email a reset link is for (shown only; the server checks the signature). */
function emailInToken(token: string): string {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(part)) as { email?: string }).email ?? "";
  } catch {
    return "";
  }
}

export default function ForgotPasswordPage() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const layout = useAuthLayout("forgot");

  const [step, setStep] = useState<Step>(token ? "new" : "email");
  const [email, setEmail] = useState(token ? emailInToken(token) : (params.get("email") ?? ""));
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    if (timer <= 0) return;
    const t = window.setTimeout(() => setTimer((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [timer]);

  const trimmed = email.trim();
  const emailErr = tried && step === "email" ? (!trimmed ? "Email is required" : EMAIL.test(trimmed) ? "" : "Enter a valid email address") : "";
  const pwErr = tried && step === "new" && pw.length < 8 ? "Use at least 8 characters." : "";
  const cfErr = tried && step === "new" && confirm !== pw ? "Passwords don’t match." : "";

  const sendLink = async () => {
    setBusy(true);
    setFormErr("");
    try {
      await authAPI.forgotPassword(trimmed);
      setStep("sent");
      setTried(false);
      setTimer(30);
    } catch (err) {
      setFormErr(getErrorDetail(err) ?? "Couldn’t send the link. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    if (step === "email") {
      if (!trimmed || !EMAIL.test(trimmed)) {
        setTried(true);
        document.getElementById("f_email")?.focus();
        return;
      }
      await sendLink();
    } else if (step === "new") {
      if (pw.length < 8 || confirm !== pw) {
        setTried(true);
        document.getElementById(pw.length < 8 ? "f_pw" : "f_cf")?.focus();
        return;
      }
      setBusy(true);
      setFormErr("");
      try {
        await authAPI.resetPassword(token, pw);
        setStep("done");
      } catch (err) {
        setFormErr(getErrorDetail(err) ?? "Couldn’t save the new password. Please try again.");
      } finally {
        setBusy(false);
      }
    }
  };

  const formName = step === "new" ? "New credentials" : step === "done" ? "Credentials restored" : "Lost credentials";

  return (
    <AuthShell layout={layout} switchLink={{ label: "Sign in", href: "/login" }}>
      <Slip form={["Form R-2", formName]} onSubmit={submit}>
        {formErr && <Objection>{formErr}</Objection>}

        {step === "email" && (
          <>
            <SlipHeading
              title="Reset your password"
              sub="Enter the email you enrolled with. We’ll send a link to set a new password."
            />
            <Field id="f_email" label="Email address" error={emailErr}>
              <input
                id="f_email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!emailErr || undefined}
                className={slipInput}
              />
            </Field>
            <button type="submit" disabled={busy} className={primaryButton}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </>
        )}

        {step === "sent" && (
          <>
            <div role="status" className="flex flex-col gap-1.5">
              <h2 className="m-0 font-display text-(length:--h2) font-normal leading-[1.1]">Check your email</h2>
              <p className="m-0 text-pretty text-body leading-normal text-ink-muted">
                If an account exists for{" "}
                <strong className="break-all font-data text-sm font-medium text-ink">{trimmed}</strong>, we’ve sent a
                link to reset your password. It expires in 30 minutes.
              </p>
            </div>
            <div className="flex flex-wrap justify-between gap-x-4.5 gap-y-2.5 border-t border-ink/20 pt-3.5 text-sm text-ink-muted">
              <span className="flex flex-wrap items-baseline gap-1.5">
                <span>No email? Check spam, or</span>
                <button
                  type="button"
                  onClick={sendLink}
                  disabled={timer > 0 || busy}
                  className={cn(
                    "bg-transparent py-1.5 text-sm font-bold",
                    timer > 0 ? "cursor-default text-[#7a6c59]" : "cursor-pointer text-seal",
                  )}
                >
                  {timer > 0 ? `Resend in ${timer}s` : "Send it again"}
                </button>
              </span>
              <button
                type="button"
                onClick={() => setStep("email")}
                className="cursor-pointer border-b border-ink/40 bg-transparent py-1.5 text-sm text-ink-muted hover:text-ink"
              >
                Use a different email
              </button>
            </div>
          </>
        )}

        {step === "new" && (
          <>
            <SlipHeading
              title="Set a new password"
              sub={
                <>
                  For <strong className="break-all font-data text-sm font-medium text-ink">{email || "your account"}</strong>.
                  You’ll be signed out on other devices.
                </>
              }
            />
            {(
              [
                ["f_pw", "New password", pw, setPw, pwErr, "At least 8 characters."],
                ["f_cf", "Confirm new password", confirm, setConfirm, cfErr, ""],
              ] as const
            ).map(([id, label, value, set, error, help]) => (
              <Field key={id} id={id} label={label} error={error} hint={error ? undefined : help || undefined}>
                <input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  aria-invalid={!!error || undefined}
                  className={slipInput}
                />
              </Field>
            ))}
            <button type="submit" disabled={busy} className={primaryButton}>
              {busy ? "Saving…" : "Save new password"}
            </button>
          </>
        )}

        {step === "done" && (
          <>
            <div role="status" className="flex flex-col items-start gap-4.5 pb-1 pt-3">
              <span className="inline-block -rotate-5 border-4 border-double border-green px-4.5 pb-1.5 pt-2 font-display text-[40px] leading-none tracking-[0.08em] text-green">
                RESET
              </span>
              <p className="m-0 text-pretty text-base leading-[1.55] text-ink-muted">
                Your password has been changed. Sign in with your new password.
              </p>
            </div>
            <Link href="/login" className={primaryButton}>
              Sign in →
            </Link>
          </>
        )}

        {step !== "done" && (
          <SlipFoot>
            <span>Remembered it?</span>
            <Link href="/login" className={textLink}>
              Back to sign in
            </Link>
          </SlipFoot>
        )}
      </Slip>
    </AuthShell>
  );
}
