import type { Route } from "@playwright/test";
import { test, expect, USERS } from "./support/fixtures";
import { CNR, caseOf } from "./support/case-data";
import { AT, DEED, NEGOTIATION, PROFILE, SIGNED_BY, T2, agreedTalks, attempt, view } from "./support/settlement-data";

const base = `/cases/${CNR}`;
const hearingAt = `${base}/settlement/hearing`;

const HEARING = {
  submission: "My Lord, the accused and all 2 complainants have settled.",
  lines: [
    {
      kind: "speech",
      role: "other",
      who: "Counsel for the complainants",
      tag: "",
      unsure: false,
      text: "We confirm the compromise, My Lord.",
    },
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
    { kind: "speech", role: "court", who: "The Court", tag: "", unsure: false, text: "The compromise is voluntary." },
  ],
  checks: [
    { label: "Every complainant agreed freely", state: "ok", text: "Priya Khanna confirmed in court." },
    { label: "The dispute is private", state: "ok", text: "Money paid for flats." },
    { label: "The State’s view", state: "ok", text: "No objection." },
  ],
  outcome: "granted",
  judge: "R. K. Mehta",
  order: ["FIR No. 41/2025 and all proceedings arising from it are quashed.", "The first instalment shall be deposited within two weeks."],
  next_date: null,
  held_at: "2026-11-04T05:00:00Z",
};
const PAYMENTS = [
  { amount: 1400000, due: "2026-11-18", paid_at: null, remedy: null, remedy_at: null, status: "upcoming" },
  { amount: 1400000, due: "2027-02-04", paid_at: null, remedy: null, remedy_at: null, status: "upcoming" },
  { amount: 1589000, due: "2027-05-04", paid_at: null, remedy: null, remedy_at: null, status: "upcoming" },
];

const filed = (over: Record<string, unknown> = {}) =>
  view({
    attempt: attempt(agreedTalks, {
      status: "filed",
      agreed: T2,
      signatures: SIGNED_BY,
      filed_at: AT,
      hearing_date: "2026-11-04",
      user_pays: true,
      ...over,
    }),
    attempts: 1,
    can_start: false,
    deed: DEED,
  });

const routes = (over: Record<string, unknown> = {}, status = "adjourned") => ({
  [`GET ${base}`]: caseOf({ user_role: "plaintiff", ai_role: "defendant", status }),
  [`GET ${base}/settlement`]: filed(),
  [`POST ${base}/analyze-negotiation`]: { negotiation: NEGOTIATION },
  ...over,
});

