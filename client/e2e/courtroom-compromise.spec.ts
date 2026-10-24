import type { Page, Route } from "@playwright/test";
import { test, expect, USERS } from "./support/fixtures";
import { CNR, PARTIES, caseOf } from "./support/case-data";
import { AT, DEED, NEGOTIATION, PROFILE, SIGNED_BY, T2, agreedTalks, attempt, view } from "./support/settlement-data";

const base = `/cases/${CNR}`;
/** A day from today where the court sits (the payments run on real days): day(0) is today. */
const day = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + n * 86_400_000));
let clock = 0;
type Event = Record<string, unknown>;

/** A courtroom event, a minute after the last one. */
function ev(id: string, type: string, content: string, speaker_role: string | null = null, extra: Event = {}): Event {
  clock += 1;
  return {
    id,
    type,
    content,
    speaker_role,
    speaker_name: null,
    timestamp: `2026-11-04T10:${String(clock).padStart(2, "0")}:00Z`,
    exhibit_refs: [],
    ...extra,
  };
}

const CALL =
  "Raghav Menon v. State of NCT of Delhi and Another. This is a joint application under section 528 BNSS to quash the FIR on the basis of a compromise. Counsel, briefly.";
const DRAFT = /^My Lord, the accused and all 2 complainants have settled\. The accused will pay ₹42,00,000 in 3 instalments over 6 months/;
const HEARING = {
  submission: "My Lord, the parties have settled and every complainant has signed the deed.",
  lines: [
    { kind: "speech", role: "state", who: "APP for the State", tag: "No objection", unsure: false, text: "The State has no objection." },
    {
      kind: "question",
      role: "court",
      who: "The Court to Priya Khanna",
      tag: "",
      unsure: false,
      text: "Did you sign of your own free will?",
    },
    { kind: "answer", role: "complainant", who: "Priya Khanna", tag: "", unsure: false, text: "Yes, My Lord." },
  ],
  checks: [
    { label: "Every complainant agreed freely", state: "ok", text: "Priya Khanna confirmed in court." },
    { label: "The dispute is private", state: "ok", text: "Money paid for flats." },
    { label: "The State’s view", state: "ok", text: "No objection." },
  ],
  outcome: "granted",
  judge: "R. K. Mehta",
  order: ["FIR No. 41/2025 and all proceedings arising from it are quashed."],
  next_date: null,
  held_at: AT,
};
const PAYMENTS = [
  { amount: 1400000, due: "2026-11-18", paid_at: null, remedy: null, remedy_at: null, status: "upcoming" },
  { amount: 1400000, due: "2027-02-04", paid_at: null, remedy: null, remedy_at: null, status: "upcoming" },
  { amount: 1589000, due: "2027-05-04", paid_at: null, remedy: null, remedy_at: null, status: "upcoming" },
];
const ORDER =
  "**IN THE HIGH COURT OF DELHI**\n**Raghav Menon v. State of NCT of Delhi and Another**\n**CORAM: HON'BLE R. K. Mehta, J.**\n\n**ORDER**\n\n1. FIR No. 41/2025 and all proceedings arising from it are quashed.\n\n**R. K. Mehta, J.**";

const talks = (over: Event = {}) =>
  attempt(agreedTalks, {
    status: "filed",
    agreed: T2,
    signatures: SIGNED_BY,
    filed_at: AT,
    hearing_date: "2026-11-04",
    user_pays: true,
    ...over,
  });

