import type { CaseOutcome } from "@/types";

export const OUTCOME_LABEL: Record<CaseOutcome, string> = {
  won: "Won",
  lost: "Lost",
  partial: "Partial",
};

export const OUTCOME_STYLE: Record<CaseOutcome, string> = {
  won: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  lost: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  partial:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function OutcomeBadge({
  outcome,
  className = "",
}: {
  outcome?: CaseOutcome | null;
  className?: string;
}) {
  if (!outcome) return null;
  return (
    <span
      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${OUTCOME_STYLE[outcome]} ${className}`}
    >
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}
