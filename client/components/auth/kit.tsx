"use client";

// Pieces of the sign-in and enrolment "slips" (Sign In and Enrol v2.dc.html).
// Sizes follow the prototype: the slips shrink on short screens so they fit
// without scrolling; useAuthLayout returns them as CSS variables.

import Link from "next/link";
import { useId, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Select from "@/components/court/select";
import { useViewport } from "@/hooks/use-viewport";
import { cn } from "@/lib/utils";

export type AuthScreen = "login" | "register" | "otp" | "practice" | "forgot";

export function useAuthLayout(screen: AuthScreen, inJourney = false) {
  const { w, h } = useViewport();
  const wide = w >= 920;
  const mob = w < 560;
  const tight = mob || h < 800;
  const lt = (screen === "login" && h < 960) || (screen === "register" && h < 1000);
  const comp = (screen === "login" && h < 860) || (screen === "register" && h < 920);
  const side = mob ? "18px" : "5vw";

  const vars = {
    "--ih": comp ? "42px" : tight || lt ? "46px" : "52px",
    "--bh": comp ? "46px" : tight ? "50px" : "56px",
    "--fg": comp ? "10px" : tight || lt ? "14px" : "20px",
    "--h2": comp ? "24px" : tight ? "26px" : "32px",
    "--rm": comp ? "34px" : "44px",
    "--paper-pad": mob ? "18px 18px 22px" : comp ? "16px 32px 18px" : tight ? "24px 32px 28px" : "32px 40px 36px",
    "--main-pad": mob ? "8px 14px 20px" : comp ? `4px ${side} 12px` : tight ? `12px ${side} 24px` : `24px ${side} 40px`,
    "--hdr-pad": tight ? `14px ${side} 4px` : `22px ${side} 10px`,
  } as CSSProperties;

  const cols = !wide
    ? "minmax(0,1fr)"
    : screen === "register" || screen === "login"
      ? "minmax(0,1fr) minmax(0,460px)"
      : inJourney
        ? "260px minmax(0,560px)"
        : "minmax(0,480px)";
  const gap = !wide ? "0px" : inJourney && screen !== "register" ? "64px" : "6vw";

  return { wide, mob, tight, comp, showSub: !tight && !comp, vars, cols, gap };
}

/** Page frame: wordmark, the "Enrol" / "Sign in" switch, and the centred grid. */
export function AuthShell({
  layout,
  switchLink,
  children,
}: {
  layout: ReturnType<typeof useAuthLayout>;
  switchLink?: { label: string; href: string };
  children: ReactNode;
}) {
  return (
    <div
      style={layout.vars}
      className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_80%_60%_at_70%_20%,var(--desk-glow)_0%,var(--desk-bg)_70%)] font-type text-desk-ink"
    >
      <header className="flex items-center justify-between gap-4 p-[var(--hdr-pad)]">
        <Link
          href="/"
          translate="no"
          aria-label="AI Courtroom home"
          className="-my-3.5 flex items-baseline gap-1.5 py-3.5"
        >
          <span className="whitespace-nowrap font-display text-[0.9375rem] tracking-[0.24em] text-desk-ink">
            AI COURTROOM
          </span>
          <span
            aria-hidden="true"
            className="h-0.5 w-[9px] bg-cursor [animation:ac-cursor_1.6s_steps(1,end)_infinite]"
          />
        </Link>
        {switchLink && (
          <Link
            href={switchLink.href}
            className="whitespace-nowrap py-2.5 text-label uppercase tracking-[0.2em] text-desk-muted hover:text-desk-hover"
          >
            {switchLink.label}
          </Link>
        )}
      </header>
      <main
        style={{ gridTemplateColumns: layout.cols, gap: layout.gap }}
        className="mx-auto grid w-full max-w-[1240px] flex-1 content-center items-center justify-center p-[var(--main-pad)]"
      >
        {children}
      </main>
    </div>
  );
}

/** Left-hand column on wide screens: kicker, H1 and a short paragraph or a list. */
export function AuthIntro({
  kicker,
  title,
  children,
  compact,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex max-w-[520px] flex-col", compact ? "gap-[26px]" : "gap-[22px] pt-12")}>
      <div className={cn("flex flex-col", compact ? "gap-3.5" : "gap-[22px]")}>
        <span className="text-label uppercase tracking-[0.3em] text-desk-red">{kicker}</span>
        <h1
          className={cn(
            "m-0 text-balance font-display font-normal",
            compact ? "text-[34px] leading-[1.05]" : "text-[clamp(44px,4.6vw,72px)] leading-[1.02]",
          )}
        >
          {title}
        </h1>
      </div>
      {children}
    </div>
  );
}

export function IntroText({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 max-w-[440px] text-pretty text-[17px] leading-[1.6] text-desk-soft">{children}</p>
  );
}

