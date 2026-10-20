"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";
import Scroller from "@/components/court/scroller";
import { CLOSE, useReturnFocus } from "@/components/courtroom/dialogs";
import { useOnline } from "@/hooks/use-online";
import { accountAPI, authAPI, locationAPI } from "@/lib/api";
import { getCroppedImg } from "@/lib/crop-image";
import { getErrorDetail } from "@/lib/error-utils";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

// Edit profile panel and crop dialog (Profile.dc.html).

const TAG = "text-[10.5px] font-bold uppercase tracking-[0.18em]";
const LABEL = "text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted";
const HINT = "text-[12.5px] leading-[1.45] text-ink-meta";
const ERR = "text-[13px] text-error";
const FIELD =
  "h-11.5 w-full min-w-0 rounded-none border-[1.5px] bg-[#f8f3e7] px-3 text-[15px] text-ink outline-none focus:border-seal focus:shadow-[0_0_0_3px_rgba(142,31,25,.18)]";
const LOCKED = "cursor-not-allowed bg-paper-alt text-ink-hint";
const BTN = "h-11.5 cursor-pointer whitespace-nowrap px-4.5 text-xs font-bold uppercase tracking-[0.14em]";

export const GENDERS = [
  ["male", "Male"],
  ["female", "Female"],
  ["others", "Others"],
  ["prefer-not-to-say", "Prefer not to say"],
] as const;

const CODES = [
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
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const digitsOf = (phone: string) => phone.replace(/[\s()-]/g, "");

interface Form {
  first: string;
  last: string;
  nick: string;
  gender: string;
  dob: string;
  email: string;
  code: string;
  phone: string;
  city: string;
  state: string;
  country: string;
}

const fromUser = (u: User): Form => ({
  first: u.first_name ?? "",
  last: u.last_name ?? "",
  nick: u.nickname ?? "",
  gender: u.gender ?? "",
  dob: u.date_of_birth ?? "",
  email: u.email ?? "",
  code: u.phone_code || "91",
  phone: u.phone_number ?? "",
  city: u.city ?? "",
  state: u.state ?? "",
  country: u.country ?? "",
});

/** What's wrong with the form, field by field ("" when fine). */
function problems(f: Form, phoneAccount: boolean) {
  const now = new Date();
  const adult = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
  const dob = !f.dob
    ? ""
    : f.dob > iso(now)
      ? "Date of birth can’t be in the future."
      : f.dob > iso(adult)
        ? "You must be 18 or over to use AI Courtroom."
        : f.dob < "1900-01-01"
          ? "Enter a real date of birth."
          : "";
  const digits = digitsOf(f.phone);
  const phone =
    phoneAccount || !digits
      ? ""
      : !/^\d+$/.test(digits)
        ? "Use digits only."
        : f.code === "91" && digits.length !== 10
          ? "Indian mobile numbers have 10 digits."
          : digits.length < 6 || digits.length > 14
            ? "Enter a valid phone number."
            : "";
  const email =
    phoneAccount && f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim()) ? "Enter a valid email address." : "";
  const name = !f.first.trim() || !f.last.trim();
  return { dob, phone, email, name, any: name || !!dob || !!phone || !!email };
}

/** ISO codes for the case-location setting; only Indian states are mapped. */
async function placeCodes(state: string, country: string) {
  if (!/^india$/i.test(country.trim())) return { state_iso2: null, country_iso2: null };
  const states: { state_iso2: string; state_name: string }[] = await locationAPI.getIndianStates().catch(() => []);
  const hit = states.find((s) => s.state_name.toLowerCase() === state.trim().toLowerCase());
  return { state_iso2: hit?.state_iso2 ?? null, country_iso2: "IN" };
}

const errorText = (e: unknown, fallback: string) => getErrorDetail(e) || (e instanceof Error && e.message) || fallback;

/** The photo shown in the panel: the saved one, a newly cropped one, or none. */
interface Photo {
  url: string | null;
  src?: string; // the uncropped picture, for "Adjust crop"
  blob?: Blob;
}

