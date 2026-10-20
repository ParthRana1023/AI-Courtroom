import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the custom text sizes in globals.css, or it treats
// `text-meta` as a colour and drops a real colour class next to it.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["tag", "label", "meta", "body", "h3", "h2"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ROMAN: [number, string][] = [
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** 1 → "I", 14 → "XIV": section numbers, however many there are. */
export function roman(n: number) {
  let s = "";
  for (const [v, r] of ROMAN) for (; n >= v; n -= v) s += r;
  return s;
}
