/**
 * Handwritten signatures (Vara.js single-line fonts in `public/vara/fonts`), drawn by
 * `components/court/signature.tsx`.
 */

export const SIG_FONTS = ["SatisfySL.json", "Parisienne.json", "PacificoSLO.json", "shadows-into-light.json"] as const;
export type SigFont = (typeof SIG_FONTS)[number];

/** Letter spacing that keeps each font's joins tight. */
export const SIG_SPACING: Record<SigFont, number> = {
  "SatisfySL.json": -3,
  "Parisienne.json": -7,
  "PacificoSLO.json": -4,
  "shadows-into-light.json": -3,
};

const isFont = (f: unknown): f is SigFont => SIG_FONTS.includes(f as SigFont);

/**
 * One font per person per case, kept across pages in localStorage. Every name passed in one
 * call (one page) gets a different font; fonts only repeat once a case has more than four signers.
 */
export function caseFonts(cnr: string, names: string[]): Record<string, SigFont> {
  const key = `aiCourtroom-sigfonts-${cnr}`;
  let map: Record<string, unknown> = {};
  try {
    map = JSON.parse(localStorage.getItem(key) || "{}") || {};
  } catch {
    // Storage blocked or corrupt: start a fresh map.
  }
  const out: Record<string, SigFont> = {};
  const onPage: SigFont[] = [];
  for (const n of names) {
    const f = map[n];
    if (isFont(f) && !onPage.includes(f)) {
      out[n] = f;
      onPage.push(f);
    }
  }
  for (const n of names) {
    if (out[n]) continue;
    const used = Object.values(map);
    const free = SIG_FONTS.filter((f) => !onPage.includes(f));
    const fresh = free.filter((f) => !used.includes(f));
    const pool = fresh.length ? fresh : free.length ? free : SIG_FONTS;
    const f = pool[Math.floor(Math.random() * pool.length)];
    out[n] = f;
    map[n] = f;
    onPage.push(f);
  }
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Storage blocked: fonts just won't carry over to other pages.
  }
  return out;
}

/**
 * A stable slant, stroke and letter spacing for a name, so signers who share a font (cases with
 * more than four signers) still sign differently.
 */
export function handOf(name: string) {
  let h = 2166136261;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return { tilt: -1 - (h % 5), stroke: 0.9 + ((h >>> 3) % 6) / 10, spacing: ((h >>> 7) % 3) - 1 };
}
