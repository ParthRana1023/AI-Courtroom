import type { Settlement, SettlementProfile, SettlementRoute, SettlementTerms, SettlementView } from "@/types";

/** ₹ with Indian digit grouping: 4200000 → "₹42,00,000". */
export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.max(0, n));

/** Where the desk stands. waiting = our offer is with the other side. */
export type Phase = "start" | "compose" | "waiting" | "final" | "agreed" | "refused";

type OpenRoute = Exclude<SettlementRoute, "none">;

/** Per-route copy: the five steps, and the step each phase sits on. */
export const ROUTE_COPY: Record<
  OpenRoute,
  { steps: [string, string][]; at: { negotiate: number; agreed: number }; deedH: string; noDeedT: string; agreedT: string }
> = {
  quash: {
    steps: [
      ["Negotiate", "Up to three offers each"],
      ["Compromise deed", "Drafted by the AI, signed by both"],
      ["Joint application", "Under § 528 BNSS"],
      ["Verification", "The judge questions the complainants"],
      ["Order", "Quashed, or refused"],
    ],
    at: { negotiate: 0, agreed: 1 },
    deedH: "Compromise deed",
    noDeedT: "The AI drafts the deed from the agreed terms. You read it before your client signs.",
    agreedT: "The AI has drafted the compromise deed from the agreed terms. Read it before your client signs.",
  },
  compound: {
    steps: [
      ["Negotiate", "Up to three offers each"],
      ["Compromise deed", "Drafted by the AI, signed by both"],
      ["Application", "Compounding under § 359 BNSS"],
      ["Recording", "The court records each complainant’s consent"],
      ["Order", "Acquitted, or refused"],
    ],
    at: { negotiate: 0, agreed: 1 },
    deedH: "Compromise deed",
    noDeedT: "The AI drafts the deed from the agreed terms. You read it before your client signs.",
    agreedT: "The AI has drafted the compromise deed from the agreed terms. Read it before your client signs.",
  },
  plea: {
    steps: [
      ["Application", "Filed under § 290"],
      ["In-camera check", "The judge confirmed the plea is voluntary"],
      ["Disposition", "Compensation agreed with the complainants"],
      ["Report", "Signed by everyone at the meeting · § 292"],
      ["Sentence", "Compensation and a reduced sentence · § 293"],
    ],
    at: { negotiate: 2, agreed: 3 },
    deedH: "Disposition report",
    noDeedT: "The AI drafts the report from the agreed terms. Everyone who took part in the meeting signs it.",
    agreedT: "The AI has drafted the disposition report from the agreed terms. Read it before it is signed.",
  },
};

export function phaseOf(view: SettlementView, sending: boolean): Phase {
  const a = view.attempt;
  if (sending) return "waiting";
  if (!a) return "start";
  if (a.status === "agreed" || a.status === "recorded") return "agreed";
  if (a.status !== "negotiating") return "refused";
  const last = a.entries[a.entries.length - 1];
  return userOffers(a) >= view.max_offers && last?.by === "ai" ? "final" : "compose";
}

export const userOffers = (a: Settlement) => a.entries.filter((e) => e.by === "user" && e.terms).length;

export const lastTerms = (a: Settlement | null, by: "user" | "ai") =>
  [...(a?.entries ?? [])].reverse().find((e) => e.by === by && e.terms)?.terms ?? null;

export const sameTerms = (a: SettlementTerms, b: SettlementTerms) =>
  a.amount === b.amount &&
  a.instalments === b.instalments &&
  a.months === b.months &&
  a.interest === b.interest &&
  [...a.conditions].sort().join() === [...b.conditions].sort().join();

/** The draft starts from their last terms, else ours, else the sum in dispute. */
export function startingDraft(view: SettlementView): SettlementTerms {
  const t = lastTerms(view.attempt, "ai") ?? lastTerms(view.attempt, "user");
  return t
    ? { ...t, conditions: [...t.conditions] }
    : { amount: view.profile.claim, instalments: 6, months: 12, interest: 0, conditions: [] };
}

/** Labels for the two sides at the table, from the user's seat. */
export function sideNames(profile: SettlementProfile, userRole: string) {
  const accused = profile.accused_side === userRole;
  const sur = profile.accused.split(" ").pop() || profile.accused;
  const comp = profile.complainants.length > 1 ? "complainants’" : "complainant’s";
  return {
    accused,
    you: accused ? `You · ${sur}’s counsel` : `You · ${comp} counsel`,
    them: accused ? `${comp[0].toUpperCase()}${comp.slice(1)} counsel` : `${sur}’s counsel`,
    waiting: accused
      ? `Counsel is taking instructions from ${profile.complainants[0] ?? "the complainant"}${profile.complainants.length > 1 ? " and the other complainants" : ""}…`
      : `Counsel is taking instructions from ${profile.accused}…`,
  };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today, 16:10" or "18 Oct, 16:10". The database hands back naive UTC times. */
export function stamp(ts: string) {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts}Z`);
  if (Number.isNaN(d.getTime())) return "";
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === new Date().toDateString() ? `Today, ${hm}` : `${d.getDate()} ${MON[d.getMonth()]}, ${hm}`;
}
