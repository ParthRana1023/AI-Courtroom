// Client timing settings, overridable with NEXT_PUBLIC_ environment variables.
// Next.js bakes these in at build time and only replaces them when written out
// in full, so each variable is read by its literal name below.

function numberFrom(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// How often an open courtroom checks for changes made on other devices.
export const COURTROOM_POLL_MS = numberFrom(
  process.env.NEXT_PUBLIC_COURTROOM_POLL_MS,
  4000,
);

// How often Case Prep checks for exhibit images being made in the background.
export const EVIDENCE_IMAGE_POLL_MS = numberFrom(
  process.env.NEXT_PUBLIC_EVIDENCE_IMAGE_POLL_MS,
  5000,
);

// Faster refresh while the AI is examining a witness.
export const AI_EXAMINATION_POLL_MS = numberFrom(
  process.env.NEXT_PUBLIC_AI_EXAMINATION_POLL_MS,
  1000,
);

// The AI considers calling a witness after this many user arguments…
export const MIN_ARGUMENTS_BETWEEN_AI_WITNESS_CHECKS = numberFrom(
  process.env.NEXT_PUBLIC_MIN_ARGUMENTS_BETWEEN_AI_WITNESS_CHECKS,
  2,
);

// Android APK, published as an asset on the latest GitHub release rather than
// kept in the repo. Upload new builds under the same file name.
export const APK_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL ||
  "https://github.com/ParthRana1023/AI-Courtroom/releases/latest/download/ai-courtroom.apk";

// Phone sign-in and sign-up by SMS code. Dev-only for now: shown in `pnpm dev`
// unless NEXT_PUBLIC_PHONE_AUTH_ENABLED says otherwise; the server must also
// have PHONE_AUTH_ENABLED=true.
export const PHONE_AUTH_ENABLED = process.env.NEXT_PUBLIC_PHONE_AUTH_ENABLED
  ? process.env.NEXT_PUBLIC_PHONE_AUTH_ENABLED === "true"
  : process.env.NODE_ENV === "development";
