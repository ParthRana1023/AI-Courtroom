import type { Settlement, SettlementProfile, SettlementRoute, SettlementTerms, SettlementView } from "@/types";

/** ₹ with Indian digit grouping: 4200000 → "₹42,00,000". */
export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.max(0, n));

/** Where the desk stands. waiting = our offer is with the other side. */
export type Phase = "start" | "compose" | "waiting" | "final" | "agreed" | "signed" | "filed" | "refused";

/** Terms are agreed: the deed is on the table, and the panels move round it. */
export const DEAL: Phase[] = ["agreed", "signed", "filed"];

type OpenRoute = Exclude<SettlementRoute, "none">;

type Copy = {
  steps: [string, string][];
  at: Record<"negotiate" | "agreed" | "signed" | "filed", number>; // the step each phase sits on
  deedH: string;
  noDeedT: string;
  agreedT: string;
  filedK: string;
  filedT: (date: string) => string;
  hearL: string;
  fileToast: string;
};

/** Per-route copy: the five steps, the deed, and filing. */
export const ROUTE_COPY: Record<OpenRoute, Copy> = {
  quash: {
    steps: [
      ["Negotiate", "Up to three offers each"],
      ["Compromise deed", "Drafted by the AI, signed by both"],
      ["Joint application", "Under § 528 BNSS"],
      ["Verification", "The judge questions the complainants"],
      ["Order", "Quashed, or refused"],
    ],
    at: { negotiate: 0, agreed: 1, signed: 2, filed: 3 },
    deedH: "Compromise deed",
    noDeedT: "The AI drafts the deed from the agreed terms. You read it before your client signs.",
    agreedT: "The AI has drafted the compromise deed from the agreed terms. Read it before your client signs.",
    filedK: "Joint application filed · § 528 BNSS",
    filedT: (d) =>
      `The verification hearing is listed for ${d}. The judge will question the complainants directly to confirm they agreed freely. It is heard in the courtroom, first thing when the court next sits.`,
    hearL: "Go to the verification hearing",
    fileToast: "Joint application filed under § 528 BNSS.",
  },
  compound: {
    steps: [
      ["Negotiate", "Up to three offers each"],
      ["Compromise deed", "Drafted by the AI, signed by both"],
      ["Application", "Compounding under § 359 BNSS"],
      ["Recording", "The court records each complainant’s consent"],
      ["Order", "Acquitted, or refused"],
    ],
    at: { negotiate: 0, agreed: 1, signed: 2, filed: 3 },
    deedH: "Compromise deed",
    noDeedT: "The AI drafts the deed from the agreed terms. You read it before your client signs.",
    agreedT: "The AI has drafted the compromise deed from the agreed terms. Read it before your client signs.",
    filedK: "Compounding application filed · § 359 BNSS",
    filedT: (d) =>
      `The matter is listed for ${d}. The court will record each complainant’s consent and decide whether to permit compounding. It is heard in the courtroom, first thing when the court next sits.`,
    hearL: "Go to the compounding hearing",
    fileToast: "Compounding application filed under § 359 BNSS.",
  },
  plea: {
    steps: [
      ["Application", "Filed under § 290"],
      ["In-camera check", "The judge confirmed the plea is voluntary"],
      ["Disposition", "Compensation agreed with the complainants"],
      ["Report", "Signed by everyone at the meeting · § 292"],
      ["Sentence", "Compensation and a reduced sentence · § 293"],
    ],
    at: { negotiate: 2, agreed: 3, signed: 3, filed: 4 },
    deedH: "Disposition report",
    noDeedT: "The AI drafts the report from the agreed terms. Everyone who took part in the meeting signs it.",
    agreedT: "The AI has drafted the disposition report from the agreed terms. Read it before it is signed.",
    filedK: "Report submitted · § 292 BNSS",
    filedT: (d) =>
      `The case is listed for sentence on ${d}. The court confirms the plea once more, then passes sentence under section 293. It is heard in the courtroom, first thing when the court next sits.`,
    hearL: "Go to the sentencing hearing",
    fileToast: "Report submitted to the court under § 292 BNSS.",
  },
};

