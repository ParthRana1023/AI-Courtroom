import type { Route } from "@playwright/test";
import { test, expect, USERS } from "./support/fixtures";
import { CNR, PARTIES, caseOf } from "./support/case-data";
import { PROFILE, T2, agreedTalks, attempt } from "./support/settlement-data";

const prepRoutes = (c: ReturnType<typeof caseOf>) => ({
  "GET /cases/DLND010004212026/parties": {
    parties: PARTIES,
    user_role: c.user_role,
    can_access_courtroom: false,
    is_in_courtroom: false,
    case_status: c.status,
  },
  "GET /cases/DLND010004212026/evidence": { evidence: c.evidence },
  "GET /cases/DLND010004212026/parties/p1/chat-history": { messages: [] },
});

test.describe("case details", () => {
  test("reads the petition into the seven-part case file", async ({ page, signIn, checkA11y }, info) => {
    await signIn(USERS.email, { [`GET /cases/${CNR}`]: caseOf() });
    await page.goto(`/cases/${CNR}`);

    const file = page.getByRole("article", { name: "Case file" });
    await expect(file.getByText("I, Raghav Menon, verify that the contents are true.", { exact: false })).toBeAttached();
    for (const s of ["Case summary", "Parties", "Facts of the case", "Charges", "Evidence", "Issues for the court", "Prayer"]) {
      await expect(file.getByRole("heading", { name: new RegExp(s) })).toBeVisible();
    }
    await expect(file.getByText("The applicant seeks the quashing of FIR No. 41/2025", { exact: false })).toBeVisible();
    await expect(file.getByText("Non-applicant No. 2")).toBeVisible();
    await expect(file.getByText("§ 336 BNS · Forgery")).toBeVisible();
    await expect(file.getByText("EX-02")).toBeVisible();
    await expect(file.getByText("No intention at the outset.", { exact: false })).toBeVisible();
    await expect(file.getByText("Quash FIR No. 41/2025 and all proceedings arising from it")).toBeVisible();

    if (info.project.name === "desktop") {
      await expect(page.getByText("High Court of Delhi · Filed 28 Sep 2026")).toBeVisible();
      await expect(page.getByText("§ 318 Cheating · § 316 Criminal breach of trust")).toBeVisible();
      await page
        .getByRole("navigation", { name: "Case file contents" })
        .getByRole("button", { name: /Prayer/ })
        .click();
      await expect(page.getByRole("navigation", { name: "Case file contents" }).getByRole("button", { name: /Prayer/ })).toHaveAttribute(
        "aria-current",
        "true",
      );
    } else {
      await page.getByLabel("Jump to section").selectOption("charges");
      await expect(file.getByText("§ 336 BNS · Forgery")).toBeInViewport();
    }
    await checkA11y();
  });

  test("a petition with dash-led parties and lettered points still fills Parties and Facts", async ({ page, signIn }) => {
    const variant = [
      "**IN THE Bombay High Court**",
      "**IN THE MATTER OF:**",
      "1. **Rahul Nair**, 31 years, Senior Manager – Infrastructure, Mumbai – **APPLICANT**",
      "**VERSUS**",
      "1. **State of Maharashtra**, through SHO, Andheri – **NON‑APPLICANT NO. 1**",
      "**MOST RESPECTFULLY SHEWETH:**",
      "1. That the applicant seeks quashing of FIR No. 12/2025.",
      "2. That the prosecution’s case is as follows:",
      "   a) On 08-08-2025 the complainant visited the resort.",
      "   b) She alleges a shot was fired in Cabin C-7.",
      "**GROUNDS:**",
      "A. **No evidence of a firearm:** None was recovered.",
    ].join("\n");
    await signIn(USERS.email, { [`GET /cases/${CNR}`]: caseOf({ case_text: variant }) });
    await page.goto(`/cases/${CNR}`);

    const file = page.getByRole("article", { name: "Case file" });
    await expect(file.getByText("Non-applicant No. 1")).toBeVisible();
    await expect(file.getByText("Rahul Nair, 31 years", { exact: false })).toBeVisible();
    await expect(file.getByText("The prosecution’s case is as follows.")).toBeVisible();
    await expect(file.getByText("She alleges a shot was fired in Cabin C-7.")).toBeVisible();
    await expect(file.getByText("The applicant seeks quashing of FIR No. 12/2025.")).toBeVisible();
  });

  test("taking a side asks first, then records it and opens Case Prep", async ({ page, signIn }) => {
    let body: unknown = null;
    const picked = caseOf({ user_role: "plaintiff", ai_role: "defendant" });
    await signIn(USERS.email, {
      [`GET /cases/${CNR}`]: (route: Route) => route.fulfill({ json: body ? picked : caseOf() }),
      [`PUT /cases/${CNR}/roles`]: async (route: Route) => {
        body = route.request().postDataJSON();
        await route.fulfill({ json: { images_queued: 1 } });
      },
      ...prepRoutes(picked),
    });
    await page.goto(`/cases/${CNR}`);

    await page.getByRole("button", { name: /^Plaintiff Lawyer/ }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("heading", { name: "Represent the plaintiff?" })).toBeVisible();
    await expect(dialog).toContainText("argue the case for Raghav Menon. The AI will argue for State of NCT of Delhi and Priya Khanna.");
    await expect(dialog.getByText("You can’t switch sides later.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Take the plaintiff’s side" })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: /^Defendant Lawyer/ }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();

    // The applicant has signed the petition; its advocate signs once a side is chosen.
    const file = page.getByRole("region", { name: "Case file text" });
    await expect(file.getByRole("img", { name: "Signed: Raghav Menon" }).locator("svg")).toBeAttached();
    await expect(file.getByText("Signs when you choose a side")).toBeAttached();

    await page.getByRole("button", { name: /^Plaintiff Lawyer/ }).click();
    await page.getByRole("button", { name: "Take the plaintiff’s side" }).click();
    // Taking the applicant's brief, the user signs the petition as its counsel.
    await expect(file.getByRole("img", { name: "Signed: Aanya Kapoor" })).toBeAttached();
    await expect(page.getByText("Preparing your case file")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/cases/${CNR}/case-prep$`));
    expect(body).toEqual({ user_role: "plaintiff", ai_role: "defendant" });
  });

  test("a chosen side shows the stamp and the way to Case Prep", async ({ page, signIn }) => {
    await signIn(USERS.email, { [`GET /cases/${CNR}`]: caseOf({ user_role: "defendant", ai_role: "plaintiff" }) });
    await page.goto(`/cases/${CNR}`);
    await expect(page.getByText("FOR THE DEFENCE")).toBeVisible();
    await expect(page.getByText("You are the Defendant Lawyer")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Case Prep →" })).toHaveAttribute("href", `/cases/${CNR}/case-prep`);
    await expect(page.getByRole("button", { name: /^Plaintiff Lawyer/ })).toHaveCount(0);
    // The petition stays signed by the counsel it names, now the other side's.
    const file = page.getByRole("region", { name: "Case file text" });
    await expect(file.getByRole("img", { name: "Signed: Vikram Sethi" }).locator("svg")).toBeAttached();
    await expect(file.getByText("D/871/2009")).toBeAttached();
  });

  test("a failed load can be retried; a missing case says so", async ({ page, signIn }) => {
    let fail = true;
    await signIn(USERS.email, {
      [`GET /cases/${CNR}`]: (route: Route) => (fail ? route.fulfill({ status: 500, json: {} }) : route.fulfill({ json: caseOf() })),
      "GET /cases/MISSING000000000": (route: Route) => route.fulfill({ status: 404, json: { detail: "Case not found" } }),
    });
    await page.goto(`/cases/${CNR}`);
    await expect(page.getByText("Couldn’t open the case file")).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: /Case summary/ })).toBeVisible();

    await page.goto("/cases/MISSING000000000");
    await expect(page.getByText("Case Not Found")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to my cases" })).toHaveAttribute("href", "/cases");
  });

  test("offline, choosing a side waits for the connection", async ({ page, context, signIn }) => {
    await signIn(USERS.email, { [`GET /cases/${CNR}`]: caseOf() });
    await page.goto(`/cases/${CNR}`);
    await expect(page.getByRole("heading", { name: /Case summary/ })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("button", { name: /^Plaintiff Lawyer/ }).click();
    await expect(page.getByText("You’re offline. Choose a side when you’re back online.")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await context.setOffline(false);
  });

  test("a settled case leads with when and how it settled", async ({ page, signIn }) => {
    const deal = attempt(agreedTalks, {
      status: "recorded",
      agreed: T2,
      ended_at: "2026-11-04T11:00:00Z",
      payments: [
        { amount: 1400000, due: "2026-12-04", paid_at: "2026-12-01T10:00:00Z", remedy: null, remedy_at: null, status: "paid" },
        { amount: 1400000, due: "2027-03-04", paid_at: null, remedy: null, remedy_at: null, status: "upcoming" },
        { amount: 1494500, due: "2027-05-04", paid_at: null, remedy: null, remedy_at: null, status: "upcoming" },
      ],
    });
    await signIn(USERS.email, {
      [`GET /cases/${CNR}`]: caseOf({
        user_role: "plaintiff",
        ai_role: "defendant",
        status: "resolved",
        outcome: "settled",
        settlement_result: "quashed",
        settlement_profile: PROFILE,
        settlements: [deal],
      }),
    });
    await page.goto(`/cases/${CNR}`);

    const banner = page.getByRole("region", { name: "Settled on 4 November 2026" });
    await expect(
      banner.getByText("The High Court of Delhi quashed the FIR on the compromise under § 528 BNSS.", { exact: false }),
    ).toBeVisible();
    await expect(banner.getByText("Payments are tracked until May 2027.", { exact: false })).toBeVisible();
    await expect(banner.getByRole("link", { name: "Order and payments" })).toHaveAttribute("href", `/cases/${CNR}/courtroom`);
    await expect(banner.getByRole("link", { name: "The deed" })).toHaveAttribute("href", `/cases/${CNR}/settlement`);
    await expect(page.getByText("Settled · FIR quashed").first()).toBeVisible();
  });

  test("a settled case with simulated payments says where they stand", async ({ page, signIn }) => {
    const deal = attempt(agreedTalks, {
      status: "recorded",
      agreed: T2,
      ended_at: "2026-11-04T11:00:00Z",
      pace: "days",
      stage: "enforcement",
      payments: [
        { amount: 1400000, due: "2026-11-05", paid_at: null, remedy: null, remedy_at: null, status: "defaulted" },
        { amount: 1400000, due: "2026-11-06", paid_at: null, remedy: null, remedy_at: null, status: "held" },
      ],
    });
    await signIn(USERS.email, {
      [`GET /cases/${CNR}`]: caseOf({
        user_role: "plaintiff",
        ai_role: "defendant",
        status: "resolved",
        outcome: "settled",
        settlement_result: "quashed",
        settlement_profile: PROFILE,
        settlements: [deal],
      }),
    });
    await page.goto(`/cases/${CNR}`);

    const banner = page.getByRole("region", { name: "Settled on 4 November 2026" });
    await expect(
      banner.getByText("The complainants have taken the default back to the court; see the courtroom.", { exact: false }),
    ).toBeVisible();
    await expect(banner.getByText("Payments are tracked until", { exact: false })).toHaveCount(0);
  });
});
