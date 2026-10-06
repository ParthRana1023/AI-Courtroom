import { cn } from "@/lib/utils";

// Square paper-style buttons. Use with <button>, <Link> or <a>.
const base =
  "inline-flex items-center justify-center gap-2 px-[22px] font-type font-bold uppercase whitespace-nowrap cursor-pointer transition-colors disabled:cursor-not-allowed";

const variants = {
  // solid red: the one primary action
  seal: "bg-seal text-cream hover:bg-seal-hover hover:text-white disabled:bg-ink-disabled",
  // dark ink on paper
  ink: "bg-ink text-paper hover:bg-ink-label",
  // outlined, on paper
  paper:
    "border-[1.5px] border-ink bg-transparent text-ink hover:bg-paper-hi hover:text-ink",
  // outlined, on the desk
  desk: "border border-desk-rule-mid bg-transparent text-desk-ink hover:text-desk-hover",
} as const;

const sizes = {
  md: "h-[46px] text-xs tracking-[0.12em]",
  lg: "h-[50px] text-meta tracking-[0.14em]",
} as const;

export function buttonClass(
  variant: keyof typeof variants = "seal",
  size: keyof typeof sizes = "lg",
  className?: string,
) {
  return cn(base, variants[variant], sizes[size], className);
}
