import type { Route } from "@playwright/test";
import { test, expect, USERS } from "./support/fixtures";

const CASES = [
  { cnr: "DLND010004212026", title: "State v. Raghav Menon", user_role: "defendant", status: "active", created_at: "2026-09-28T10:00:00Z" },
  { cnr: "KABL010093042026", title: "Ananya Rao v. Nandi Hills Housing Society", user_role: "plaintiff", status: "not started", created_at: "2026-09-30T10:00:00Z" },
  { cnr: "TNCH030051192026", title: "Selvam v. Lakshmi Finance", user_role: "defendant", status: "resolved", outcome: "won", created_at: "2026-09-12T10:00:00Z" },
];
const ARCHIVED = [
  { cnr: "MHMM020118732026", title: "Kapoor Textiles v. Shree Ganesh Logistics", user_role: "plaintiff", status: "adjourned", created_at: "2026-09-21T10:00:00Z", deleted_at: "2026-10-01T10:00:00Z" },
];

/** Records which mocked routes were called, in order. */
function counter() {
  const calls: string[] = [];
  const hit = (reply: unknown) => async (route: Route) => {
    calls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.fulfill({ json: reply });
  };
  return { calls, hit };
}

test.describe("my cases", () => {
  test("lists, filters, searches and opens a case", async ({ page, signIn, checkA11y }, info) => {
    await signIn(USERS.email, { "GET /cases": CASES, "GET /cases/deleted/list": ARCHIVED });
    await page.goto("/cases");
    await expect(page.getByRole("heading", { name: "MY CASES" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Archived (1)" })).toBeVisible();
    const list = page.getByRole("region", { name: "Cases" });
    await expect(list.getByRole("link")).toHaveCount(3);
    await expect(list.getByText("Won")).toBeVisible();
    await checkA11y();

    if (!info.project.name.startsWith("mobile")) {
      await page.getByRole("button", { name: /^Active/ }).click();
      await expect(list.getByRole("link")).toHaveCount(1);
      await expect(page.getByText("Showing 1 of 3 cases")).toBeVisible();
      await page.getByRole("button", { name: "Clear filters" }).click();
    }
    await page.getByLabel("Search cases").fill("KABL");
    await expect(list.getByRole("link")).toHaveCount(1);
    await page.getByLabel("Search cases").fill("nothing like this");
    await expect(page.getByText("No cases match.")).toBeVisible();
    await page.getByLabel("Clear search").click();

    await list.getByRole("link", { name: /State v\. Raghav Menon/ }).click();
    await expect(page).toHaveURL(/\/cases\/DLND010004212026$/);
  });

  test("the page stays put; only the list scrolls, with the paper scrollbar", async ({ page, signIn }) => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ...CASES[i % 3], cnr: `DLND0100${String(i).padStart(4, "0")}2026`, title: `Case ${i + 1}` }));
    await signIn(USERS.email, { "GET /cases": many, "GET /cases/deleted/list": [] });
    await page.goto("/cases");
    const list = page.getByRole("region", { name: "Cases" });
    await expect(list.getByRole("link")).toHaveCount(40);

    const scroller = list.locator("[data-scroller]");
    const doc = await page.evaluate(() => ({ sh: document.scrollingElement!.scrollHeight, h: window.innerHeight }));
    expect(doc.sh).toBeLessThanOrEqual(doc.h);
    expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

    await scroller.evaluate((el) => el.scrollBy(0, 400));
    expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // Touch screens hide the native bar and draw the paper bar over the list instead.
    if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) {
      await expect(page.locator("html")).toHaveClass(/ac-touch/);
      const box = (await scroller.boundingBox())!;
      await expect
        .poll(() =>
          page.evaluate((right) => {
            const tracks = [...document.querySelectorAll<HTMLElement>("body > div[aria-hidden=true] > div")];
            return tracks.some((t) => t.style.display === "block" && Math.round(parseFloat(t.style.left) + 12) === Math.round(right));
          }, box.x + box.width),
        )
        .toBe(true);
    }
  });

  test("empty cause list invites the first case", async ({ page, signIn }) => {
    await signIn(USERS.email, { "GET /cases": [], "GET /cases/deleted/list": [] });
    await page.goto("/cases");
    await expect(page.getByText("Your cause list is empty.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Create your first case →" })).toHaveAttribute("href", "/cases/new");
  });

  test("a failed load can be retried", async ({ page, signIn }) => {
    let fail = true;
    await signIn(USERS.email, {
      "GET /cases": (route: Route) => (fail ? route.fulfill({ status: 500, json: {} }) : route.fulfill({ json: CASES })),
      "GET /cases/deleted/list": [],
    });
    await page.goto("/cases");
    await expect(page.getByText("Couldn’t load your cases.")).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("region", { name: "Cases" }).getByRole("link")).toHaveCount(3);
  });

  test("archive asks first, then offers undo", async ({ page, signIn }) => {
    const { calls, hit } = counter();
    await signIn(USERS.email, {
      "GET /cases": CASES,
      "GET /cases/deleted/list": [],
      "DELETE /cases/DLND010004212026": hit({}),
      "POST /cases/DLND010004212026/restore": hit({}),
    });
    await page.goto("/cases");
    await page.getByRole("button", { name: "Archive State v. Raghav Menon" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Archive this case?" });
    await expect(dialog).toContainText("“State v. Raghav Menon” will move to Archived Cases.");
    await dialog.getByRole("button", { name: "Archive" }).click();

    await expect(page.getByText("Case archived: State v. Raghav Menon")).toBeVisible();
    expect(calls).toEqual(["DELETE /cases/DLND010004212026"]);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Case restored")).toBeVisible();
    expect(calls).toContain("POST /cases/DLND010004212026/restore");
    await expect(page.getByRole("link", { name: /State v\. Raghav Menon/ })).toBeVisible();
  });

  test("delete waits out the undo window", async ({ page, signIn }) => {
    const { calls, hit } = counter();
    await page.clock.install();
    await signIn(USERS.email, {
      "GET /cases": CASES,
      "GET /cases/deleted/list": [],
      "DELETE /cases/KABL010093042026/permanent": hit({}),
      "DELETE /cases/DLND010004212026/permanent": hit({}),
    });
    await page.goto("/cases");

    // Undo in time: nothing is deleted.
    await page.getByRole("button", { name: "Delete Ananya Rao v. Nandi Hills Housing Society" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByText("Case will be permanently deleted")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await page.clock.runFor(6000);
    expect(calls).toEqual([]);

    // Let it run: deleted after 5 seconds.
    await page.getByRole("button", { name: "Delete State v. Raghav Menon" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete permanently" }).click();
    await page.clock.runFor(5500);
    await expect.poll(() => calls).toEqual(["DELETE /cases/DLND010004212026/permanent"]);
  });

  test("select mode archives several cases at once", async ({ page, signIn }) => {
    const { calls, hit } = counter();
    await signIn(USERS.email, {
      "GET /cases": CASES,
      "GET /cases/deleted/list": [],
      "DELETE /cases/DLND010004212026": hit({}),
      "DELETE /cases/KABL010093042026": hit({}),
    });
    await page.goto("/cases");
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.getByRole("checkbox", { name: "Select State v. Raghav Menon" }).click();
    await page.getByRole("checkbox", { name: /Select Ananya Rao/ }).click();
    const bar = page.getByRole("toolbar", { name: "Selected cases" });
    await expect(bar).toContainText("2 selected");
    await bar.getByRole("button", { name: "Archive" }).click();
    await page.getByRole("alertdialog", { name: "Archive 2 cases?" }).getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("2 cases archived")).toBeVisible();
    expect(calls.sort()).toEqual(["DELETE /cases/DLND010004212026", "DELETE /cases/KABL010093042026"]);
  });

  test("archiving is paused offline", async ({ page, context, signIn }) => {
    await signIn(USERS.email, { "GET /cases": CASES, "GET /cases/deleted/list": [] });
    await page.goto("/cases");
    await expect(page.getByRole("region", { name: "Cases" }).getByRole("link")).toHaveCount(3);
    await context.setOffline(true);
    await expect(page.getByText("Archiving and deleting are paused.")).toBeVisible();
    await page.getByRole("button", { name: "Archive State v. Raghav Menon" }).click();
    await expect(page.getByText("You’re offline. Try again when you’re back online.")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("old dashboard links still work", async ({ page, signIn }) => {
    await signIn(USERS.email, { "GET /cases": CASES, "GET /cases/deleted/list": [] });
    await page.goto("/dashboard/cases");
    await expect(page).toHaveURL(/\/cases$/);
    await page.goto("/dashboard/generate-case");
    await expect(page).toHaveURL(/\/cases\/new$/);
  });
});

test.describe("archive", () => {
  test("restore with undo, then empty the archive", async ({ page, signIn }) => {
    const { calls, hit } = counter();
    await signIn(USERS.email, {
      "GET /cases/deleted/list": ARCHIVED,
      "POST /cases/MHMM020118732026/restore": hit({}),
      "DELETE /cases/MHMM020118732026": hit({}),
      "DELETE /cases/deleted/all": hit({ deleted: 1 }),
    });
    await page.goto("/cases/archived");
    await expect(page.getByRole("heading", { name: "ARCHIVED" })).toBeVisible();
    await expect(page.getByText("Archive · 1 case")).toBeVisible();

    await page.getByRole("button", { name: "Restore Kapoor Textiles v. Shree Ganesh Logistics" }).click();
    await expect(page.getByText("Restored to My Cases: Kapoor Textiles v. Shree Ganesh Logistics")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Case archived again")).toBeVisible();

    await page.getByRole("button", { name: "Empty archive" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Empty the archive?" });
    await expect(dialog).toContainText("This can’t be undone.");
    await dialog.getByRole("button", { name: "Delete all" }).click();
    await expect(page.getByText("The archive is empty.")).toBeVisible();
    expect(calls).toEqual([
      "POST /cases/MHMM020118732026/restore",
      "DELETE /cases/MHMM020118732026",
      "DELETE /cases/deleted/all",
    ]);
  });
});

test.describe("new case", () => {
  const QUOTA = { remaining_attempts: 3, max_attempts: 5, seconds_until_next: null };

  test("pick sections, draft, file and open", async ({ page, signIn, checkA11y }) => {
    let body: unknown;
    await signIn(USERS.email, {
      "GET /limit/case-generation": QUOTA,
      "POST /cases/generate": async (route: Route) => {
        body = route.request().postDataJSON();
        await route.fulfill({ json: { cnr: "DLND010012342026" } });
      },
    });
    await page.goto("/cases/new");
    await expect(page.getByRole("heading", { name: "NEW CASE" })).toBeVisible();
    await expect(page.getByText("3 of 5 case generations left")).toBeVisible();
    await checkA11y();

    await page.getByRole("button", { name: "Generate case →" }).click();
    await expect(page.getByText("Add at least one section.")).toBeVisible();

    const input = page.getByLabel("Sections of the Bharatiya Nyaya Sanhita");
    await input.fill("999");
    await input.press("Enter");
    await expect(page.getByText("BNS sections run from 1 to 358. § 999 doesn’t exist.")).toBeVisible();
    await input.fill("103, 318");
    await input.press("Enter");
    await page.getByRole("button", { name: /§ 316/ }).click();
    await expect(page.getByText("3 sections")).toBeVisible();

    await page.getByRole("button", { name: "Generate case →" }).click();
    await expect(page.getByText("FILED")).toBeVisible();
    await expect(page.getByText("DLND010012342026")).toBeVisible();
    expect(body).toEqual({ sections_involved: 3, section_numbers: [103, 318, 316] });
    await page.getByRole("button", { name: "Open the case file →" }).click();
    await expect(page).toHaveURL(/\/cases\/DLND010012342026$/);
  });

  test("limit reached counts down and blocks filing", async ({ page, signIn }) => {
    await signIn(USERS.email, {
      "GET /limit/case-generation": { remaining_attempts: 0, max_attempts: 5, seconds_until_next: 3725 },
    });
    await page.goto("/cases/new");
    await expect(page.getByText(/Limit reached\. Next case in 01:02:0\d\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Limit reached" })).toBeDisabled();
  });

  test("a server error keeps the sections", async ({ page, signIn }) => {
    await signIn(USERS.email, {
      "GET /limit/case-generation": QUOTA,
      "POST /cases/generate": (route: Route) =>
        route.fulfill({ status: 500, json: { detail: "Failed to generate case. Please try again." } }),
    });
    await page.goto("/cases/new");
    await page.getByRole("button", { name: /§ 103/ }).click();
    await page.getByRole("button", { name: "Generate case →" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Failed to generate case. Please try again.");
    await expect(page.getByText("1 section", { exact: true })).toBeVisible();
  });

  test("without a seat of practice, asks for it first", async ({ page, signIn }) => {
    await signIn(USERS.fresh, {
      "GET /limit/case-generation": QUOTA,
      "GET /location/countries": [{ name: "India", iso2: "IN" }],
    });
    await page.goto("/cases/new");
    await expect(page.getByRole("heading", { name: "Where do you practise?" })).toBeVisible();
  });
});
