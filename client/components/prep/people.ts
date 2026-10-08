import { plain } from "@/lib/case-file";
import { PersonRole, type PersonInvolved } from "@/types";

const HONORIFIC = /^(Insp\.?|Inspector|SI|ASI|Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Shri|Smt\.?|Adv\.?)\s+/i;

/** "Insp. Sunil Rathore" → "SR" */
export const initials = (name: string) =>
  plain(name)
    .replace(HONORIFIC, "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** How the prep screens address someone: "Priya", "Inspector Rathore", "Dr Rao". */
export function firstName(name: string) {
  const n = plain(name);
  const sur = n.split(" ").pop() ?? n;
  if (/^(Insp\.?|Inspector)\s/i.test(n)) return `Inspector ${sur}`;
  if (/^Dr\.?\s/i.test(n)) return `Dr ${sur}`;
  return n.replace(HONORIFIC, "").split(" ")[0] || n;
}

/** Plaintiff's counsel interviews applicants, defendant's counsel the non-applicants. */
export const onSide = (role: string, p: PersonInvolved) =>
  role === "plaintiff" ? p.role === PersonRole.APPLICANT : p.role === PersonRole.NON_APPLICANT;