/** A sitting court with a filed compromise, and a mock server that keeps state. */
function court(kase: Event = {}, attemptOver: Event = {}) {
  clock = 0;
  const s = {
    kase: caseOf({
      user_role: "plaintiff",
      ai_role: "defendant",
      status: "active",
      hearing_controlled_here: true,
      session_args_at_start: 0,
      reported: [],
      pending_leave: null,
      is_ai_examining: false,
      settlement_profile: PROFILE,
      settlements: [talks(attemptOver)],
      courtroom_proceedings: [
        ev("e1", "system_message", "Court is in session"),
        ev("e2", "opening_statement", "May it please the court. The applicant never meant to cheat anyone.", "plaintiff"),
        ev("e3", "system_message", "Verification of compromise · listed before the court"),
        ev("e4", "settlement", CALL, "judge", { speaker_name: "The Court" }),
      ],
      ...kase,
    }) as unknown as Event & { courtroom_proceedings: Event[] },
    view: view({ attempt: talks(attemptOver), attempts: 1, can_start: false, deed: DEED }) as Event,
  };
  const push = (...e: Event[]) => {
    s.kase = { ...s.kase, courtroom_proceedings: [...s.kase.courtroom_proceedings, ...e] };
  };
  const routes: Record<string, unknown> = {
    [`GET ${base}`]: (route: Route) => route.fulfill({ json: s.kase }),
    [`GET ${base}/settlement`]: (route: Route) => route.fulfill({ json: s.view }),
    [`GET ${base}/witness/current`]: { has_witness: false, examination_history: [], is_ai_examining: false },
    [`GET ${base}/parties`]: {
      parties: PARTIES,
      user_role: "plaintiff",
      can_access_courtroom: true,
      is_in_courtroom: true,
      case_status: "active",
    },
    "GET /limit/argument": { remaining_attempts: 7, max_attempts: 10, seconds_until_next: null },
    [`POST ${base}/analyze-negotiation`]: { negotiation: NEGOTIATION },
    [`POST ${base}/analyze-case`]: { analysis: "### Outcome\nSettled.\n\n### Mistakes\n- You opened weakly.", outcome: "settled" },
  };
  return { s, push, routes };
}

