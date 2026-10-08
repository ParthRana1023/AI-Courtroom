"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { getErrorDetail } from "@/lib/error-utils";
import { cn } from "@/lib/utils";
import { Confirm, JourneyBar, primaryButton, Slip, SlipHeading, type JourneyProps } from "./kit";

const EMPTY = ["", "", "", "", "", ""];
const RESEND_SECONDS = 30;

/** Form S-3 "Seal of the court": six digit boxes, paste, Backspace, 30s resend timer. */
export default function OtpStep({
  title,
  destination,
  sentMessage,
  journey,
  backLabel,
  onBack,
  onVerify,
  onResend,
  admittedLine,
}: {
  title: string;
  destination: string;
  sentMessage: string;
  /** Shown as a bar inside the slip (narrow screens during enrolment). */
  journey?: JourneyProps;
  backLabel: string;
  onBack: () => void;
  /** Throw to show the server's message under the boxes. */
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  /** Set once verified to show the ADMITTED stamp instead of the form. */
  admittedLine?: string;
}) {
  const [digits, setDigits] = useState(EMPTY);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(sentMessage);
  const [busy, setBusy] = useState(false);
  const [timer, setTimer] = useState(RESEND_SECONDS);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    boxes.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (timer <= 0) return;
    const t = window.setTimeout(() => setTimer((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [timer]);

  const verify = async (code: string[]) => {
    if (busy) return;
    if (code.some((d) => !d)) {
      setError("Please enter the complete OTP.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onVerify(code.join(""));
    } catch (err) {
      setError(getErrorDetail(err) ?? "That code didn’t work. Please try again.");
      setDigits(EMPTY);
      boxes.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  const fillFrom = (i: number, typed: string) => {
    const next = [...digits];
    for (let k = 0; k < typed.length && i + k < 6; k++) next[i + k] = typed[k];
    setDigits(next);
    setError("");
    boxes.current[Math.min(i + typed.length, 5)]?.focus();
    if (next.every(Boolean)) void verify(next);
  };

  const resend = async () => {
    if (timer > 0 || busy) return;
    try {
      await onResend();
      setDigits(EMPTY);
      setError("");
      setMessage("New OTP sent successfully.");
      setTimer(RESEND_SECONDS);
      boxes.current[0]?.focus();
    } catch (err) {
      setError(getErrorDetail(err) ?? "Couldn’t send a new code. Please try again.");
    }
  };

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    void verify(digits);
  };

  return (
    <Slip form={["Form S-3", "Seal of the court"]} onSubmit={submit} maxWidth={480}>
      {journey && <JourneyBar {...journey} />}
      {admittedLine ? (
        <div className="flex flex-col items-start gap-4.5 pb-2 pt-4.5">
          <span className="inline-block -rotate-5 border-4 border-double border-seal px-4.5 pb-1.5 pt-2 font-display text-[44px] leading-none tracking-[0.08em] text-seal">
            ADMITTED
          </span>
          <p role="status" className="m-0 text-base leading-[1.55] text-ink-muted">
            {admittedLine}
          </p>
        </div>
      ) : (
        <>
          <SlipHeading
            title={title}
            sub={
              <>
                Enter the six-digit code we sent to{" "}
                <strong className="break-all font-data text-sm font-medium text-ink">{destination}</strong>
              </>
            }
          />
          {message && <Confirm>{message}</Confirm>}
          <div className="flex flex-col gap-2.25">
            <span id="otp-label" className="text-label font-bold uppercase tracking-[0.16em] text-ink-muted">
              Verification code
            </span>
            <div role="group" aria-labelledby="otp-label" className="flex gap-2">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    boxes.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  aria-label={`Digit ${i + 1} of 6`}
                  aria-invalid={(!!error && !d) || undefined}
                  value={d}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const typed = e.target.value.replace(/\D/g, "");
                    if (!typed) {
                      setDigits((cur) => cur.map((v, k) => (k === i ? "" : v)));
                      return;
                    }
                    // Typing over a filled box gives two digits; keep the new one.
                    const fresh = typed.length === 2 && d && typed.includes(d) ? typed.replace(d, "") : typed;
                    fillFrom(i, fresh.slice(0, 6 - i));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !d && i > 0) {
                      e.preventDefault();
                      setDigits((cur) => cur.map((v, k) => (k === i - 1 ? "" : v)));
                      boxes.current[i - 1]?.focus();
                    } else if (e.key === "ArrowLeft" && i > 0) {
                      e.preventDefault();
                      boxes.current[i - 1]?.focus();
                    } else if (e.key === "ArrowRight" && i < 5) {
                      e.preventDefault();
                      boxes.current[i + 1]?.focus();
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
                    if (pasted) fillFrom(i, pasted.slice(0, 6 - i));
                  }}
                  className={cn(
                    "h-16 min-w-0 max-w-15 flex-1 rounded-none border-0 border-b-[3px] bg-paper-alt p-0 text-center font-data text-[26px] font-medium text-ink outline-none focus:border-b-seal focus:bg-paper-hi",
                    error && !d ? "border-b-error" : d ? "border-b-ink" : "border-b-[rgba(18,13,9,.55)]",
                  )}
                />
              ))}
            </div>
            {error && (
              <span role="alert" className="text-meta text-error">
                {error}
              </span>
            )}
          </div>
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Verifying…" : "Verify code"}
          </button>
          <div className="flex flex-wrap justify-between gap-x-4.5 gap-y-2.5 border-t border-ink/20 pt-3.5 text-sm text-ink-muted">
            <span className="flex flex-wrap items-baseline gap-1.5">
              <span>No code?</span>
              <button
                type="button"
                onClick={resend}
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
              onClick={onBack}
              className="cursor-pointer border-b border-ink/40 bg-transparent py-1.5 text-sm text-ink-muted hover:text-ink"
            >
              {backLabel}
            </button>
          </div>
        </>
      )}
    </Slip>
  );
}
