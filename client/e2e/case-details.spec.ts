import type { Route } from "@playwright/test";
import { test, expect, USERS } from "./support/fixtures";
import { CNR, PARTIES, caseOf } from "./support/case-data";

const prepRoutes = (c: ReturnType<typeof caseOf>) => ({
  "GET /cases/DLND010004212026/parties": { parties: PARTIES, user_role: c.user_role, can_access_courtroom: false, is_in_courtroom: false, case_status: c.status },
  "GET /cases/DLND010004212026/evidence": { evidence: c.evidence },
  "GET /cases/DLND010004212026/parties/p1/chat-history": { messages: [] },
});

test.describe("case details", () => {
  test("reads the petition into the six-part case file", async ({ page, signIn, checkA11y }, info) => {
    await signIn(USERS.email, { [`GET /cases/${CNR}`]: caseOf() });
    await page.goto(`/cases/${CNR}`);

    const file = page.getByRole("article", { name: "Case file" });
    for (const s of ["Case summary", "Parties", "Facts of the case", "Charges", "Evidence", "Issues for the court"]) {
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
      await page.getByRole("navigation", { name: "Case file contents" }).getByRole("button", { name: /Issues for the court/ }).click();
      await expect(page.getByRole("navigation", { name: "Case file contents" }).getByRole("button", { name: /Issues for the court/ })).toHaveAttribute("aria-current", "true");
    } else {
      await page.getByLabel("Jump to section").selectOption("charges");
      await expect(file.getByText("§ 336 BNS · Forgery")).toBeInViewport();
    }
    await checkA11y();
  });

  test("taking a side asks first, then records it and opens Case Prep", async ({ page, signIn }) => {
    let body: unknown = null;
    const picked = caseOf({ user_role: "plaintiff", ai_role: "defendant" });
    await signIn(USERS.email, {
      [`GET /cases/${CNR}`]: (route: Route) => route.fulfill({ json: body ? picked : caseOf() }),
      [`PUT /cases/${CNR}/roles`]: async (route: Route) => {
        body = route.request().postDataJSON();
        await route.fulfill({ json: { image_generation: { generated: 1 } } });
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

    await page.getByRole("button", { name: /^Plaintiff Lawyer/ }).click();
    await page.getByRole("button", { name: "Take the plaintiff’s side" }).click();
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
});