export default function EditProfile({
  user,
  open,
  onClose,
  onSaved,
  w,
}: {
  user: User;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  w: number;
}) {
  const online = useOnline();
  const focus = useReturnFocus();
  const [f, setF] = useState<Form>(() => fromUser(user));
  const [photo, setPhoto] = useState<Photo>({ url: user.profile_photo_url ?? null });
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  // A new email is saved only after the code sent to it is entered.
  const [emailCode, setEmailCode] = useState<{ to: string; code: string; sentAt: number } | null>(null);
  const [now, setNow] = useState(0);

  // Each opening starts from the saved profile (a refresh while open keeps the form).
  const wasOpen = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opening) return;
    setF(fromUser(user));
    setPhoto({ url: user.profile_photo_url ?? null });
    setTried(false);
    setEmailCode(null);
  }, [open, user]);

  useEffect(() => {
    if (!emailCode) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [emailCode]);

  // A cropped photo is shown from an object URL; free it once replaced.
  useEffect(() => () => void (photo.blob && photo.url && URL.revokeObjectURL(photo.url)), [photo]);

  const method = user.auth_method;
  const phoneAccount = method === "phone";
  const bad = problems(f, phoneAccount);
  const show = (msg: string) => (tried ? msg : "");
  const set = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const today = new Date();
  const dobMax = iso(new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()));
  const newEmail = phoneAccount ? f.email.trim().toLowerCase() : "";
  const emailChanged = phoneAccount && newEmail !== (user.email ?? "");
  const wait = emailCode ? Math.max(0, 30 - Math.floor(((now || emailCode.sentAt) - emailCode.sentAt) / 1000)) : 0;

  const sendCode = async (to: string) => {
    await accountAPI.sendEmailCode(to);
    const t = Date.now();
    setEmailCode({ to, code: "", sentAt: t });
    setNow(t);
    window.setTimeout(() => document.getElementById("ed-email-code")?.focus(), 40);
  };
  const confirmEmail = async () => {
    if (!emailCode || !/^\d{6}$/.test(emailCode.code)) return;
    setSaving(true);
    try {
      await accountAPI.verifyEmailCode(emailCode.code);
      await onSaved();
      onClose();
      toast(`Email added: ${emailCode.to}.`);
    } catch (err) {
      toast.error(errorText(err, "Couldn’t confirm that code. Please try again."));
    } finally {
      setSaving(false);
    }
  };
  const ini = `${f.first[0] ?? ""}${f.last[0] ?? ""}`.toUpperCase();
  const codes = CODES.some(([v]) => v === f.code) ? CODES : [[f.code, `+${f.code}`], ...CODES];
  const border = (msg: string) => (msg ? "border-error" : "border-ink");

  const onPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast("Choose an image file, such as a JPG or PNG.");
    if (file.size > 5 * 1024 * 1024) return void toast("That photo is over 5 MB. Choose a smaller one.");
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result));
    reader.readAsDataURL(file);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (bad.any) return setTried(true);
    if (!online) return void toast("You’re offline. Your changes are kept, so you can save them when you’re back online.");
    setSaving(true);
    try {
      if (photo.blob) await authAPI.uploadProfilePhoto(new File([photo.blob], "photo.jpg", { type: "image/jpeg" }));
      else if (!photo.url && user.profile_photo_url) await authAPI.deleteProfilePhoto();

      const body: Parameters<typeof authAPI.updateProfile>[0] = {
        first_name: f.first.trim(),
        last_name: f.last.trim(),
        nickname: f.nick.trim() || null,
        gender: f.gender || null,
        date_of_birth: f.dob || null,
        city: f.city.trim() || null,
        state: f.state.trim() || null,
        country: f.country.trim() || null,
      };
      // The email or number the account signs in with is locked. A phone account may
      // remove its email at once, but a new one waits for the code sent to it.
      if (!phoneAccount) Object.assign(body, { phone_code: f.code, phone_number: digitsOf(f.phone) || null });
      else if (emailChanged && !newEmail) body.email = null;
      if (f.state.trim() !== (user.state ?? "") || f.country.trim() !== (user.country ?? "")) {
        Object.assign(body, await placeCodes(f.state, f.country));
      }
      await authAPI.updateProfile(body);
      if (emailChanged && newEmail && emailCode?.to !== newEmail) {
        await sendCode(newEmail);
        await onSaved();
        toast(`Profile saved. Enter the code we emailed to ${newEmail} to add it.`);
        return;
      }
      await onSaved();
      onClose();
      toast("Profile updated successfully!");
    } catch (err) {
      toast.error(errorText(err, "Couldn’t save your profile. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-63 animate-[ac-fade_.24s_ease_both] bg-(--scrim)" />
          <Dialog.Content
            aria-describedby={undefined}
            {...focus}
            asChild
            onOpenAutoFocus={(e) => {
              focus.onOpenAutoFocus();
              e.preventDefault();
              document.getElementById("ed-first")?.focus({ preventScroll: true });
            }}
          >
            <form
              onSubmit={save}
              noValidate
              className="fixed inset-y-0 right-0 z-64 flex w-[min(460px,100%)] animate-[ac-panel_.44s_cubic-bezier(.2,.8,.2,1)_both] flex-col bg-paper font-type text-ink shadow-[-30px_0_80px_rgba(0,0,0,.6)] outline-none light:shadow-[-30px_0_80px_rgba(60,44,28,.25)]"
            >
              <div className="flex flex-none items-center justify-between gap-3 border-b-[3px] border-double border-ink pt-3 pr-3.5 pb-2.5 pl-5.5">
                <Dialog.Title className={cn(TAG, "m-0 text-ink-label")}>Edit profile</Dialog.Title>
                <Dialog.Close aria-label="Close" className={CLOSE}>
                  ×
                </Dialog.Close>
              </div>

              <Scroller className="flex flex-1 flex-col gap-4.5 px-6 pt-5.5 pb-6.5">
                <div className="flex items-center gap-4 border-b border-ink/20 pb-4.5">
                  {photo.url ? (
                    <span
                      role="img"
                      aria-label="New profile photo"
                      className="block h-19 w-19 flex-none rounded-full border-2 border-ink bg-ink bg-cover bg-center"
                      style={{ backgroundImage: `url("${photo.url}")` }}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-19 w-19 flex-none items-center justify-center rounded-full bg-ink font-display text-[28px] text-paper"
                    >
                      {ini}
                    </span>
                  )}
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <label className="relative flex h-9.5 cursor-pointer items-center bg-ink px-3.5 text-[11px] font-bold tracking-[0.14em] text-paper uppercase focus-within:outline-2 focus-within:outline-gold">
                        Upload photo
                        <input type="file" accept="image/*" onChange={onPhoto} className="absolute h-px w-px opacity-0" />
                      </label>
                      {photo.url && (
                        <button
                          type="button"
                          onClick={() => setPhoto({ url: null })}
                          className="h-9.5 cursor-pointer border-[1.5px] border-ink bg-transparent px-3.5 text-[11px] font-bold tracking-[0.14em] text-ink uppercase hover:bg-[#f8f3e7]"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <span className="text-xs text-ink-meta">JPG or PNG, up to 5 MB. You can crop it next.</span>
                    {photo.url && (
                      <button
                        type="button"
                        onClick={() => setCropSrc(photo.src ?? photo.url)}
                        className="cursor-pointer self-start border-0 border-b border-ink bg-transparent p-0 text-[10.5px] font-bold tracking-[0.14em] text-ink uppercase hover:border-seal hover:text-seal"
                      >
                        Adjust crop
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <Field id="ed-first" label="First name">
                    <input
                      id="ed-first"
                      value={f.first}
                      onChange={set("first")}
                      autoComplete="given-name"
                      aria-required="true"
                      className={cn(FIELD, border(tried && !f.first.trim() ? "x" : ""))}
                    />
                  </Field>
                  <Field id="ed-last" label="Last name">
                    <input
                      id="ed-last"
                      value={f.last}
                      onChange={set("last")}
                      autoComplete="family-name"
                      aria-required="true"
                      className={cn(FIELD, border(tried && !f.last.trim() ? "x" : ""))}
                    />
                  </Field>
                </div>
                {tried && bad.name && (
                  <span role="alert" className={cn(ERR, "-mt-2")}>
                    First and last name are required.
                  </span>
                )}

                <div className="flex flex-col gap-1.5">
                  <Field id="ed-nick" label="Nickname · optional">
                    <input id="ed-nick" value={f.nick} onChange={set("nick")} autoComplete="nickname" className={cn(FIELD, "border-ink")} />
                  </Field>
                  <span className={HINT}>Shown in the welcome message instead of your first name.</span>
                </div>

                <div className="flex flex-col gap-2">
                  <span id="ed-g" className={LABEL}>
                    Gender · optional
                  </span>
                  <div role="radiogroup" aria-labelledby="ed-g" className="flex flex-wrap gap-1.5">
                    {GENDERS.map(([v, t]) => {
                      const on = f.gender === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setF((x) => ({ ...x, gender: on ? "" : v }))}
                          className={cn(
                            "min-h-9.5 cursor-pointer border-[1.5px] border-ink px-3 text-[13.5px]",
                            on ? "bg-ink text-paper" : "bg-transparent text-ink",
                          )}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Field id="ed-dob" label="Date of birth · optional">
                    <input
                      id="ed-dob"
                      type="date"
                      value={f.dob}
                      onChange={set("dob")}
                      max={dobMax}
                      min="1900-01-01"
                      autoComplete="bday"
                      aria-invalid={!!show(bad.dob)}
                      aria-describedby="ed-dob-h"
                      className={cn(FIELD, "scheme-light", border(show(bad.dob)))}
                    />
                  </Field>
                  {show(bad.dob) && (
                    <span role="alert" className={ERR}>
                      {bad.dob}
                    </span>
                  )}
                  <span id="ed-dob-h" className={HINT}>
                    Not shown to anyone. You must be 18 or over.
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ed-email" className={LABEL}>
                    Email
                  </label>
                  <input
                    id="ed-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    spellCheck={false}
                    disabled={!phoneAccount}
                    value={f.email}
                    onChange={set("email")}
                    placeholder="you@example.com"
                    aria-invalid={!!show(bad.email)}
                    aria-describedby="ed-email-h"
                    className={cn(FIELD, "border-ink", !phoneAccount && LOCKED)}
                  />
                  {show(bad.email) && (
                    <span role="alert" className={ERR}>
                      {bad.email}
                    </span>
                  )}
                  {emailCode && emailCode.to === newEmail && (
                    <div className="flex flex-col gap-2 border border-ink/15 bg-[#f8f3e7] px-3.5 py-3">
                      <label htmlFor="ed-email-code" className={HINT}>
                        We sent a code to <strong className="wrap-anywhere text-ink">{emailCode.to}</strong>. Enter it to add this email.
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <input
                          id="ed-email-code"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder="••••••"
                          value={emailCode.code}
                          onChange={(e) => setEmailCode({ ...emailCode, code: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                          aria-label="Email code"
                          className={cn(FIELD, "flex-[1_1_130px] border-ink font-data tracking-[0.4em]")}
                        />
                        <button
                          type="button"
                          onClick={() => void confirmEmail()}
                          disabled={emailCode.code.length !== 6 || saving}
                          className={cn(
                            BTN,
                            "h-11.5 border-0 bg-ink text-paper hover:bg-seal disabled:cursor-default disabled:bg-ink-disabled",
                          )}
                        >
                          Confirm email
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => void sendCode(emailCode.to).catch((err) => toast.error(errorText(err, "Couldn’t send the code.")))}
                        disabled={wait > 0}
                        className="cursor-pointer self-start border-0 border-b border-ink/40 bg-transparent p-0 text-xs text-ink-muted hover:text-seal disabled:cursor-default disabled:hover:text-ink-muted"
                      >
                        {wait > 0 ? `Resend in ${wait}s` : "Resend code"}
                      </button>
                    </div>
                  )}
                  {phoneAccount ? (
                    <span id="ed-email-h" className={HINT}>
                      Optional. We send a code to confirm it. Used for replies and recovery. Connecting Google in{" "}
                      <Link href="/settings" className="border-b border-seal text-seal hover:text-ink">
                        Settings
                      </Link>{" "}
                      fills this in for you.
                    </span>
                  ) : (
                    <span id="ed-email-h" className={HINT}>
                      {method === "google"
                        ? "You signed up with Google, so this email can’t be changed here."
                        : "You signed up with this email, so it can’t be changed here."}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ed-phone" className={LABEL}>
                    Phone · optional
                  </label>
                  <div className="grid grid-cols-[minmax(0,108px)_minmax(0,1fr)] gap-2">
                    <select
                      id="ed-code"
                      disabled={phoneAccount}
                      value={f.code}
                      onChange={set("code")}
                      aria-label="Country code"
                      autoComplete="tel-country-code"
                      className={cn(FIELD, "border-ink", phoneAccount && LOCKED)}
                    >
                      {codes.map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      id="ed-phone"
                      type="tel"
                      inputMode="tel"
                      disabled={phoneAccount}
                      value={f.phone}
                      onChange={set("phone")}
                      autoComplete="tel-national"
                      placeholder="98765 43210"
                      aria-invalid={!!show(bad.phone)}
                      className={cn(FIELD, border(show(bad.phone)), phoneAccount && LOCKED)}
                    />
                  </div>
                  {show(bad.phone) && (
                    <span role="alert" className={ERR}>
                      {bad.phone}
                    </span>
                  )}
                  <span className={HINT}>
                    {phoneAccount
                      ? "You signed up with this number, so it can’t be changed here."
                      : "Only used for account recovery. Never shown to anyone."}
                  </span>
                </div>

                <div className="flex flex-col gap-3.5 border-t border-ink/20 pt-1.5">
                  <span className={cn(LABEL, "pt-3")}>Where you practise</span>
                  <Field id="ed-city" label="City">
                    <input
                      id="ed-city"
                      value={f.city}
                      onChange={set("city")}
                      autoComplete="address-level2"
                      className={cn(FIELD, "border-ink")}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3.5">
                    <Field id="ed-state" label="State">
                      <input
                        id="ed-state"
                        value={f.state}
                        onChange={set("state")}
                        autoComplete="address-level1"
                        className={cn(FIELD, "border-ink")}
                      />
                    </Field>
                    <Field id="ed-country" label="Country">
                      <input
                        id="ed-country"
                        value={f.country}
                        onChange={set("country")}
                        autoComplete="country-name"
                        className={cn(FIELD, "border-ink")}
                      />
                    </Field>
                  </div>
                  <span className={HINT}>New cases are set in courts near here.</span>
                </div>
              </Scroller>

              <div className="flex flex-none justify-end gap-2 border-t-[3px] border-double border-ink px-4.5 pt-3 pb-3.5">
                <Dialog.Close type="button" className={cn(BTN, "border-[1.5px] border-ink bg-transparent text-ink hover:bg-[#f8f3e7]")}>
                  Cancel
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={saving}
                  className={cn(BTN, "border-0 bg-seal px-5 text-cream hover:bg-seal-hover disabled:cursor-wait")}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {cropSrc && (
        <CropDialog
          src={cropSrc}
          w={w}
          onCancel={() => setCropSrc(null)}
          onUse={(blob) => {
            setPhoto({ url: URL.createObjectURL(blob), src: cropSrc, blob });
            setCropSrc(null);
          }}
        />
      )}
    </>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.75">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** Square crop with a circular mask; the photo is saved at 320 × 320. */
function CropDialog({ src, w, onCancel, onUse }: { src: string; w: number; onCancel: () => void; onUse: (blob: Blob) => void }) {
  const V = Math.max(160, Math.min(280, w - 90));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [dragging, setDragging] = useState(false);

  const zoomKeys = (e: KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, z + 0.1));
    else if (e.key === "-") setZoom((z) => Math.max(1, z - 0.1));
  };
  const use = async () => {
    if (!area) return;
    const blob = await getCroppedImg(src, area, 0, undefined, 320).catch(() => null);
    if (blob) onUse(blob);
    else toast.error("Couldn’t crop that photo. Try another one.");
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-66 grid animate-[ac-fade_.22s_ease_both] place-items-center bg-[rgba(7,5,4,.85)] p-4 light:bg-[rgba(40,30,20,.51)]">
          <Dialog.Content
            aria-describedby={undefined}
            className="flex w-full max-w-105 animate-[ac-rise_.38s_cubic-bezier(.2,.8,.2,1)_both] flex-col bg-paper font-type text-ink shadow-dialog outline-none"
          >
            <div className="flex items-center justify-between gap-3 border-b-[3px] border-double border-ink pt-3 pr-3.5 pb-2.5 pl-5.5">
              <Dialog.Title className={cn(TAG, "m-0 text-ink-label")}>Crop your photo</Dialog.Title>
              <Dialog.Close aria-label="Cancel" className={CLOSE}>
                ×
              </Dialog.Close>
            </div>
            <div className="flex flex-col items-center gap-4 px-5.5 pt-5.5 pb-4">
              <div
                role="group"
                aria-label="Photo crop area. Drag or use the arrow keys to move, plus and minus to zoom."
                onKeyDown={zoomKeys}
                className="relative"
                style={{ width: V, height: V }}
              >
                <Cropper
                  image={src}
                  crop={crop}
                  zoom={zoom}
                  minZoom={1}
                  maxZoom={4}
                  aspect={1}
                  cropShape="round"
                  cropSize={{ width: V, height: V }}
                  showGrid={dragging}
                  zoomSpeed={0.4}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, px) => setArea(px)}
                  onInteractionStart={() => setDragging(true)}
                  onInteractionEnd={() => setDragging(false)}
                  style={{
                    containerStyle: { background: "#120d09" },
                    cropAreaStyle: { border: "2px solid #efe6d3", color: "rgba(239,230,211,.62)" },
                  }}
                />
              </div>
              <label className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <span className={cn(TAG, "text-ink-muted")}>Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  aria-label="Zoom"
                  className="w-full cursor-pointer accent-seal"
                />
                <span className="min-w-9.5 text-right font-data text-xs text-ink-muted">{Math.round(zoom * 100)}%</span>
              </label>
              <span className="text-center text-[12.5px] text-ink-meta">Drag to position your face inside the circle.</span>
            </div>
            <div className="flex justify-between gap-2 border-t-[3px] border-double border-ink px-4.5 pt-3 pb-3.5">
              <button
                type="button"
                onClick={() => {
                  setCrop({ x: 0, y: 0 });
                  setZoom(1);
                }}
                className="h-11 cursor-pointer border-0 border-b border-ink/40 bg-transparent px-3.5 text-[11px] font-bold tracking-[0.14em] text-ink uppercase hover:text-seal"
              >
                Reset
              </button>
              <div className="flex gap-2">
                <Dialog.Close
                  type="button"
                  className={cn(BTN, "h-11 border-[1.5px] border-ink bg-transparent text-ink hover:bg-[#f8f3e7]")}
                >
                  Cancel
                </Dialog.Close>
                <button
                  type="button"
                  onClick={() => void use()}
                  className={cn(BTN, "h-11 border-0 bg-seal text-cream hover:bg-seal-hover")}
                >
                  Use photo
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
