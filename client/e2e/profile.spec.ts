import type { Route } from "@playwright/test";
import { test, expect, USERS } from "./support/fixtures";

const counts = (wins: number, losses: number, partials: number, win_rate: number) => ({
  wins,
  losses,
  partials,
  total: wins + losses + partials,
  win_rate,
});

const now = new Date();
const month = (back: number) => {
  const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const STATS = {
  partial_scoring: "half",
  overall: counts(6, 3, 2, 64),
  as_plaintiff: counts(4, 1, 1, 75),
  as_defendant: counts(2, 2, 1, 50),
  current_streak: 3,
  best_streak: 3,
  recent_form: [
    { cnr: "DLND010004082026", title: "State v. Kiran Bedi Rao", role: "defendant", outcome: "won", decided_at: "2026-09-27T10:00:00Z" },
    { cnr: "DLND010003702026", title: "State v. Neha Joshi", role: "defendant", outcome: "lost", decided_at: "2026-09-12T10:00:00Z" },
  ],
  monthly: [
    { month: month(1), wins: 1, losses: 1, partials: 1 },
    { month: month(0), wins: 1, losses: 0, partials: 0 },
  ],
  activity: { arguments: 58, witnesses_examined: 14, conferences_held: 21, evidence: 37, avg_arguments: 5.3, avg_witnesses_examined: 1.3, avg_conferences_held: 1.9, avg_evidence: 3.4 },
  pending_outcomes: 1,
};

const NEW_STATS = {
  ...STATS,
  overall: counts(0, 0, 0, 0),
  as_plaintiff: counts(0, 0, 0, 0),
  as_defendant: counts(0, 0, 0, 0),
  current_streak: 0,
  best_streak: 0,
  recent_form: [],
  monthly: [],
  pending_outcomes: 0,
};

const CASES = [
  { id: "c1", cnr: "DLND010004212026", title: "State v. Raghav Menon", status: "active", user_role: "defendant", created_at: "2026-10-02T10:00:00Z", outcome: null },
  { id: "c2", cnr: "DLND010004082026", title: "State v. Kiran Bedi Rao", status: "resolved", user_role: "defendant", created_at: "2026-09-27T10:00:00Z", outcome: "won" },
  { id: "c3", cnr: "DLND010003962026", title: "State v. Sunita Verma", status: "adjourned", user_role: "plaintiff", created_at: "2026-09-24T10:00:00Z", outcome: null },
];

const ME = { ...USERS.email, member_since: "2026-09-04T10:00:00Z", has_password: true };

function routes(over: Record<string, unknown> = {}) {
  return {
    "GET /auth/profile/stats": STATS,
    "GET /cases": CASES,
    "GET /location/indian-states": [{ state_iso2: "MH", state_name: "Maharashtra" }],
    ...over,
  };
}

test.describe("profile", () => {
  test("the identity card, the record and recent cases", async ({ page, signIn, checkA11y }) => {
    await signIn(ME, routes());
    await page.goto("/profile");

    await expect(page.getByRole("heading", { name: "Good to see you, Aanya." })).toBeVisible();
    const card = page.getByRole("region", { name: "Your details" });
    await expect(card.getByText("Since Sep 2026")).toBeVisible();
    await expect(card.getByText("Mumbai, Maharashtra, India")).toBeVisible();
    await expect(card.getByText("0 of 4 added")).toBeVisible();
    await expect(card.getByRole("link", { name: /Pick up where you left off.*State v\. Raghav Menon/ })).toHaveAttribute("href", "/cases/DLND010004212026");
    await expect(card.getByText("DLND010004212026 · Defence · In session")).toBeVisible();

    const record = page.getByRole("region", { name: "Your record" });
    await expect(record.getByText("Partial wins count as half a win")).toBeVisible();
    await expect(record.getByText("1 resolved case is waiting for an outcome.", { exact: false })).toBeVisible();
    await expect(record.getByText("6W · 3L · 2P")).toBeVisible();
    await expect(record.getByText("11 decided")).toBeVisible();
    await expect(record.getByText("21 client conferences")).toBeVisible();
    await expect(record.getByRole("link", { name: "State v. Kiran Bedi Rao: Won as defence" })).toBeVisible();

    const recent = page.getByRole("region", { name: "Recent cases" });
    await expect(recent.getByRole("link")).toHaveCount(4); // three cases and "All cases →"
    await expect(recent.getByRole("link", { name: /State v\. Kiran Bedi Rao/ })).toContainText("Won");
    await checkA11y();

    await card.getByRole("button", { name: "+ Nickname" }).click();
    await expect(page.getByRole("dialog", { name: "Edit profile" })).toBeVisible();
  });

  test("a new user sees an empty record", async ({ page, signIn }) => {
    await signIn(ME, routes({ "GET /auth/profile/stats": NEW_STATS, "GET /cases": [] }));
    await page.goto("/profile");

    await expect(page.getByText("No decided cases yet.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Generate your first case →" })).toHaveAttribute("href", "/cases/new");
    await expect(page.getByText("Pick up where you left off")).toHaveCount(0);
    await expect(page.getByText("No cases yet. Your newest five will be listed here.")).toBeVisible();
  });

  test("edit profile checks the fields, then saves what changed", async ({ page, signIn }) => {
    let saved: Record<string, unknown> | null = null;
    let profile: Record<string, unknown> = ME;
    await signIn(
      ME,
      routes({
        "GET /auth/profile": (route: Route) => route.fulfill({ json: profile }),
        "PUT /auth/profile": async (route: Route) => {
          saved = route.request().postDataJSON();
          profile = { ...profile, nickname: "Ash", gender: "female" };
          await route.fulfill({ json: profile });
        },
      }),
    );
    await page.goto("/profile");
    await page.getByRole("button", { name: "Edit profile" }).click();
    const panel = page.getByRole("dialog", { name: "Edit profile" });
    await expect(panel.getByLabel("First name")).toBeFocused();
    await expect(panel.getByLabel("Email")).toBeDisabled();
    await expect(panel.getByText("You signed up with this email, so it can’t be changed here.")).toBeVisible();

    await panel.getByLabel("First name").fill(" ");
    await panel.getByLabel("Date of birth · optional").fill(`${now.getFullYear() - 10}-01-01`);
    await panel.getByLabel("Phone · optional").fill("98765");
    await panel.getByRole("button", { name: "Save changes" }).click();
    await expect(panel.getByText("First and last name are required.")).toBeVisible();
    await expect(panel.getByText("You must be 18 or over to use AI Courtroom.")).toBeVisible();
    await expect(panel.getByText("Indian mobile numbers have 10 digits.")).toBeVisible();
    expect(saved).toBeNull();

    await panel.getByLabel("First name").fill("Aanya");
    await panel.getByLabel("Nickname · optional").fill("Ash");
    await panel.getByRole("radio", { name: "Female" }).click();
    await panel.getByLabel("Date of birth · optional").fill("1995-05-04");
    await panel.getByLabel("Phone · optional").fill("98765 43210");
    await panel.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Profile updated successfully!")).toBeVisible();
    await expect(panel).toBeHidden();
    expect(saved).toEqual({
      first_name: "Aanya",
      last_name: "Kapoor",
      nickname: "Ash",
      gender: "female",
      date_of_birth: "1995-05-04",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      phone_code: "91",
      phone_number: "9876543210",
    });
    await expect(page.getByText("Goes by Ash")).toBeVisible();
  });

  test("a phone account adds an email it proves, but can't change its number", async ({ page, signIn }) => {
    let saved: Record<string, unknown> = {};
    let codeFor = "";
    let verified = "";
    const phoneUser = { ...ME, email: null, auth_method: "phone", phone_code: "91", phone_number: "9876543210" };
    await signIn(
      phoneUser,
      routes({
        "PUT /auth/profile": async (route: Route) => {
          saved = route.request().postDataJSON();
          await route.fulfill({ json: phoneUser });
        },
        "POST /auth/profile/email/send-code": async (route: Route) => {
          codeFor = route.request().postDataJSON().email;
          await route.fulfill({ json: { sent_to: codeFor } });
        },
        "POST /auth/profile/email/verify": async (route: Route) => {
          verified = route.request().postDataJSON().code;
          await route.fulfill({ json: { ...phoneUser, email: codeFor } });
        },
      }),
    );
    await page.goto("/profile");
    await expect(page.getByRole("region", { name: "Your details" }).getByText("Not added")).toBeVisible();
    await expect(page.getByText("+91 98765 43210")).toBeVisible();
    await page.getByRole("button", { name: "Edit profile" }).click();
    const panel = page.getByRole("dialog", { name: "Edit profile" });
    await expect(panel.getByLabel("Phone · optional")).toBeDisabled();
    await expect(panel.getByText("You signed up with this number, so it can’t be changed here.")).toBeVisible();

    await panel.getByLabel("Email", { exact: true }).fill("not-an-email");
    await panel.getByRole("button", { name: "Save changes" }).click();
    await expect(panel.getByText("Enter a valid email address.")).toBeVisible();
    await panel.getByLabel("Email", { exact: true }).fill("Aanya@Example.com");
    await panel.getByRole("button", { name: "Save changes" }).click();
    // The rest is saved; the new email waits for its code.
    await expect(panel.getByText("We sent a code to aanya@example.com.", { exact: false })).toBeVisible();
    expect(saved).not.toHaveProperty("email");
    expect(saved).not.toHaveProperty("phone_number");
    expect(codeFor).toBe("aanya@example.com");
    await panel.getByLabel("Email code").fill("123456");
    await panel.getByRole("button", { name: "Confirm email" }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByText("Email added: aanya@example.com.")).toBeVisible();
    expect(verified).toBe("123456");
  });

  test("a new photo is cropped, then uploaded with the profile", async ({ page, signIn }) => {
    let uploads = 0;
    await signIn(
      ME,
      routes({
        "POST /auth/profile/photo": async (route: Route) => {
          uploads++;
          await route.fulfill({ json: ME });
        },
        "PUT /auth/profile": ME,
      }),
    );
    await page.goto("/profile");
    await page.getByRole("button", { name: "Edit profile" }).click();
    const panel = page.getByRole("dialog", { name: "Edit profile" });
    // a 4 × 4 PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8DAwMDAxMDAAAAeAAMxQ8dUAAAAAElFTkSuQmCC",
      "base64",
    );
    await panel.locator('input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
    const crop = page.getByRole("dialog", { name: "Crop your photo" });
    await expect(crop.getByText("Drag to position your face inside the circle.")).toBeVisible();
    await crop.getByRole("button", { name: "Use photo" }).click();
    await expect(crop).toBeHidden();
    await expect(panel.getByRole("img", { name: "New profile photo" })).toBeVisible();
    await panel.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile updated successfully!")).toBeVisible();
    expect(uploads).toBe(1);
  });
});
