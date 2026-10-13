"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertDialog, Dialog } from "radix-ui";
import { PASSWORD_RULES } from "@/components/auth/kit";
import { useGoogleAuth, type GoogleAuthData } from "@/components/auth/google-button";
import { formatDate } from "@/components/cases/kit";
import { accountAPI, authAPI, caseAPI } from "@/lib/api";
import { getErrorDetail } from "@/lib/error-utils";
import { cn } from "@/lib/utils";
import type { DeviceSession, User } from "@/types";
import { LABEL, Lead, OUTLINE, SEAL, Section, SUNK, ago, deviceName } from "./kit";

// Settings.dc.html: Account & security, with the Connect Google and delete dialogs.

const OFFLINE = "You’re offline. Try again when you’re back online.";
const RULE = "flex flex-wrap items-start justify-between gap-x-5 gap-y-2.5 border-t border-ink/12 pt-4.5";
const SCRIM = "fixed inset-0 z-70 grid place-items-center bg-[rgba(7,5,4,.82)] p-4 animate-[ac-fade_.2s_ease_both] light:bg-[rgba(40,30,20,.5)]";
const CARD = "flex w-full max-w-115 flex-col bg-paper font-type text-ink shadow-dialog outline-none animate-[ac-rise_.32s_cubic-bezier(.2,.8,.2,1)_both]";
const HEAD = "flex justify-between gap-3 border-b-[3px] border-double border-ink px-5.5 pb-2.5 pt-3 text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-label";
const FOOT = "flex flex-wrap justify-end gap-2 border-t-[3px] border-double border-ink px-5.5 pb-4 pt-3";

const message = (e: unknown, fallback: string) => getErrorDetail(e) || fallback;
/** Server datetimes without a zone are UTC. */
const utc = (iso: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);

function phoneText(u: User) {
  const code = u.phone_code || "91";
  const n = u.phone_number ?? "";
  return `+${code} ${code === "91" && n.length === 10 ? `${n.slice(0, 5)} ${n.slice(5)}` : n}`;
}

