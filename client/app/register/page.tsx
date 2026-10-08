"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import GoogleButton, { type GoogleAuthData } from "@/components/auth/google-button";
import {
  AuthIntro,
  AuthShell,
  Check,
  Field,
  formatPhone,
  IntroText,
  JourneyBar,
  JourneyList,
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
  type JourneyProps,
} from "@/components/auth/kit";
import OtpStep from "@/components/auth/otp-step";
import PracticeStep from "@/components/auth/practice-step";
import { useAuth, type GoogleSignupData } from "@/contexts/auth-context";
import { needsSeatOfPractice, safeNext } from "@/lib/auth-redirect";
import { PHONE_AUTH_ENABLED } from "@/lib/config";
import { getErrorDetail } from "@/lib/error-utils";
import { cn } from "@/lib/utils";
import type { RegisterFormData, User } from "@/types";

type Screen = "form" | "otp" | "practice";

const PASSWORD_RULES: [string, (p: string) => boolean, string][] = [
  ["8+ characters", (p) => p.length >= 8, "Password must be at least 8 characters"],
  ["A letter", (p) => /[a-zA-Z]/.test(p), "Password must contain at least 1 letter"],
  ["A digit", (p) => /\d/.test(p), "Password must contain at least 1 digit"],
  ["A symbol @$!%*#?&", (p) => /[@$!%*#?&]/.test(p), "Password must contain at least 1 special character"],
];

export default function RegisterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { register, verifyRegistration, loginWithGoogle, sendPhoneCode, verifyPhone } = useAuth();

  const [screen, setScreen] = useState<Screen>("form");
  const [via, setVia] = useState<"email" | "phone">("email");
  const [google, setGoogle] = useState<GoogleSignupData | null>(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("91");
  const [phone, setPhone] = useState("");
  const [adult, setAdult] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [pwTip, setPwTip] = useState({ hover: false, focus: false });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [note, setNote] = useState("");

  // Arriving from "Google" on the sign-in page: the Google account is verified, so prefill it.
  useEffect(() => {
    if (params.get("google") !== "1") return;
    try {
      const data = JSON.parse(sessionStorage.getItem("googleUserData") ?? "null") as GoogleSignupData | null;
      if (!data) return;
      setGoogle(data);
      setFirst((v) => v || data.first_name);
      setLast((v) => v || data.last_name);
      setEmail(data.email);
    } catch {
      /* no usable hand-off; plain enrolment */
    }
  }, [params]);

  const viaPhone = PHONE_AUTH_ENABLED && via === "phone" && !google;
  const layout = useAuthLayout(screen === "form" ? "register" : screen, true);
  const journey: JourneyProps = {
    current: screen === "form" ? 0 : screen === "otp" ? 1 : 2,
    viaPhone,
    viaGoogle: !!google,
  };

  const payload: RegisterFormData = {
    first_name: first.trim(),
    last_name: last.trim(),
    email: email.trim(),
    password,
    confirm_adult: adult,
    google_signup_token: google?.google_signup_token,
    profile_photo_url: google?.profile_photo_url ?? undefined,
  };
  const phoneBody = {
    phone_code: code,
    phone_number: phone,
    purpose: "register" as const,
    first_name: first.trim(),
    last_name: last.trim(),
    confirm_adult: adult,
  };

  const badRule = PASSWORD_RULES.find(([, ok]) => !ok(password));
  const errors: Record<string, string> = {
    r_first_name: first.trim() ? "" : "First name is required",
    r_last_name: last.trim() ? "" : "Last name is required",
    ...(viaPhone
      ? { r_phone: phoneError(code, phone) }
      : {
          r_email: !email ? "Email is required" : /\S+@\S+\.\S+/.test(email) ? "" : "Email is invalid",
          r_password: !password ? "Password is required" : badRule ? badRule[2] : "",
        }),
    r_adult: adult ? "" : "You must be at least 18 years old to register",
  };
  const err = (k: string) => (tried ? errors[k] || "" : "");

  const toPractice = (message: string) => {
    setNote(message);
    setScreen("practice");
  };

  const afterSignIn = (user: User, message: string) =>
    needsSeatOfPractice(user) ? toPractice(message) : router.replace(next);

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const firstBad = Object.entries(errors).find(([, v]) => v)?.[0];
    if (firstBad) {
      setTried(true);
      document.getElementById(firstBad)?.focus();
      return;
    }
    setBusy(true);
    setFormErr("");
    try {
      if (viaPhone) {
        await sendPhoneCode(phoneBody);
        setScreen("otp");
      } else {
        const user = await register(payload);
        if (user) afterSignIn(user, `Welcome to the bar, ${first.trim()}.`);
        else setScreen("otp");
      }
    } catch (error) {
      setFormErr(getErrorDetail(error) ?? "Couldn’t enrol you. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const continueWithGoogle = async (data: GoogleAuthData) => {
    setFormErr("");
    try {
      const result = await loginWithGoogle(data);
      if ("newUser" in result) {
        setGoogle(result.newUser);
        setFirst(result.newUser.first_name);
        setLast(result.newUser.last_name);
        setEmail(result.newUser.email);
      } else router.replace(next); // already enrolled: signed in
    } catch (error) {
      setFormErr(getErrorDetail(error) ?? "Google sign-up failed. Please try again.");
    }
  };

  const intro = (
    <AuthIntro kicker="Enrolment" title="TAKE YOUR PLACE AT THE BAR." compact={screen !== "form"}>
      {screen === "form" && (
        <IntroText>Enrol in under a minute, confirm it’s you, and argue your first case before the bench.</IntroText>
      )}
      <JourneyList {...journey} />
    </AuthIntro>
  );
  const bar = layout.wide ? undefined : journey;

  if (screen === "practice") {
    return (
      <AuthShell layout={layout}>
        {layout.wide && intro}
        <PracticeStep note={note} journey={bar} onDone={() => router.replace(next)} />
      </AuthShell>
    );
  }

  if (screen === "otp") {
    return (
      <AuthShell layout={layout} switchLink={{ label: "Sign in", href: "/login" }}>
        {layout.wide && intro}
        <OtpStep
          title={viaPhone ? "Check your phone" : "Check your email"}
          destination={viaPhone ? formatPhone(code, phone) : payload.email}
          sentMessage={viaPhone ? "Code sent by SMS." : "OTP sent successfully to your email."}
          journey={bar}
          backLabel="Use a different email"
          onBack={() => setScreen("form")}
          onResend={async () => {
            if (viaPhone) await sendPhoneCode(phoneBody);
            else await register(payload);
          }}
          onVerify={async (otp) => {
            const user = viaPhone ? await verifyPhone(phoneBody, otp, false) : await verifyRegistration(payload, otp);
            afterSignIn(
              user,
              `${viaPhone ? "Number confirmed." : "Email confirmed."} Welcome to the bar, ${first.trim() || "counsel"}.`,
            );
          }}
        />
      </AuthShell>
    );
  }

  const tipOpen = pwTip.hover || pwTip.focus;
  const initials = `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() || "?";

  return (
    <AuthShell layout={layout} switchLink={{ label: "Sign in", href: "/login" }}>
      {layout.wide && intro}
      <Slip form={["Form E-2", "Enrolment of advocate"]} onSubmit={submit}>
        {bar && <JourneyBar {...bar} />}
        <SlipHeading
          title={google ? "Complete your enrolment" : "Enrol at the bar"}
          sub={
            layout.showSub
              ? google
                ? "Check your name and choose a password."
                : viaPhone
                  ? "Takes under a minute. We’ll text you a code to confirm your number."
                  : "Takes under a minute. We’ll email you a code to confirm it’s you."
              : undefined
          }
        />
        {google && (
          <div className="flex items-center gap-3.5 bg-paper-alt px-3.5 py-2.5">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-ink font-display text-[17px] text-paper"
            >
              {initials}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-bold">Signed in with Google</span>
              <span className="break-all font-data text-meta text-ink-muted">{google.email}</span>
            </div>
          </div>
        )}
        {formErr && <Objection>{formErr}</Objection>}

        <div className="grid grid-cols-2 gap-3">
          <Field id="r_first_name" label="First name" error={err("r_first_name")}>
            <input
              id="r_first_name"
              autoComplete="given-name"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              aria-invalid={!!err("r_first_name") || undefined}
              className={slipInput}
            />
          </Field>
          <Field id="r_last_name" label="Last name" error={err("r_last_name")}>
            <input
              id="r_last_name"
              autoComplete="family-name"
              value={last}
              onChange={(e) => setLast(e.target.value)}
              aria-invalid={!!err("r_last_name") || undefined}
              className={slipInput}
            />
          </Field>
        </div>

        {!google &&
          (viaPhone ? (
            <PhoneField id="r_phone" code={code} phone={phone} onCode={setCode} onPhone={setPhone} error={err("r_phone")} />
          ) : (
            <Field id="r_email" label="Email address" error={err("r_email")}>
              <input
                id="r_email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!err("r_email") || undefined}
                className={slipInput}
              />
            </Field>
          ))}

        {!viaPhone && (
          <Field id="r_password" label="Choose a password" error={err("r_password")}>
            <div
              className="relative"
              onMouseEnter={() => setPwTip((t) => ({ ...t, hover: true }))}
              onMouseLeave={() => setPwTip((t) => ({ ...t, hover: false }))}
            >
              <input
                id="r_password"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPwTip((t) => ({ ...t, focus: true }))}
                onBlur={() => setPwTip((t) => ({ ...t, focus: false }))}
                aria-invalid={!!err("r_password") || undefined}
                aria-describedby="pw-rules"
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
              <div
                id="pw-rules"
                role="tooltip"
                className={cn(
                  "absolute inset-x-0 bottom-[calc(100%+10px)] z-5 flex flex-col gap-1.5 bg-ink px-3.5 py-3 text-paper shadow-[0_18px_40px_rgba(0,0,0,.35)] transition-[opacity,transform,visibility] duration-150",
                  tipOpen ? "visible translate-y-0 opacity-100" : "invisible translate-y-1 opacity-0",
                )}
              >
                <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-amber-hi">Your password needs</span>
                <ul className="m-0 grid list-none grid-cols-2 gap-x-3.5 gap-y-1 p-0">
                  {PASSWORD_RULES.map(([label, ok]) => {
                    const met = ok(password);
                    return (
                      <li key={label} className={cn("flex items-baseline gap-2 text-meta leading-[1.35]", met ? "text-[#9fd0a4]" : "text-[#d8ccb4]")}>
                        <span aria-hidden="true" className="w-3 flex-none font-data text-meta font-bold">
                          {met ? "✓" : "○"}
                        </span>
                        <span>{label}</span>
                      </li>
                    );
                  })}
                </ul>
                <span
                  aria-hidden="true"
                  className="absolute left-6 top-full h-0 w-0 border-x-8 border-t-8 border-x-transparent border-t-ink"
                />
              </div>
            </div>
          </Field>
        )}

        <div className="flex flex-col gap-1">
          <Check id="r_adult" checked={adult} onToggle={() => setAdult((a) => !a)} invalid={!!err("r_adult")}>
            I’m 18 or older and agree to the{" "}
            <Link
              href="/terms"
              onClick={(e) => e.stopPropagation()}
              className="border-b border-seal text-seal hover:text-ink"
            >
              Terms of Service
            </Link>
          </Check>
          {err("r_adult") && <span className="text-meta text-error">{err("r_adult")}</span>}
        </div>

        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Filing…" : "Enrol →"}
        </button>

        {!google && (
          <>
            <OrDivider>or sign up with</OrDivider>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2">
              <GoogleButton onSuccess={continueWithGoogle} onError={setFormErr} disabled={busy} />
              {PHONE_AUTH_ENABLED && (
                <button
                  type="button"
                  onClick={() => {
                    setVia(viaPhone ? "email" : "phone");
                    setTried(false);
                    setFormErr("");
                  }}
                  className={outlineButton}
                >
                  {viaPhone ? "Email" : "Phone"}
                </button>
              )}
            </div>
          </>
        )}

        {!layout.comp && (
          <SlipFoot>
            <span>Already enrolled?</span>
            <Link href="/login" className={textLink}>
              Sign in
            </Link>
          </SlipFoot>
        )}
      </Slip>
    </AuthShell>
  );
}