/** The paper slip: optional scalloped top edge, header strip, then the form. */
export function Slip({
  form,
  onSubmit,
  children,
  scallop = true,
  maxWidth = 460,
}: {
  form: [string, string];
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  scallop?: boolean;
  maxWidth?: number;
}) {
  return (
    <div className="flex w-full flex-col justify-self-center" style={{ maxWidth }}>
      {scallop && (
        <div
          aria-hidden="true"
          className="h-2.5 bg-paper [mask:radial-gradient(circle_at_9px_0,transparent_5px,#000_5.5px)_0_0/18px_10px_repeat-x]"
        />
      )}
      <form
        noValidate
        onSubmit={onSubmit}
        className="relative flex flex-col gap-[var(--fg)] overflow-hidden bg-paper p-[var(--paper-pad)] text-ink shadow-dialog"
      >
        <div className="flex flex-wrap justify-between gap-3 border-b-[3px] border-double border-ink pb-2.5 text-label font-bold uppercase tracking-[0.2em] text-ink-label">
          <span>{form[0]}</span>
          <span>{form[1]}</span>
        </div>
        {children}
      </form>
    </div>
  );
}

export function SlipHeading({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="m-0 font-display text-[length:var(--h2)] font-normal leading-[1.1]">{title}</h2>
      {sub && <p className="m-0 text-pretty text-body leading-[1.5] text-ink-muted">{sub}</p>}
    </div>
  );
}

const labelClass = "text-label font-bold uppercase tracking-[0.16em] text-ink-muted";

export const slipInput =
  "h-[var(--ih)] w-full min-w-0 rounded-none border-0 border-b-2 border-b-[rgba(18,13,9,.55)] bg-paper-alt px-3.5 font-data text-base text-ink outline-none placeholder:text-[#857661] focus:bg-paper-hi aria-[invalid=true]:border-b-error";

export function Field({
  id,
  label,
  error,
  hint,
  aside,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[7px]">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error && (
        <span id={`${id}-error`} className="text-meta text-error">
          {error}
        </span>
      )}
      {hint && <span className="text-[12.5px] leading-[1.45] text-ink-muted">{hint}</span>}
    </div>
  );
}

/**
 * Square paper checkbox used for "Keep me signed in" and the 18+ box. The label sits
 * beside the box (not inside it) so it may contain a link; clicking it toggles too.
 */
export function Check({
  id,
  checked,
  onToggle,
  invalid,
  children,
}: {
  id?: string;
  checked: boolean;
  onToggle: () => void;
  invalid?: boolean;
  children: ReactNode;
}) {
  const autoId = useId();
  const labelId = `${id ?? autoId}-label`;
  return (
    <div className="flex min-h-[var(--rm)] items-center gap-3 text-left text-body leading-[1.4] text-ink">
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-invalid={invalid || undefined}
        aria-labelledby={labelId}
        onClick={onToggle}
        className={cn(
          "flex h-[22px] w-[22px] flex-none cursor-pointer items-center justify-center border-2 font-data text-sm font-bold text-paper",
          invalid ? "border-error" : "border-ink",
          checked ? "bg-ink" : "bg-transparent",
        )}
      >
        <span aria-hidden="true">{checked ? "✓" : ""}</span>
      </button>
      <span id={labelId} onClick={onToggle} className="cursor-pointer">
        {children}
      </span>
    </div>
  );
}

export function Objection({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 bg-seal px-3.5 py-3 text-sm leading-[1.45] text-cream">
      <strong className="font-display text-body font-normal tracking-[0.06em]">OBJECTION.</strong>
      <span>{children}</span>
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 bg-ink px-3.5 py-3 text-sm leading-[1.45] text-paper">
      <strong className="font-display text-body font-normal tracking-[0.06em] text-amber-hi">NOTICE.</strong>
      <span>{children}</span>
    </div>
  );
}

/** Green confirmation strip ("Code sent by SMS.", "Email confirmed."). */
export function Confirm({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="bg-[#dfe6d2] px-3.5 py-2.5 text-sm leading-[1.45] text-[#1f4a28]">
      {children}
    </div>
  );
}

export function OrDivider({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-label uppercase tracking-[0.2em] text-ink-hint">
      <span className="h-px bg-ink/30" />
      <span className="whitespace-nowrap">{children}</span>
      <span className="h-px bg-ink/30" />
    </div>
  );
}

export const primaryButton =
  "flex h-[var(--bh)] w-full cursor-pointer items-center justify-center gap-3 bg-seal text-sm font-bold uppercase tracking-[0.16em] text-cream hover:bg-seal-hover disabled:cursor-wait";

export const outlineButton =
  "flex h-[var(--ih)] w-full cursor-pointer items-center justify-center gap-3 whitespace-nowrap border-[1.5px] border-ink bg-transparent text-meta font-bold uppercase tracking-[0.12em] text-ink hover:bg-paper-hi disabled:cursor-wait disabled:opacity-60";