export default function AccountSection({
  num,
  user,
  online,
  refreshUser,
}: {
  num: string;
  user: User;
  online: boolean;
  refreshUser: () => Promise<void>;
}) {
  const [note, setNote] = useState<{ t: string; ok: boolean } | null>(null);
  const noteTimer = useRef(0);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [pwOpen, setPwOpen] = useState(false);
  const [gOpen, setGOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  const say = useCallback((t: string, ok = true) => {
    window.clearTimeout(noteTimer.current);
    setNote({ t, ok });
    noteTimer.current = window.setTimeout(() => setNote(null), 4200);
  }, []);
  useEffect(() => () => window.clearTimeout(noteTimer.current), []);

  const loadSessions = useCallback(() => {
    accountAPI
      .sessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);
  useEffect(loadSessions, [loadSessions]);

  const phone = user.auth_method === "phone";
  const googleSignup = user.auth_method === "google";
  const other = phone ? "your phone" : "your email and password";
  const pwLine = phone
    ? `You sign in with a code texted to ${phoneText(user)}, so there’s no password.`
    : !user.has_password
      ? "You sign in with Google, so there’s no password."
      : user.password_changed_at
        ? `Last changed ${formatDate(user.password_changed_at)}.`
        : "You haven’t changed it since you enrolled.";
  const gLine = user.google_linked
    ? googleSignup
      ? `Connected as ${user.google_email ?? user.email}. You signed up with Google, so it stays connected.`
      : `Connected as ${user.google_email}. You can sign in with Google or ${other}.`
    : phone
      ? "Sign in with Google as well as your phone. If your account has no email yet, we’ll use your Google email."
      : "Sign in with Google as well as your email and password.";
  const exportedAt = user.data_export_requested_at;
  const exportedRecently = !!exportedAt && Date.now() - utc(exportedAt).getTime() < 86400000;
  const dataLine = !user.email
    ? "Add an email to your profile first: we send the ZIP file there."
    : exportedRecently
      ? `Requested ${formatDate(exportedAt)}. We’ve emailed the ZIP file to ${user.email}. You can ask again after a day.`
      : "Get a copy of your profile, cases (including archived ones), proceedings and settings as a ZIP file, sent to your email.";

  const guard = () => {
    if (online) return true;
    say(OFFLINE, false);
    return false;
  };

  const disconnect = async () => {
    if (!guard()) return;
    try {
      await accountAPI.unlinkGoogle();
      await refreshUser();
      say(`Google disconnected. Sign in with ${other} from now on.`);
    } catch (e) {
      say(message(e, "Couldn’t disconnect Google. Please try again."), false);
    }
  };
  const signOutOthers = async () => {
    if (!guard()) return;
    try {
      const { signed_out } = await accountAPI.signOutOthers();
      loadSessions();
      say(`Signed out of ${signed_out} other device${signed_out === 1 ? "" : "s"}.`);
    } catch (e) {
      say(message(e, "Couldn’t sign out your other devices. Please try again."), false);
    }
  };
  const requestData = async () => {
    if (!guard()) return;
    try {
      await accountAPI.requestExport();
      await refreshUser();
      say(`Requested. We’ll email your data to ${user.email}.`);
    } catch (e) {
      say(message(e, "Couldn’t request your data. Please try again."), false);
    }
  };

  return (
    <Section id="account" num={num} title="Account & security" className="gap-5.5">
      {note && (
        <div role="status" className={cn("px-3.5 py-2.5 text-sm leading-[1.45]", note.ok ? "bg-[#dfe6d2] text-[#1f4a28]" : "bg-seal text-cream")}>
          {note.t}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2.5">
          <span className="min-w-0 flex-[1_1_240px]">
            <Lead t="Password" d={pwLine} />
          </span>
          {user.has_password && !pwOpen && (
            <button type="button" onClick={() => setPwOpen(true)} className={OUTLINE}>
              Change password
            </button>
          )}
        </div>
        {pwOpen && (
          <PasswordForm
            online={online}
            onClose={() => setPwOpen(false)}
            onDone={async () => {
              setPwOpen(false);
              loadSessions();
              await refreshUser();
              say("Password updated. Your other devices have been signed out.");
            }}
          />
        )}
      </div>

      <div className={RULE}>
        <span className="min-w-0 flex-[1_1_280px]">
          <Lead t="Google account" d={gLine} />
        </span>
        {!user.google_linked && (
          <button type="button" onClick={() => guard() && setGOpen(true)} className={cn(OUTLINE, "flex items-center gap-2.5")}>
            <span aria-hidden="true" className="font-[Arial,sans-serif] text-[15px] font-bold tracking-normal text-seal">
              G
            </span>
            Connect Google
          </button>
        )}
        {user.google_linked && !googleSignup && (
          <button type="button" onClick={disconnect} className={cn(OUTLINE, "border-seal text-seal")}>
            Disconnect
          </button>
        )}
      </div>

      <div className={cn(RULE, "flex-col flex-nowrap gap-3")}>
        <div className="flex w-full flex-wrap items-start justify-between gap-x-5 gap-y-2.5">
          <span className="min-w-0 flex-[1_1_240px]">
            <Lead t="Signed-in devices" d="If you don’t recognise a device, sign it out and change your password." />
          </span>
          {sessions.length > 1 && (
            <button type="button" onClick={signOutOthers} className={OUTLINE}>
              Sign out other devices
            </button>
          )}
        </div>
        <ul className="m-0 flex w-full max-w-155 list-none flex-col border-t border-ink/20 p-0">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink/12 py-2.75">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[15px] font-bold">{s.current ? "This device" : deviceName(s.user_agent)}</span>
                <span className="text-[13px] text-ink-muted">
                  {[s.current ? deviceName(s.user_agent) : "", s.ip ? `IP ${s.ip}` : ""].filter(Boolean).join(" · ") || "Signed in"}
                </span>
              </span>
              <span className={cn("text-[10.5px] font-bold uppercase tracking-[0.16em]", s.current ? "text-green" : "text-ink-muted")}>
                {s.current ? "Active now" : ago(s.last_active)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className={RULE}>
        <span className="min-w-0 flex-[1_1_280px]">
          <Lead t="Download your data" d={dataLine} />
        </span>
        <button
          type="button"
          onClick={requestData}
          disabled={exportedRecently || !user.email}
          className={cn(OUTLINE, (exportedRecently || !user.email) && "border-ink/40 text-ink/40 hover:bg-transparent")}
        >
          {exportedRecently ? "Requested" : "Request my data"}
        </button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3 border-[1.5px] border-seal px-4.5 py-4">
        <span className="flex min-w-0 flex-[1_1_280px] flex-col gap-0.75">
          <span className="text-base font-bold text-seal">Delete account</span>
          <span className="text-pretty text-sm leading-[1.45] text-ink-label">
            Deletes your profile, every case including archived ones, all proceedings and evidence. We keep the account for 30 days, so you can contact us to recover
            it. After that it’s erased for good.
          </span>
        </span>
        <button type="button" onClick={() => setDelOpen(true)} className={cn(SEAL, "h-11 px-4")}>
          Delete account…
        </button>
      </div>

      {gOpen && (
        <GoogleDialog
          user={user}
          other={other}
          onClose={() => setGOpen(false)}
          onLinked={async (msg) => {
            setGOpen(false);
            await refreshUser();
            say(msg);
          }}
        />
      )}
      <DeleteDialog open={delOpen} user={user} online={online} onClose={() => setDelOpen(false)} />
    </Section>
  );
}

function PasswordForm({ online, onClose, onDone }: { online: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [v, setV] = useState({ cur: "", nw: "", cf: "" });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const broken = PASSWORD_RULES.find(([, ok]) => !ok(v.nw));
  const errs = {
    cur: tried && !v.cur ? "Enter your current password." : "",
    nw: tried ? (broken ? broken[2] : v.nw === v.cur ? "Choose a password you haven’t used here." : "") : "",
    cf: tried && v.cf !== v.nw ? "Passwords don’t match." : "",
  };
  const fields: [keyof typeof v, string, string, string, string][] = [
    ["cur", "pw-cur", "Current password", "current-password", ""],
    ["nw", "pw-new", "New password", "new-password", "At least 8 characters, with a letter, a digit and one of @$!%*#?&."],
    ["cf", "pw-cf", "Confirm new password", "new-password", ""],
  ];
  useEffect(() => document.getElementById("pw-cur")?.focus(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    setError("");
    if (!v.cur || broken || v.nw === v.cur || v.cf !== v.nw) return;
    if (!online) return setError("You’re offline. Your password wasn’t changed.");
    setBusy(true);
    try {
      await accountAPI.changePassword(v.cur, v.nw);
      await onDone();
    } catch (err) {
      setError(message(err, "Couldn’t change your password. Please try again."));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Change password" className="flex max-w-130 flex-col gap-3.5 border border-ink/15 bg-[#f8f3e7] px-4.5 py-4">
      {fields.map(([k, id, label, ac, help]) => (
        <div key={k} className="flex flex-col gap-1.75">
          <label htmlFor={id} className={LABEL}>
            {label}
          </label>
          <input
            id={id}
            type="password"
            autoComplete={ac}
            value={v[k]}
            onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))}
            aria-invalid={!!errs[k]}
            className={cn(SUNK, errs[k] && "border-error")}
          />
          {(errs[k] || help) && <span className={cn("text-[13px]", errs[k] ? "text-error" : "text-ink-muted")}>{errs[k] || help}</span>}
        </div>
      ))}
      {error && (
        <span role="alert" className="text-[13.5px] text-error">
          {error}
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={cn(SEAL, "flex-[1_1_200px]")}>
          {busy ? "Updating…" : "Update password"}
        </button>
        <button type="button" onClick={onClose} className={cn(OUTLINE, "h-11.5 hover:bg-paper")}>
          Cancel
        </button>
      </div>
      <Link href="/forgot-password" className="self-start border-b border-ink/40 text-sm text-ink-muted hover:text-seal">
        Forgot your current password?
      </Link>
    </form>
  );
}

/** Connect Google: Google's own account picker, then (if the emails differ) which email to keep. */
function GoogleDialog({
  user,
  other,
  onClose,
  onLinked,
}: {
  user: User;
  other: string;
  onClose: () => void;
  onLinked: (msg: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState<{ email: string; token: string } | null>(null);
  const [swap, setSwap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const done = async (linked: User, picked: string) => {
    const was = user.email;
    const now = linked.email;
    await onLinked(
      !was
        ? `Google connected. ${now} is now your account email.`
        : now !== was
          ? `Google connected. Your account email is now ${now}.`
          : picked === was
            ? "Google connected. You can now sign in with Google."
            : `Google connected. Your account email stays ${was}.`,
    );
  };

  const google = useGoogleAuth({
    onSuccess: async (data: GoogleAuthData) => {
      setBusy(true);
      setError("");
      try {
        const r = await accountAPI.linkGoogle(data);
        if ("needs_choice" in r) {
          setChoice({ email: r.google_email, token: r.link_token });
          setSwap(false);
        } else await done(r, r.google_email ?? "");
      } catch (e) {
        setError(message(e, "Couldn’t connect Google. Please try again."));
      } finally {
        setBusy(false);
      }
    },
    onError: setError,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!choice) return void google.start();
    setBusy(true);
    setError("");
    try {
      const r = await accountAPI.linkGoogle({ link_token: choice.token, use_google_email: swap });
      if (!("needs_choice" in r)) await done(r, choice.email);
    } catch (err) {
      setError(message(err, "Couldn’t connect Google. Please try again."));
      setBusy(false);
    }
  };

  const options: [boolean, string, string][] = choice
    ? [
        [false, user.email ?? "", "Keep my current email. Google is only another way to sign in."],
        [true, choice.email, "Use my Google email for codes and replies from now on."],
      ]
    : [];

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={SCRIM}>
          <Dialog.Content aria-describedby={undefined} asChild>
            <form onSubmit={submit} noValidate className={cn(CARD, "max-h-[calc(100dvh-32px)] overflow-y-auto")} data-scroller="">
              <div className={HEAD}>
                <span>Form G-2</span>
                <span>Connect an account</span>
              </div>
              <div className="flex flex-col gap-3.5 px-5.5 py-5">
                <Dialog.Title className="m-0 font-display text-[26px] font-normal leading-[1.1]">
                  {choice ? "Different email address" : "Connect your Google account"}
                </Dialog.Title>
                {!choice ? (
                  <p className="m-0 text-pretty text-[15px] leading-[1.55] text-ink-label">
                    Google will ask you to choose an account and allow AI Courtroom to see its name and email. After that you can sign in with Google as well as {other}.
                  </p>
                ) : (
                  <>
                    <p className="m-0 text-pretty text-[15px] leading-[1.55] text-ink-label">
                      This Google account uses <strong className="wrap-anywhere text-ink">{choice.email}</strong>, but your AI Courtroom account email is{" "}
                      <strong className="wrap-anywhere text-ink">{user.email}</strong>. You can connect it either way. Which email should we use for sign-in codes and
                      replies?
                    </p>
                    <div role="radiogroup" aria-label="Account email" className="flex flex-col gap-2">
                      {options.map(([v, t, d]) => {
                        const on = swap === v;
                        return (
                          <button
                            key={String(v)}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setSwap(v)}
                            className={cn("flex cursor-pointer items-start gap-3 border-[1.5px] border-ink px-3.5 py-3 text-left text-ink", on ? "bg-[#f8f3e7]" : "bg-transparent")}
                          >
                            <span
                              aria-hidden="true"
                              className={cn("mt-0.5 h-4.5 w-4.5 flex-none rounded-full border-[1.5px] border-ink", on && "bg-ink shadow-[inset_0_0_0_3px_#f8f3e7]")}
                            />
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="wrap-anywhere text-[14.5px] font-bold">{t}</span>
                              <span className="text-[13px] leading-[1.45] text-ink-muted">{d}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                {error && (
                  <span role="alert" className="text-[13.5px] text-error">
                    {error}
                  </span>
                )}
              </div>
              <div className={FOOT}>
                <Dialog.Close type="button" className={cn(OUTLINE, "h-11.5")}>
                  Cancel
                </Dialog.Close>
                <button type="submit" disabled={busy || (!choice && !google.ready)} className={SEAL}>
                  {busy ? "Connecting…" : choice ? "Connect Google" : "Continue with Google"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** "Strike off the roll": password, or a code for accounts without one, then typed DELETE. */
function DeleteDialog({ open, user, online, onClose }: { open: boolean; user: User; online: boolean; onClose: () => void }) {
  const phone = user.auth_method === "phone";
  const both = !!user.has_password && !!user.google_linked;
  const [useCode, setUseCode] = useState(!user.has_password);
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [sentAt, setSentAt] = useState(0);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cases, setCases] = useState<number | null>(null);

  // Each opening starts clean and counts the cases it would delete.
  useEffect(() => {
    if (!open) return;
    setUseCode(!user.has_password);
    setPw("");
    setCode("");
    setTyped("");
    setSentAt(0);
    setError("");
    setBusy(false);
    Promise.all([caseAPI.listCases(), caseAPI.listDeletedCases().catch(() => [])])
      .then(([live, gone]: unknown[][]) => setCases(live.length + gone.length))
      .catch(() => setCases(null));
  }, [open, user.has_password]);

  useEffect(() => {
    if (!sentAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [sentAt]);
  const wait = sentAt ? Math.max(0, 30 - Math.floor(((now || sentAt) - sentAt) / 1000)) : 0;
  const ready = typed === "DELETE" && (useCode ? /^\d{6}$/.test(code) && !!sentAt : !!pw) && !busy;
  const where = phone ? phoneText(user) : user.email;

  const send = async () => {
    if (!online) return setError("You’re offline. We couldn’t send the code.");
    setSending(true);
    setError("");
    try {
      await accountAPI.sendDeleteCode();
      const t = Date.now();
      setSentAt(t);
      setNow(t);
      window.setTimeout(() => document.getElementById("del-code")?.focus(), 40);
    } catch (e) {
      setError(message(e, "Couldn’t send the code. Please try again."));
    } finally {
      setSending(false);
    }
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    if (!online) return setError("You’re offline. Your account wasn’t deleted.");
    setBusy(true);
    setError("");
    try {
      await accountAPI.deleteAccount(useCode ? { code } : { password: pw });
      await authAPI.logout();
      window.location.replace("/login?deleted=1");
    } catch (err) {
      setError(message(err, "Couldn’t delete your account. Please try again."));
      setBusy(false);
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={SCRIM}>
          <AlertDialog.Content
            asChild
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              document.getElementById(user.has_password ? "del-pw" : "del-send")?.focus();
            }}
          >
            <form onSubmit={confirm} noValidate className={cn(CARD, "max-h-[calc(100dvh-32px)] overflow-y-auto")} data-scroller="">
              <div className={cn(HEAD, "text-[11px] tracking-[0.2em]")}>
                <span>Form X-9</span>
                <span>Strike off the roll</span>
              </div>
              <div className="flex flex-col gap-3.5 px-5.5 py-5">
                <AlertDialog.Title className="m-0 font-display text-[26px] font-normal leading-[1.1]">Delete your account?</AlertDialog.Title>
                <AlertDialog.Description className="m-0 text-pretty text-[15px] leading-[1.55] text-ink-label">
                  Your profile, {cases === null ? "your" : cases} case{cases === 1 ? "" : "s"}, their proceedings and evidence will be deleted and you’ll be signed out on
                  every device. We keep the account for 30 days:{" "}
                  <Link href="/contact?cat=account_recovery" className="border-b border-seal text-seal hover:text-ink">
                    contact us
                  </Link>{" "}
                  within that time to recover it. After 30 days it’s erased for good. To keep a copy, request your data first.
                </AlertDialog.Description>
                {error && (
                  <div role="alert" className="bg-seal px-3.5 py-2.5 text-sm leading-[1.45] text-cream">
                    {error}
                  </div>
                )}
                {useCode ? (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="del-code" className={LABEL}>
                      {phone ? "Code from your phone" : "Code from your email"}
                    </label>
                    <span className="text-pretty text-[13.5px] leading-normal text-ink-muted">
                      {phone
                        ? "You sign in with your phone, so there’s no password to check. We’ll text a six-digit code to"
                        : both
                          ? "We’ll email a six-digit code to"
                          : "You sign in with Google, so there’s no password to check. We’ll email a six-digit code to"}{" "}
                      <strong className="wrap-anywhere font-bold text-ink">{where}</strong>.
                    </span>
                    <div className="flex flex-wrap items-stretch gap-2">
                      <input
                        id="del-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="••••••"
                        value={code}
                        onChange={(e) => {
                          setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                          setError("");
                        }}
                        disabled={!sentAt}
                        aria-describedby="del-code-h"
                        className="h-12 min-w-0 flex-[1_1_150px] rounded-none border-0 border-b-[1.5px] border-ink bg-paper-alt px-3.5 font-data text-xl font-medium tracking-[0.4em] text-ink outline-none focus:bg-[#f8f3e7] disabled:cursor-not-allowed"
                      />
                      <button
                        id="del-send"
                        type="button"
                        onClick={send}
                        disabled={sending || wait > 0}
                        className={cn(
                          "h-12 flex-none cursor-pointer whitespace-nowrap border-[1.5px] border-ink px-4 text-[11px] font-bold uppercase tracking-[0.14em] disabled:cursor-default",
                          sentAt ? "bg-transparent text-ink" : "bg-ink text-paper",
                        )}
                      >
                        {sending ? "Sending…" : wait > 0 ? `Resend in ${wait}s` : sentAt ? "Resend code" : phone ? "Text me a code" : "Email me a code"}
                      </button>
                    </div>
                    <span id="del-code-h" role="status" className={cn("text-[12.5px]", code.length === 6 ? "text-green" : "text-ink-muted")}>
                      {!sentAt ? "Send the code first. It expires after 10 minutes." : code.length === 6 ? "Code entered." : "Code sent. Check your inbox and spam folder."}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.75">
                    <label htmlFor="del-pw" className={LABEL}>
                      Your password
                    </label>
                    <input
                      id="del-pw"
                      type="password"
                      autoComplete="current-password"
                      value={pw}
                      onChange={(e) => {
                        setPw(e.target.value);
                        setError("");
                      }}
                      className={SUNK}
                    />
                  </div>
                )}
                {both && (
                  <button
                    type="button"
                    onClick={() => {
                      setUseCode(!useCode);
                      setPw("");
                      setCode("");
                      setSentAt(0);
                      setError("");
                    }}
                    className="relative min-h-8 cursor-pointer self-start border-0 border-b border-seal bg-transparent p-0 text-left text-[13px] font-bold text-seal hover:border-ink hover:text-ink"
                  >
                    {useCode ? "Use my password instead" : "Forgot your password? Use an email code instead"}
                  </button>
                )}
                <div className="flex flex-col gap-1.75">
                  <label htmlFor="del-txt" className={LABEL}>
                    Type &quot;DELETE&quot; to confirm
                  </label>
                  <input
                    id="del-txt"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={typed}
                    onChange={(e) => {
                      setTyped(e.target.value.toUpperCase());
                      setError("");
                    }}
                    className={cn(SUNK, "font-medium tracking-[0.12em]")}
                  />
                </div>
              </div>
              <div className={cn(FOOT, "justify-start")}>
                <AlertDialog.Cancel type="button" className={cn(OUTLINE, "h-12 px-4.5")}>
                  Keep my account
                </AlertDialog.Cancel>
                <button type="submit" disabled={!ready} className={cn(SEAL, "h-12 flex-[1_1_200px]")}>
                  {busy ? "Deleting…" : "Delete my account"}
                </button>
              </div>
            </form>
          </AlertDialog.Content>
        </AlertDialog.Overlay>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