test.describe("settlement hearing", () => {
  test("the matter is called, counsel submits, and the court quashes the FIR", async ({ page, signIn, checkA11y }, info) => {
    const mobile = info.project.name !== "desktop";
    let said = "";
    await signIn(
      USERS.email,
      routes({
        [`POST ${base}/settlement/hearing`]: async (route: Route) => {
          said = route.request().postDataJSON().submission;
          await route.fulfill({ json: filed({ status: "recorded", hearing: HEARING, payments: PAYMENTS }) });
        },
      }),
    );
    await page.goto(hearingAt);

    await expect(page.getByRole("heading", { name: "Raghav Menon v. State of NCT of Delhi and Another", level: 1 })).toBeVisible();
    await expect(page.getByText("Listed", { exact: true }).first()).toBeVisible(); // the chip; the step rail says it too
    const record = page.getByRole("log");
    await expect(record.getByText(/joint application under section 528 BNSS/)).toBeVisible();
    await checkA11y();

    await page.getByRole("button", { name: "Call the matter →" }).click();
    const box = page.getByRole("textbox", { name: "Your submission" });
    await expect(box).toHaveValue(/^My Lord, the accused and all 2 complainants have settled\. The accused will pay ₹42,00,000/);
    await box.fill("My Lord, the parties have settled and every complainant has signed the deed.");
    await page.getByRole("button", { name: "Make submission" }).click();

    await expect(record.getByText("No objection", { exact: true })).toBeVisible();
    expect(said).toBe("My Lord, the parties have settled and every complainant has signed the deed.");
    await expect(record.getByText("Did you sign of your own free will?")).toBeVisible();
    const order = page.getByRole("article", { name: "Order of the court" });
    await expect(order.getByText("QUASHED", { exact: true })).toBeVisible();
    await expect(order.getByText("FIR No. 41/2025 and all proceedings arising from it are quashed.")).toBeVisible();
    await expect(order.getByRole("img", { name: "Signed: R. K. Mehta" })).toBeAttached();
    await expect(order.getByText("R. K. Mehta, J.")).toBeVisible();
    await expect(page.getByText("Quashed · settled")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to My Cases" })).toHaveAttribute("href", "/cases");

    if (mobile) await page.getByRole("tab", { name: "Checks" }).click();
    const rail = page.getByRole("complementary", { name: "The court’s checks" });
    await expect(rail.getByRole("heading", { name: "Payments" })).toBeVisible();
    await expect(rail.getByText("₹15,89,000")).toBeVisible();
    await expect(rail.getByRole("button", { name: "Confirm first deposit" })).toBeVisible();
    await expect(rail.getByText("78", { exact: true })).toBeVisible();
    await expect(rail.getByText("Strong", { exact: true })).toBeVisible();
    await expect(rail.getByText("Settling was the right call")).toBeVisible();
    await expect(rail.getByText("₹39,00,000 · 4 instalments · 12 mo · 6% interest")).toBeVisible();
    await expect(rail.getByText("Offering a deposit in court moved talks to agreement.")).toBeVisible();
    await expect(rail.getByText("Priya Khanna confirmed in court.")).toBeVisible();
    await rail.getByRole("button", { name: "Read the full review" }).click();
    const review = page.getByRole("dialog", { name: "How you negotiated" });
    await expect(review.getByText("You anchored at ₹42,00,000 over a year.")).toBeVisible();
    await expect(review.getByText("78 · Strong")).toBeVisible();
  });

  test("a refused compromise sends the case back to its merits", async ({ page, signIn }, info) => {
    const refused = { ...HEARING, outcome: "refused", next_date: "2026-12-02" };
    await signIn(USERS.email, routes({ [`GET ${base}/settlement`]: filed({ status: "refused", hearing: refused, ended_at: AT }) }));
    await page.goto(hearingAt);

    await expect(page.getByText("Quash refused")).toBeVisible();
    await expect(page.getByRole("article", { name: "Order of the court" }).getByText("REFUSED", { exact: true })).toBeVisible();
    await expect(page.getByText("The petition continues. Prepare for arguments on 2 December 2026.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Case Prep" })).toHaveAttribute("href", `${base}/case-prep`);
    if (info.project.name !== "desktop") await page.getByRole("tab", { name: "Checks" }).click();
    await expect(page.getByRole("heading", { name: "Next date · 2 December 2026" })).toBeVisible();
  });

  test("counsel for the complainants answers a missed instalment", async ({ page, signIn }, info) => {
    const missed = [{ ...PAYMENTS[0], status: "paid" }, { ...PAYMENTS[1], status: "missed" }, PAYMENTS[2]];
    const complainants = { ...PROFILE, accused_side: "defendant" };
    const recorded = (payments: object[]) => ({
      ...filed({ status: "recorded", hearing: HEARING, payments, user_pays: false }),
      profile: complainants,
    });
    let action = "";
    await signIn(
      USERS.email,
      routes(
        {
          [`GET ${base}/settlement`]: recorded(missed),
          [`POST ${base}/settlement/payments/1`]: async (route: Route) => {
            action = route.request().postDataJSON().action;
            await route.fulfill({ json: recorded([missed[0], { ...missed[1], remedy: "recall", remedy_at: AT }, missed[2]]) });
          },
        },
        "resolved",
      ),
    );
    await page.goto(hearingAt);

    if (info.project.name !== "desktop") await page.getByRole("tab", { name: "Checks" }).click();
    const rail = page.getByRole("complementary", { name: "The court’s checks" });
    await expect(rail.getByText("Instalment 2 missed")).toBeVisible();
    await expect(rail.getByText(/Raghav Menon didn’t pay ₹14,00,000 due on 4 February 2027/)).toBeVisible();
    await rail.getByRole("button", { name: "Apply to recall the order" }).click();

    await expect(rail.getByText("Recall application filed.", { exact: true })).toBeVisible();
    expect(action).toBe("recall");
    await expect(rail.getByRole("button", { name: "Apply to recall the order" })).toHaveCount(0);
  });

  test("before the deed is filed, no hearing is listed", async ({ page, signIn }) => {
    await signIn(
      USERS.email,
      routes({ [`GET ${base}/settlement`]: view({ attempt: attempt(agreedTalks.slice(0, 2)), attempts: 1, can_start: false }) }),
    );
    await page.goto(hearingAt);

    await expect(page.getByRole("heading", { name: "No hearing is listed" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the settlement desk" })).toHaveAttribute("href", `${base}/settlement`);
  });
});
