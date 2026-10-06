import type { User } from "@/types";

const HOME = "/dashboard/cases";

const BASE = "https://app.invalid";

/**
 * The `?next=` page to return to after signing in; only same-site paths are honoured.
 * Browsers read "/\evil.com" as "//evil.com", so backslashes and control characters are
 * refused outright and the result must still resolve to our own origin.
 */
export function safeNext(next: string | null | undefined): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what we refuse
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) {
    return HOME;
  }
  try {
    const url = new URL(next, BASE);
    // Dot segments can normalise "/.//evil.com" into "//evil.com"; check the result too.
    const out = url.pathname + url.search + url.hash;
    return url.origin === BASE && !out.startsWith("//") ? out : HOME;
  } catch {
    return HOME;
  }
}

/** New accounts are asked where they practise before their first case. */
export function needsSeatOfPractice(user: User): boolean {
  return !user.country;
}
