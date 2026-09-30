// Client timing settings, overridable with NEXT_PUBLIC_ environment variables.
// Next.js bakes these in at build time and only replaces them when written out
// in full, so each variable is read by its literal name below.

function numberFrom(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// Pause after the AI's reply to the last argument allowed today, before the
// court adjourns, so the user can read it.
export const COURT_ADJOURN_DELAY_MS = numberFrom(
  process.env.NEXT_PUBLIC_COURT_ADJOURN_DELAY_MS,
  8000,
);

// How often an open courtroom checks for changes made on other devices.
export const COURTROOM_POLL_MS = numberFrom(
  process.env.NEXT_PUBLIC_COURTROOM_POLL_MS,
  4000,
);

// How often the open witness panel refreshes the testimony.
export const WITNESS_PANEL_POLL_MS = numberFrom(
  process.env.NEXT_PUBLIC_WITNESS_PANEL_POLL_MS,
  4000,
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

// …and at most once in this long.
export const WITNESS_CHECK_COOLDOWN_MS = numberFrom(
  process.env.NEXT_PUBLIC_WITNESS_CHECK_COOLDOWN_MS,
  30000,
);

// Android APK, published as an asset on the latest GitHub release rather than
// kept in the repo. Upload new builds under the same file name.
export const APK_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL ||
  "https://github.com/ParthRana1023/AI-Courtroom/releases/latest/download/ai-courtroom.apk";