export function phaseOf(view: SettlementView, sending: boolean): Phase {
  const a = view.attempt;
  if (sending) return "waiting";
  if (!a) return "start";
  if (a.status === "agreed") return "agreed";
  if (a.status === "signed") return "signed";
  if (a.status === "filed" || a.status === "adjourned" || a.status === "recorded") return "filed";
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

/** "2026-11-04" → "4 November 2026". */
export const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export type Outcome = "granted" | "refused" | "adjourned";
export type Next = { title: string; stamp: string; c: string; body: string; line: string; cta: string; to: "cases" | "prep" | "desk" };

type HearingCopy = {
  title: string;
  sub: string;
  lord: string; // how counsel address the court
  s2: [string, string];
  s3: [string, string];
  deedH: string;
  readL: string;
  stamp: Record<Outcome, string>;
  chip: Record<Outcome, string>;
  checks: string[];
  call: (title: string, caseNo: string) => string;
  granted: Pick<Next, "title" | "stamp" | "body" | "line">;
  refused: Pick<Next, "stamp" | "body" | "line">;
  remedy: { label: string; them: string; you: string; done: string; filed: string; note: string };
};

/** The settlement hearing, by route: what it is called, how the court is addressed, the stamp
 * and chip for each outcome, the checks the court makes, and what follows. */
export const HEARING_COPY: Record<OpenRoute, HearingCopy> = {
  quash: {
    title: "Verification hearing",
    sub: "Verification of compromise",
    lord: "My Lord",
    s2: ["Verification", "The judge hears counsel and questions the complainants"],
    s3: ["Order", "Quashed, refused or adjourned"],
    deedH: "The deed",
    readL: "Read the full deed",
    stamp: { granted: "QUASHED", refused: "REFUSED", adjourned: "ADJOURNED" },
    chip: { granted: "Quashed · settled", refused: "Quash refused", adjourned: "Adjourned" },
    checks: ["Every complainant agreed freely", "The dispute is private", "The State’s view"],
    call: (title, caseNo) =>
      `${caseNo ? `${caseNo}, ` : ""}${title}. This is a joint application under section 528 BNSS to quash the FIR on the basis of a compromise. Counsel, briefly.`,
    granted: {
      title: "Payments",
      stamp: "SETTLED",
      body: "The FIR is quashed. The case is closed as Settled, and the payments below are tracked against the order.",
      line: "The case moves to My Cases as Settled.",
    },
    refused: {
      stamp: "CONTINUES",
      body: "The petition goes back to arguments on its merits. The deed still binds the parties, and the trial court may consider it.",
      line: "The petition continues. Prepare for arguments on",
    },
    // The quashing can't be recalled for a breach of the compromise (s.403 BNSS bars a review): the accused's
    // promise to pay was an undertaking to the court, and its wilful breach is contempt.
    remedy: {
      label: "File a contempt petition",
      them: "The FIR stays quashed: the order can’t be recalled for a breach. You can petition this court for contempt, since the promise to pay was an undertaking to it.",
      you: "The complainants can petition this court for contempt of the undertaking to pay. Paying now, with interest for the delay, is the best answer to it.",
      done: "Contempt petition filed.",
      filed:
        "Contempt petition filed. The court will ask whether the breach was wilful, and usually gives a last chance to pay before it punishes.",
      note: "If a payment is missed and stays unpaid after notice, the complainants can petition this court for contempt. The FIR stays quashed.",
    },
  },
  compound: {
    title: "Compounding hearing",
    sub: "Compounding under § 359 BNSS",
    lord: "Your Honour",
    s2: ["Recording", "The court records each complainant’s consent"],
    s3: ["Order", "Acquitted, refused or adjourned"],
    deedH: "The deed",
    readL: "Read the full deed",
    stamp: { granted: "ACQUITTED", refused: "REFUSED", adjourned: "ADJOURNED" },
    chip: { granted: "Acquitted · settled", refused: "Compounding refused", adjourned: "Adjourned" },
    checks: ["Every complainant compounded freely", "The court’s permission", "The offences can be compounded"],
    call: (title) => `${title}. The complainants have applied under section 359 BNSS to compound the offences. Counsel, briefly.`,
    granted: {
      title: "Payments",
      stamp: "ACQUITTED",
      body: "The accused is acquitted and the case is closed as Settled. The payments below are owed under the deed.",
      line: "The case moves to My Cases as Settled.",
    },
    refused: {
      stamp: "CONTINUES",
      body: "The trial continues on every charge. Any refunds can count in the accused’s favour at sentence.",
      line: "The trial continues. Prepare for the next date,",
    },
    remedy: {
      label: "Send a legal notice",
      them: "The acquittal stands, so the FIR can’t be revived. You can recover the amount under the deed, starting with a legal notice.",
      you: "The acquittal stands, but the complainants can sue on the deed. Paying now avoids that.",
      done: "Legal notice sent.",
      filed: "Legal notice sent. The accused has 15 days to pay; after that, you can file a summary suit on the deed.",
      note: "The acquittal can’t be undone. If a payment is missed, the complainants recover it under the deed through a civil suit.",
    },
  },
  plea: {
    title: "Sentencing hearing",
    sub: "Plea bargaining · sentence under § 293 BNSS",
    lord: "Your Honour",
    s2: ["Hearing", "The court confirms the plea and hears the parties"],
    s3: ["Sentence", "Sentenced, rejected or adjourned"],
    deedH: "The report",
    readL: "Read the full report",
    stamp: { granted: "SENTENCED", refused: "REJECTED", adjourned: "ADJOURNED" },
    chip: { granted: "Sentenced · plea bargain", refused: "Report rejected", adjourned: "Adjourned" },
    checks: ["The plea is voluntary", "Every complainant accepts", "The offences qualify"],
    call: (title) =>
      `${title}. The report of the mutually satisfactory disposition under section 292 BNSS is before me, signed by everyone who took part. I will hear counsel before I dispose of the case.`,
    granted: {
      title: "Compensation",
      stamp: "SENTENCED",
      body: "The case is closed as Plea bargained. The compensation is part of the sentence and is tracked below.",
      line: "The case moves to My Cases as Plea bargained.",
    },
    refused: {
      stamp: "TRIAL",
      body: "The case goes back to trial. Nothing the accused said during the plea bargaining can be used against him.",
      line: "The trial continues. Prepare for the next date,",
    },
    remedy: {
      label: "Ask the court to recover it",
      them: "The compensation is part of the sentence. Ask the court to recover it as it would a fine.",
      you: "The court can recover it as it would a fine, by attaching property. Paying now avoids that.",
      done: "Recovery application filed.",
      filed: "Recovery application filed. The court can attach the accused’s property to recover the amount.",
      note: "The compensation is part of the sentence. If a payment is missed, the court recovers it as it would a fine.",
    },
  },
};

/** A default left unpaid after notice, by route: what the complainants file, the button that files it,
 * what it means for the accused, and the court's orders on it. Compounding is an acquittal, so its
 * default goes to a civil court and this case never reopens. */
export const DEFAULT_COPY: Record<OpenRoute, { kind: string; file: string; them: string; you: string; orders: Record<string, string> }> = {
  quash: {
    kind: "Contempt petition",
    file: "File a contempt petition",
    them: "The FIR stays quashed, but the promise to pay was an undertaking to the High Court. You can petition it for contempt.",
    you: "The complainants have petitioned the High Court for contempt of your client’s undertaking to pay. Show the court the breach wasn’t wilful, or that your client will pay.",
    orders: {
      time: "Not wilful: time to pay",
      last_chance: "Last chance to purge the contempt",
      relegated: "Left to a civil suit",
    },
  },
  plea: {
    kind: "Recovery application",
    file: "Ask the court to recover it",
    them: "The compensation is part of the sentence. You can ask the court to recover it as it would a fine.",
    you: "The complainants have asked the court to recover the compensation as a fine, by attaching your client’s property.",
    orders: { time: "Time to pay", warrant: "Warrant to levy by attachment" },
  },
  compound: {
    kind: "Suit on the deed",
    file: "Sue on the deed",
    them: "The acquittal stands, so this case can’t reopen. You can sue on the deed in a civil court for what is unpaid.",
    you: "The acquittal stands. The complainants will sue on the deed in a civil court for what is unpaid.",
    orders: {},
  },
};

/** What follows the order, with the next date filled in. */
export function nextAfter(route: OpenRoute, outcome: Outcome, date: string): Next {
  const c = HEARING_COPY[route];
  if (outcome === "granted") return { ...c.granted, c: "#3f6b3a", cta: "Back to My Cases", to: "cases" };
  if (outcome === "refused")
    return {
      title: `Next date · ${date}`,
      stamp: c.refused.stamp,
      c: "#8e1f19",
      body: c.refused.body,
      line: `${c.refused.line} ${date}.`,
      cta: "Back to Case Prep",
      to: "prep",
    };
  return {
    title: `Next date · ${date}`,
    stamp: "ADJOURNED",
    c: "#7a4a0c",
    body: `The court takes the matter up again on ${date}. Do what the order asks before then.`,
    line: `The matter is listed again on ${date}.`,
    cta: "Call the matter again",
    to: "desk",
  };
}

/** Counsel's submission, pre-filled from the deed for the user to edit. */
export function draftSubmission(route: OpenRoute, forAccused: boolean, complainants: string[], t: SettlementTerms) {
  const lord = HEARING_COPY[route].lord;
  const who = complainants.length > 1 ? `all ${complainants.length} complainants` : (complainants[0] ?? "the complainant");
  const money = t.amount
    ? `${inr(t.amount)} ${t.instalments === 1 ? "in one payment" : `in ${t.instalments} instalments`} over ${t.months} months, ${t.interest ? `with interest at ${t.interest}% a year` : "without interest"}`
    : "";
  if (route === "plea")
    return forAccused
      ? `${lord}, the accused pleads guilty to the charges.${money ? ` The accused will pay the complainants ${money}, as compensation.` : ""} The accused has no previous conviction and asks for the reduced sentence under section 293.`
      : `${lord}, the complainants took part in the disposition meeting.${money ? ` They accept ${money} as compensation, and ask that it be made part of the sentence.` : ""}`;
  return forAccused
    ? `${lord}, the accused and ${who} have settled.${money ? ` The accused will pay ${money}.` : ""} Every complainant has signed the deed.`
    : `${lord}, ${who} have settled with the accused.${money ? ` They will receive ${money}.` : ""} They have signed the deed and ${route === "quash" ? "don’t wish to pursue the FIR" : "ask the court to permit compounding"}.`;
}