async function open(page: Page, stamp = true) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${base}/courtroom`);
  await expect(page.getByRole("heading", { level: 1, name: "Raghav Menon v. State of NCT of Delhi and Another" })).toBeVisible();
  if (stamp) await expect(page.getByText("COURT IS IN SESSION", { exact: true })).toBeHidden({ timeout: 6000 });
  return page.getByRole("log", { name: "Record of proceedings" });
}

/** The court's checks sit in the witness stand's place: a rail beside the record, or a sheet on a phone. */
async function checksPanel(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole("button", { name: "Court’s checks" }).click();
  else {
    // It starts open beside the hearing; the verdict or a refresh may have folded it away.
    const fold = page.getByRole("button", { name: /^Open the court’s checks/ });
    if (await fold.isVisible()) await fold.click();
  }
  return page.getByRole("complementary", { name: "The court’s checks" });
}

test.describe("the compromise in the courtroom", () => {
  test("counsel makes the submission, the court hears it on the record, and quashes the FIR", async ({ page, signIn, checkA11y }, info) => {
    const mobile = info.project.name !== "desktop";
    const h = court();
    let said = "";
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/settlement/hearing`]: async (route: Route) => {
        said = route.request().postDataJSON().submission;
        h.push(
          ev("h1", "settlement", said, "plaintiff", { speaker_name: "Counsel for the Plaintiff" }),
          ev("h2", "settlement", "The State has no objection.", "state", { speaker_name: "APP for the State", tag: "No objection" }),
          ev("h3", "settlement", "Did you sign of your own free will?", "judge", { speaker_name: "The Court to Priya Khanna" }),
          ev("h4", "settlement", "Yes, My Lord.", "complainant", { speaker_name: "Priya Khanna" }),
          ev(
            "h5",
            "settlement",
            "The compromise is genuine.\n\n1. FIR No. 41/2025 and all proceedings arising from it are quashed.",
            "judge",
            {
              speaker_name: "The Court",
              tag: "Granted",
              sustained: true,
            },
          ),
          ev("h6", "system_message", "Case disposed of on compromise"),
        );
        const done = talks({ status: "recorded", hearing: HEARING, payments: PAYMENTS, ended_at: AT });
        h.s.kase = {
          ...h.s.kase,
          status: "resolved",
          outcome: "settled",
          settlement_result: "quashed",
          verdict: ORDER,
          settlements: [done],
        };
        h.s.view = view({ attempt: done, attempts: 1, can_start: false, deed: DEED });
        await route.fulfill({ json: h.s.view });
      },
    });
    const log = await open(page);

    // The court calls the matter on the same record as the hearing so far.
    await expect(log.getByText("May it please the court. The applicant never meant to cheat anyone.")).toBeVisible();
    await expect(log.getByText(CALL)).toBeVisible();
    const box = page.getByRole("textbox", { name: "Your submission" });
    await expect(box).toHaveValue(DRAFT);
    // The pre-filled submission shows in full: the box grows to fit it.
    expect((await box.boundingBox())!.height).toBeGreaterThan(50);
    if (!mobile) await expect(page.getByRole("complementary", { name: "The court’s checks" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Closing statement" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Ask for an adjournment to settle|Time to settle/ })).toHaveCount(0);
    await checkA11y();

    await box.fill(HEARING.submission);
    await page.getByRole("button", { name: "Make submission" }).click();

    const verdict = page.getByRole("dialog", { name: "Verdict" });
    await expect(verdict).toBeVisible({ timeout: 8000 });
    expect(said).toBe(HEARING.submission);
    await expect(verdict.getByText("SETTLED")).toBeVisible();
    await expect(verdict.getByText("FIR No. 41/2025 and all proceedings arising from it are quashed.")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(log.getByText("No objection", { exact: true })).toBeVisible();
    await expect(log.getByText("Did you sign of your own free will?")).toBeVisible();
    await expect(log.getByText("Granted", { exact: true })).toBeVisible();
    await expect(log.getByText("APP for the State")).toBeVisible();

    const rail = await checksPanel(page, mobile);
    await expect(rail.getByText("Priya Khanna confirmed in court.")).toBeVisible();
    await expect(rail.getByRole("button", { name: "Confirm first deposit" })).toBeVisible();
    if (mobile) await rail.getByRole("button", { name: "Back to the proceedings" }).click();

    // One analysis button, with a tab for the courtroom and one for the negotiation.
    await page.getByRole("button", { name: "Case analysis" }).click();
    const argued = page.getByRole("dialog", { name: "How you argued" });
    await expect(argued.getByText("You opened weakly.")).toBeVisible();
    await argued.getByRole("tab", { name: "Negotiation" }).click();
    const negotiated = page.getByRole("dialog", { name: "How you negotiated" });
    await expect(negotiated.getByText("Settling was the right call")).toBeVisible();
    await expect(negotiated.getByText("You anchored at ₹42,00,000 over a year.")).toBeVisible();
    await expect(negotiated.getByRole("tab", { name: "Negotiation" })).toHaveAttribute("aria-selected", "true");
  });

  test("a refused compromise lists the case for hearing on the merits", async ({ page, signIn }, info) => {
    const h = court();
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/settlement/hearing`]: async (route: Route) => {
        h.push(
          ev("h1", "settlement", route.request().postDataJSON().submission, "plaintiff"),
          ev("h2", "settlement", "An attempt to murder is not a private dispute.\n\n1. The application is dismissed.", "judge", {
            speaker_name: "The Court",
            tag: "Refused",
            sustained: false,
          }),
          ev("h3", "system_message", "Matter listed for hearing on the merits on 02 December 2026"),
        );
        const refused = talks({ status: "refused", ended_at: AT, hearing: { ...HEARING, outcome: "refused", next_date: "2026-12-02" } });
        h.s.kase = { ...h.s.kase, status: "adjourned", settlements: [refused] };
        h.s.view = view({ attempt: refused, attempts: 1, can_start: false, closed: "The court refused the compromise.", deed: DEED });
        await route.fulfill({ json: h.s.view });
      },
    });
    const log = await open(page);

    await page.getByRole("button", { name: "Make submission" }).click();

    await expect(log.getByText("Matter listed for hearing on the merits on 02 December 2026")).toBeVisible({ timeout: 8000 });
    await expect(log.getByText("Refused", { exact: true })).toBeVisible();
    await expect(page.getByText("adjourned", { exact: true })).toBeVisible();
    // Back to the merits: the witness stand returns.
    if (info.project.name === "desktop") await expect(page.getByRole("button", { name: /^Open the witness stand/ })).toBeVisible();
    else await expect(page.getByRole("button", { name: "Witness stand" })).toBeVisible();
  });

  test("counsel for the complainants answers a missed instalment", async ({ page, signIn }, info) => {
    const missed = [{ ...PAYMENTS[0], status: "paid" }, { ...PAYMENTS[1], status: "missed" }, PAYMENTS[2]];
    const done = (payments: Event[]) => talks({ status: "recorded", hearing: HEARING, payments, user_pays: false, ended_at: AT });
    const h = court({
      status: "resolved",
      outcome: "settled",
      verdict: ORDER,
      settlement_profile: { ...PROFILE, accused_side: "defendant" },
      settlements: [done(missed)],
    });
    h.s.view = {
      ...view({ attempt: done(missed), attempts: 1, can_start: false, deed: DEED }),
      profile: { ...PROFILE, accused_side: "defendant" },
    };
    let action = "";
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/settlement/payments/1`]: async (route: Route) => {
        action = route.request().postDataJSON().action;
        h.s.view = { ...h.s.view, attempt: done([missed[0], { ...missed[1], remedy: "recall", remedy_at: AT }, missed[2]]) };
        await route.fulfill({ json: h.s.view });
      },
    });
    await open(page, false);

    const rail = await checksPanel(page, info.project.name !== "desktop");
    await expect(rail.getByText("Instalment 2 missed")).toBeVisible();
    // The quashing can't be recalled for a breach: the remedy is contempt of the undertaking to pay.
    await rail.getByRole("button", { name: "File a contempt petition" }).click();
    await expect(rail.getByText("Contempt petition filed.", { exact: true })).toBeVisible();
    expect(action).toBe("recall");
  });

  test("the client pays on their own; a default after notice comes back to the court, and counsel answers it", async ({
    page,
    signIn,
  }, info) => {
    const order = [
      { amount: 1400000, due: day(-4), paid_at: null, remedy: null, remedy_at: null, status: "paid", paid_on: day(-4), notice_until: null },
      {
        amount: 1400000,
        due: day(-3),
        paid_at: null,
        remedy: null,
        remedy_at: null,
        status: "defaulted",
        paid_on: null,
        notice_until: null,
      },
      { amount: 1589000, due: day(-2), paid_at: null, remedy: null, remedy_at: null, status: "held", paid_on: null, notice_until: null },
    ];
    const listed = {
      kind: "contempt",
      by: "ai",
      instalment: 1,
      filed_on: day(-2),
      listed_for: day(0),
      hearing: null,
      pay_by: null,
      result: null,
    };
    const simulated = (over: Event = {}) =>
      talks({
        status: "recorded",
        hearing: HEARING,
        payments: order,
        ended_at: AT,
        pace: "days",
        stage: "enforcement",
        enforcement: listed,
        ...over,
      });
    const h = court({ status: "resolved", outcome: "settled", verdict: ORDER, settlements: [simulated()] });
    h.s.view = view({ attempt: simulated(), attempts: 1, can_start: false, deed: DEED });
    let said = "";
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/settlement/enforcement`]: async (route: Route) => {
        said = route.request().postDataJSON().submission;
        const heard = {
          ...listed,
          pay_by: day(1),
          hearing: {
            submission: said,
            lines: [],
            outcome: "time",
            judge: "S. Iyer",
            ruling: "The breach is not shown to be wilful.",
            order: ["The balance shall be paid within a week."],
            held_at: AT,
          },
        };
        h.s.view = { ...h.s.view, attempt: simulated({ enforcement: heard }) };
        await route.fulfill({ json: h.s.view });
      },
    });
    await open(page, false);

    const rail = await checksPanel(page, info.project.name !== "desktop");
    await expect(rail.getByText("Day 3 of 3")).toBeVisible();
    await expect(rail.getByText("Defaulted", { exact: true })).toBeVisible();
    await expect(rail.getByText(/Contempt petition · listed/)).toBeVisible();
    // Nothing for counsel to deposit: the client pays on their own.
    await expect(rail.getByRole("button", { name: /Pay instalment|Confirm first deposit/ })).toHaveCount(0);
    await rail.getByLabel("Your submission to the court").fill("My Lord, my client lost his job and will pay the balance within the week.");
    await rail.getByRole("button", { name: "Address the court" }).click();
    await expect(rail.getByText("Contempt petition · Not wilful: time to pay")).toBeVisible();
    await expect(rail.getByText("The balance shall be paid within a week.")).toBeVisible();
    expect(said).toMatch(/^My Lord, my client lost his job/);
  });

  test("counsel for the complainants takes a default after notice back to the court", async ({ page, signIn }, info) => {
    const order = [
      {
        amount: 1400000,
        due: day(-3),
        paid_at: null,
        remedy: null,
        remedy_at: null,
        status: "defaulted",
        paid_on: null,
        notice_until: null,
      },
      { amount: 1400000, due: day(-2), paid_at: null, remedy: null, remedy_at: null, status: "held", paid_on: null, notice_until: null },
    ];
    const simulated = (over: Event = {}) =>
      talks({
        status: "recorded",
        hearing: HEARING,
        payments: order,
        user_pays: false,
        ended_at: AT,
        pace: "days",
        stage: "defaulted",
        ...over,
      });
    const profile = { ...PROFILE, accused_side: "defendant" };
    const h = court({ status: "resolved", outcome: "settled", verdict: ORDER, settlement_profile: profile, settlements: [simulated()] });
    h.s.view = { ...view({ attempt: simulated(), attempts: 1, can_start: false, deed: DEED }), profile };
    let filed = false;
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/settlement/enforcement/file`]: async (route: Route) => {
        filed = true;
        const e = {
          kind: "contempt",
          by: "user",
          instalment: 0,
          filed_on: day(0),
          listed_for: day(2),
          hearing: null,
          pay_by: null,
          result: null,
        };
        h.s.view = { ...h.s.view, attempt: simulated({ stage: "enforcement", enforcement: e }) };
        await route.fulfill({ json: h.s.view });
      },
    });
    await open(page, false);

    const rail = await checksPanel(page, info.project.name !== "desktop");
    await expect(rail.getByText("Instalment 1 unpaid after notice")).toBeVisible();
    await rail.getByRole("button", { name: "File a contempt petition" }).click();
    await expect(rail.getByText(/^You filed it on/)).toBeVisible();
    await expect(rail.getByRole("button", { name: "Address the court" })).toHaveCount(0); // heard on the day listed
    expect(filed).toBe(true);
  });

  const row = (n: number, status: string, over: Event = {}) => ({
    amount: 1400000,
    due: day(n),
    paid_at: null,
    remedy: null,
    remedy_at: null,
    status,
    paid_on: null,
    notice_until: null,
    ...over,
  });

  // Each stage the payments under a simulated order can reach, and what the rail says of it.
  const STAGES: [string, Event, Event, (string | RegExp)[]][] = [
    [
      "a missed instalment in notice",
      PROFILE,
      { stage: "notice", payments: [row(-1, "paid", { paid_on: day(-1) }), row(0, "missed", { notice_until: day(1) })] },
      ["Instalment 2 missed", /Notice has gone out under the deed/, "In notice", /^Paid on the day,/],
    ],
    [
      "the contempt punished",
      PROFILE,
      {
        stage: "punished",
        payments: [row(-6, "defaulted")],
        enforcement: {
          kind: "contempt",
          by: "ai",
          instalment: 0,
          filed_on: day(-5),
          listed_for: day(-3),
          hearing: null,
          pay_by: day(-2),
          result: "punished",
        },
      },
      ["Sentenced for contempt", /recovered by a suit on the deed/],
    ],
    [
      "a default on compounding left to a civil suit",
      { ...PROFILE, route: "compound" },
      {
        stage: "suit",
        payments: [row(-4, "defaulted")],
        enforcement: {
          kind: "suit",
          by: "ai",
          instalment: 0,
          filed_on: day(-2),
          listed_for: null,
          hearing: null,
          pay_by: null,
          result: null,
        },
      },
      ["Left to a civil suit", /The acquittal stands/],
    ],
    [
      "the balance recovered under a warrant",
      { ...PROFILE, route: "plea" },
      {
        stage: "closed",
        closed_on: day(-1),
        payments: [row(-6, "late", { paid_on: day(-1) })],
        enforcement: {
          kind: "recovery",
          by: "ai",
          instalment: 0,
          filed_on: day(-4),
          listed_for: day(-2),
          hearing: null,
          pay_by: day(-1),
          result: "recovered",
        },
      },
      ["Fully closed", /recovered under the court’s warrant/, "Paid in full"],
    ],
  ];

  for (const [name, profile, over, texts] of STAGES) {
    test(`simulated payments: ${name}`, async ({ page, signIn }, info) => {
      const done = talks({ status: "recorded", hearing: HEARING, ended_at: AT, pace: "days", ...over });
      const h = court({ status: "resolved", outcome: "settled", verdict: ORDER, settlement_profile: profile, settlements: [done] });
      h.s.view = { ...view({ attempt: done, attempts: 1, can_start: false, deed: DEED }), profile };
      await signIn(USERS.email, h.routes);
      await open(page, false);

      const rail = await checksPanel(page, info.project.name !== "desktop");
      for (const t of texts) await expect(rail.getByText(t).first()).toBeVisible();
      await expect(rail.getByRole("button", { name: /dev · next day/ })).toHaveCount(0); // developers only
    });
  }

  test("developer mode plays the payments a day forward", async ({ page, signIn }, info) => {
    const done = (over: Event) => talks({ status: "recorded", hearing: HEARING, ended_at: AT, pace: "days", ...over });
    const first = done({ stage: "paying", payments: [row(0, "due"), row(1, "upcoming")] });
    const h = court({ status: "resolved", outcome: "settled", verdict: ORDER, settlements: [first] });
    h.s.view = view({ attempt: first, attempts: 1, can_start: false, deed: DEED });
    let moved = 0;
    await page.addInitScript(() => localStorage.setItem("aiCourtroom-settings", JSON.stringify({ devMode: true })));
    await signIn({ ...USERS.email, is_developer: true } as typeof USERS.email, {
      ...h.routes,
      [`POST ${base}/settlement/next-day`]: async (route: Route) => {
        moved += 1;
        const next = done({ stage: "paying", payments: [row(-1, "paid", { paid_on: day(-1) }), row(0, "due")] });
        h.s.view = { ...h.s.view, attempt: next };
        await route.fulfill({ json: h.s.view });
      },
    });
    await open(page, false);

    const rail = await checksPanel(page, info.project.name !== "desktop");
    await expect(rail.getByText("Day 1 of 2")).toBeVisible();
    await rail.getByRole("button", { name: "dev · next day →" }).click();
    await expect(rail.getByText("Day 2 of 2")).toBeVisible();
    expect(moved).toBe(1);
  });

  test("the old hearing page opens the courtroom", async ({ page, signIn }) => {
    const h = court();
    await signIn(USERS.email, h.routes);
    await page.goto(`${base}/settlement/hearing`);
    await expect(page).toHaveURL(new RegExp(`${base}/courtroom$`));
  });
});
