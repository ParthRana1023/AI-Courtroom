"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import GoogleButton, { type GoogleAuthData } from "@/components/auth/google-button";
import {
  AuthIntro,
  AuthShell,
  Check,
  Field,
  formatPhone,
  IntroText,
  Notice,
  Objection,
  OrDivider,
  outlineButton,
  PhoneField,
  phoneError,
  primaryButton,
  Slip,
  SlipFoot,
  SlipHeading,
  slipInput,
  textLink,
  useAuthLayout,
} from "@/components/auth/kit";
import OtpStep from "@/components/auth/otp-step";
import PracticeStep from "@/components/auth/practice-step";
import { useAuth } from "@/contexts/auth-context";
import { needsSeatOfPractice, safeNext } from "@/lib/auth-redirect";
import { PHONE_AUTH_ENABLED } from "@/lib/config";
import { getErrorDetail } from "@/lib/error-utils";
import type { User } from "@/types";

type Screen = "form" | "otp" | "practice";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { login, verifyLogin, loginWithGoogle, sendPhoneCode, verifyPhone } = useAuth();

  const [screen, setScreen] = useState<Screen>("form");
  const [via, setVia] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("91");
  const [phone, setPhone] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [admitted, setAdmitted] = useState(false);
  const toasted = useRef(false);

  const layout = useAuthLayout(screen === "practice" ? "practice" : screen === "otp" ? "otp" : "login");
  const viaPhone = PHONE_AUTH_ENABLED && via === "phone";
  const phoneBody = { phone_code: code, phone_number: phone, purpose: "login" as const };

  useEffect(() => {
    if (toasted.current) return;
    toasted.current = true;
    if (params.get("signedout") === "1") toast("You’ve been logged out.");
    if (params.get("deleted") === "1")
      toast("Your account has been deleted. You can recover it within 30 days by contacting us.", {
        duration: 6500,
      });
  }, [params]);

  const errors: Record<string, string> = viaPhone
    ? { l_phone: phoneError(code, phone) }
    : { l_email: email ? "" : "Email is required", l_password: password ? "" : "Password is required" };
  const err = (k: string) => (tried ? errors[k] || "" : "");

  const finish = (user: User) => {
    if (needsSeatOfPractice(user)) {
      setScreen("practice");
      return;
    }
    setAdmitted(true);
    window.setTimeout(() => router.replace(next), 1400);
  };

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const first = Object.entries(errors).find(([, v]) => v)?.[0];
    if (first) {
      setTried(true);
      document.getElementById(first)?.focus();
      return;
    }
    setBusy(true);
    setFormErr("");
    try {
      if (viaPhone) await sendPhoneCode(phoneBody);
      else await login(email.trim(), password, remember);
      setScreen("otp");
    } catch (error) {
      setFormErr(getErrorDetail(error) ?? "Couldn’t sign you in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const google = async (data: GoogleAuthData) => {
    setFormErr("");
    try {
      const result = await loginWithGoogle(data, remember);
      if ("newUser" in result) {
        sessionStorage.setItem("googleUserData", JSON.stringify(result.newUser));
        router.push(`/register?google=1&next=${encodeURIComponent(next)}`);
      } else finish(result.user);
    } catch (error) {
      setFormErr(getErrorDetail(error) ?? "Google sign-in failed. Please try again.");
    }
  };

  const switchVia = () => {
    setVia(viaPhone ? "email" : "phone");
    setTried(false);
    setFormErr("");
  };

  if (screen === "practice") {
    return (
      <AuthShell layout={layout}>
        <PracticeStep onDone={() => router.replace(next)} />
      </AuthShell>
    );
  }

  if (screen === "otp") {
    return (
      <AuthShell layout={layout} switchLink={{ label: "Enrol", href: "/register" }}>
        <OtpStep
          title={viaPhone ? "Check your phone" : "Check your email"}
          destination={viaPhone ? formatPhone(code, phone) : email.trim()}
          sentMessage={viaPhone ? "Code sent by SMS." : "OTP sent successfully to your email."}
          backLabel="Use a different email"
          onBack={() => setScreen("form")}
          onResend={() => (viaPhone ? sendPhoneCode(phoneBody) : login(email.trim(), password, remember))}
          onVerify={async (otp) => {
            const user = viaPhone
              ? await verifyPhone(phoneBody, otp, remember)
              : await verifyLogin(email.trim(), otp, remember);
            finish(user);
          }}
          admittedLine={admitted ? "Welcome back, counsel. Taking you to your cases…" : undefined}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell layout={layout} switchLink={{ label: "Enrol", href: "/register" }}>
      {layout.wide && (
        <AuthIntro kicker="Chambers · Sign in" title="THE COURT IS IN SESSION.">
          <IntroText>
            Sign in to pick up your cases where you left them. After your password, we email you a
            six-digit code to confirm it’s you.
          </IntroText>
        </AuthIntro>
      )}
      <Slip form={["Form A-1", "Admission to chambers"]} onSubmit={submit}>
        <SlipHeading title="Sign the register" sub={layout.showSub ? "Welcome back, counsel." : undefined} />
        {params.get("session") === "expired" && !formErr && (
          <Notice>Your session has expired. Please sign in again.</Notice>
        )}
        {formErr && <Objection>{formErr}</Objection>}

        {viaPhone ? (
          <PhoneField id="l_phone" code={code} phone={phone} onCode={setCode} onPhone={setPhone} error={err("l_phone")} />
        ) : (
          <>
            <Field id="l_email" label="Email address" error={err("l_email")}>
              <input
                id="l_email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!err("l_email") || undefined}
                className={slipInput}
              />
            </Field>
            <Field
              id="l_password"
              label="Password"
              error={err("l_password")}
              aside={
                <Link
                  href={`/forgot-password${email ? `?email=${encodeURIComponent(email.trim())}` : ""}`}
                  className="relative border-b border-seal/50 py-1 text-meta text-seal before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] hover:border-ink hover:text-ink"
                >
                  Forgot password?
                </Link>
              }
            >
              <div className="relative">
                <input
                  id="l_password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!err("l_password") || undefined}
                  className={`${slipInput} pr-19.5`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute bottom-0.5 right-0 top-0 min-w-17.5 cursor-pointer bg-transparent text-label font-bold uppercase tracking-[0.14em] text-ink-muted hover:text-seal"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </Field>
          </>
        )}

        <Check checked={remember} onToggle={() => setRemember((r) => !r)}>
          Keep me signed in on this device
        </Check>

        <button type="submit" disabled={busy} className={primaryButton}>
          {viaPhone
            ? busy
              ? "Sending code…"
              : "Send code →"
            : busy
              ? "Checking the register…"
              : "Enter the court →"}
        </button>

        <OrDivider>or continue with</OrDivider>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2">
          <GoogleButton onSuccess={google} onError={setFormErr} disabled={busy} />
          {PHONE_AUTH_ENABLED && (
            <button type="button" onClick={switchVia} className={outlineButton}>
              {viaPhone ? "Email" : "Phone"}
            </button>
          )}
        </div>

        <SlipFoot>
          <span>No account yet?</span>
          <Link href="/register" className={textLink}>
            Enrol as an advocate
          </Link>
        </SlipFoot>
      </Slip>
    </AuthShell>
  );
}