export const textLink =
  "relative cursor-pointer border-b border-seal bg-transparent p-0 font-bold text-seal before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] hover:border-ink hover:text-ink";

/** "No account yet? Enrol as an advocate" footer line. */
export function SlipFoot({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-ink/20 pt-4 text-body leading-[1.5] text-ink-muted">
      {children}
    </p>
  );
}

// --- Enrolment journey: I Enrol · II Verify · III Seat of practice ---------

export interface JourneyProps {
  current: 0 | 1 | 2;
  viaPhone?: boolean;
  viaGoogle?: boolean;
}

function journeySteps({ current, viaPhone, viaGoogle }: JourneyProps) {
  const titles = ["Enrol", viaPhone ? "Confirm number" : "Confirm email", "Seat of practice"];
  return titles.map((title, i) => ({
    n: ["I", "II", "III"][i],
    title,
    current: i === current,
    done: i < current,
    status: i === current ? "Now" : viaGoogle && i === 1 ? "Via Google" : i < current ? "Done ✓" : "Next",
  }));
}

/** The list beside the slip on wide screens. */
export function JourneyList(props: JourneyProps) {
  return (
    <ol className="m-0 flex w-full max-w-96 list-none flex-col border-t border-desk-rule-mid p-0">
      {journeySteps(props).map((s) => (
        <li
          key={s.n}
          aria-current={s.current ? "step" : undefined}
          className="grid grid-cols-[34px_1fr_auto] items-baseline gap-2 border-b border-desk-rule-mid py-[13px]"
        >
          <span className="font-display text-[17px] text-desk-amber">{s.n}</span>
          <span className={cn("text-base", s.current ? "text-desk-strong" : s.done ? "text-desk-ink" : "text-[#8f8574]")}>
            {s.title}
          </span>
          <span
            className={cn(
              "text-[10.5px] uppercase tracking-[0.18em]",
              s.current ? "text-desk-red" : s.done ? "text-desk-green" : "text-[#8f8574]",
            )}
          >
            {s.status}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** "Step II of III" with a 3-part bar, inside the slip on narrow screens. */
export function JourneyBar(props: JourneyProps) {
  const steps = journeySteps(props);
  const cur = steps[props.current];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between gap-2.5 text-label font-bold uppercase tracking-[0.16em] text-ink-muted">
        <span>Step {cur.n} of III</span>
        <span>{cur.title}</span>
      </div>
      <div aria-hidden="true" className="grid grid-cols-3 gap-1">
        {steps.map((s) => (
          <span key={s.n} className={cn("h-1", s.done ? "bg-ink" : s.current ? "bg-seal" : "bg-ink/18")} />
        ))}
      </div>
    </div>
  );
}

// --- Phone --------------------------------------------------------------------

const COUNTRY_CODES = [
  ["91", "IN +91"],
  ["1", "US +1"],
  ["44", "UK +44"],
  ["971", "AE +971"],
  ["65", "SG +65"],
  ["61", "AU +61"],
  ["49", "DE +49"],
  ["977", "NP +977"],
  ["880", "BD +880"],
  ["94", "LK +94"],
].map(([value, label]) => ({ value, label }));

/** Same rules as the server: digits only; +91 needs 10, other codes 6–14. */
export function phoneError(code: string, phone: string): string {
  const d = phone.replace(/[\s()-]/g, "");
  if (!d) return "Mobile number is required";
  if (!/^\d+$/.test(d)) return "Use digits only";
  if (code === "91" && d.length !== 10) return "Enter a 10-digit mobile number";
  if (d.length < 6 || d.length > 14) return "Enter a valid mobile number";
  return "";
}

export function formatPhone(code: string, phone: string) {
  const d = phone.replace(/\D/g, "");
  return `+${code} ${code === "91" && d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : d}`;
}

export function PhoneField({
  id,
  code,
  phone,
  onCode,
  onPhone,
  error,
}: {
  id: string;
  code: string;
  phone: string;
  onCode: (v: string) => void;
  onPhone: (v: string) => void;
  error?: string;
}) {
  return (
    <Field id={id} label="Mobile number" error={error} hint="We’ll text you a six-digit code. No password needed.">
      <div className="grid grid-cols-[minmax(0,112px)_minmax(0,1fr)] gap-2">
        <Select
          aria-label="Country code"
          value={code}
          onChange={onCode}
          options={COUNTRY_CODES}
          className={cn(slipInput, "px-3 text-[15px]")}
        />
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="98765 43210"
          value={phone}
          onChange={(e) => onPhone(e.target.value)}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={slipInput}
        />
      </div>
    </Field>
  );
}

export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" />
      <path fill="#FBBC05" d="M10.6 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-8 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
