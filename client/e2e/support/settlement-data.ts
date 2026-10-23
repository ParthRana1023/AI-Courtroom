// Settlement fixtures shared by settlement.spec.ts and settlement-hearing.spec.ts.
// The user takes the plaintiff side; the applicant, Raghav Menon, is the accused.

export const AT = "2026-10-18T10:40:00Z";

export const PROFILE = {
  route: "quash",
  title: "Quashing on compromise",
  court: "§ 528 BNSS · High Court of Delhi",
  offences: [
    { section: "§ 318(4)", title: "Cheating", note: "A private money dispute. The court can quash it on compromise." },
    { section: "§ 316(2)", title: "Criminal breach of trust", note: "The same test applies." },
  ],
  must: "Both complainants must sign.",
  must_detail: "The court won’t quash the FIR on a part-settlement.",
  footnote: "Compounding (§ 359) and plea bargaining apply to trials.",
  closed: [],
  conditions: [
    { key: "deposit", label: "First instalment deposited in court", short: "Deposit in court", clause: "…", favours: "complainants" },
    { key: "apology", label: "Written apology to each complainant", short: "Written apology", clause: "…", favours: "complainants" },
    {
      key: "withdraw",
      label: "Consumer complaints withdrawn on final payment",
      short: "Complaints withdrawn",
      clause: "…",
      favours: "accused",
    },
  ],
  accused: "Raghav Menon",
  accused_side: "plaintiff",
  complainants: ["Priya Khanna", "Amit Sehgal"],
  claim: 4200000,
};

export const T1 = { amount: 4200000, instalments: 6, months: 12, interest: 0, conditions: ["apology"] };
export const T2 = { amount: 4200000, instalments: 3, months: 6, interest: 9, conditions: ["apology", "deposit"] };

export const entry = (by: "user" | "ai", kind: string, terms: object | null = null, note = "") => ({
  id: `${by}-${kind}-${Math.random()}`,
  by,
  kind,
  terms,
  note,
  at: AT,
});
export const attempt = (entries: object[], over: Record<string, unknown> = {}) => ({
  id: "s1",
  status: "negotiating",
  entries,
  agreed: null,
  signatures: {},
  filed_at: null,
  hearing_date: null,
  hearing: null,
  payments: [],
  score: null,
  ruling: null,
  court_order: null,
  started_at: AT,
  ended_at: null,
  ...over,
});
export const view = (over: Record<string, unknown> = {}) => ({
  profile: PROFILE,
  attempt: null,
  attempts: 0,
  closed: null,
  can_start: true,
  start_blocked: null,
  max_offers: 3,
  deed: null,
  ...over,
});

export const DEED = {
  title: "Compromise Deed",
  header: ["In the High Court of Delhi", "CRL.M.C. No. 1234/2026 · FIR No. 41/2025"],
  parties: "Made between Raghav Menon (the accused) and Priya Khanna and Amit Sehgal (the complainants).",
  clauses: [
    "The accused shall pay the complainants ₹42,00,000 in 3 equal instalments within 6 months of signing, with interest at 9% a year.",
    "The accused shall give each complainant a written apology.",
    "The parties shall jointly ask this Court, under section 528 BNSS, to quash the FIR and all proceedings arising from it on the basis of this compromise.",
  ],
  signatories: [
    { name: "Raghav Menon", role: "Accused", side: "user" },
    { name: "Priya Khanna", role: "Complainant 1 of 3", side: "other" },
    { name: "Amit Sehgal", role: "Complainant 2 of 3", side: "other" },
    { name: "Neha Bhalla", role: "Complainant 3 of 3", side: "other" },
  ],
  file_label: "File joint application · § 528",
};
export const agreedTalks = [entry("user", "offer", T1), entry("ai", "counter", T2), entry("user", "accept")];
export const SIGNED_BY = { "Raghav Menon": AT, "Priya Khanna": AT, "Amit Sehgal": AT, "Neha Bhalla": AT };
