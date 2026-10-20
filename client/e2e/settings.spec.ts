import type { Page, Route } from "@playwright/test";
import { test, expect, USERS } from "./support/fixtures";

const ME = {
  ...USERS.email,
  has_password: true,
  google_linked: false,
  password_changed_at: "2026-09-12T10:00:00Z",
  case_location_preference: "random",
  rag_enabled: true,
  partial_scoring: "zero",
  notification_prefs: { case_ready: true, hearing_reminders: true, product_updates: false },
};

const SESSIONS = [
  {
    id: "s1",
    user_agent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36",
    ip: "1.2.3.4",
    created_at: "2026-10-01T10:00:00Z",
    last_active: new Date().toISOString(),
    current: true,
  },
  {
    id: "s2",
    user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1",
    ip: "5.6.7.8",
    created_at: "2026-09-30T10:00:00Z",
    last_active: new Date(Date.now() - 2 * 86400000).toISOString(),
    current: false,
  },
];

function routes(over: Record<string, unknown> = {}) {
  return {
    "GET /auth/sessions": { sessions: SESSIONS },
    "GET /location/indian-states": [
      { state_iso2: "DL", state_name: "Delhi", high_court: "High Court of Delhi" },
      { state_iso2: "MH", state_name: "Maharashtra", high_court: "Bombay High Court" },
    ],
    "GET /cases": [
      { id: "c1", cnr: "DLND010004212026", title: "State v. Raghav Menon", status: "active", created_at: "2026-10-02T10:00:00Z" },
    ],
    "GET /cases/deleted/list": [],
    ...over,
  };
}

/** The settings scroller jumps to a section from the index (desktop) or the tab strip (phones). */
async function goTo(page: Page, mobile: boolean, name: string, tab: string) {
  if (mobile) await page.getByRole("tab", { name: tab, exact: true }).click();
  else await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name }).click();
}

test.describe("settings", () => {
  test("one save bar: unsaved changes, discard, then save to the account", async ({ page, signIn, checkA11y }) => {
    const puts: Record<string, unknown> = {};
    const put = (key: string) => async (route: Route) => {
      puts[key] = route.request().postDataJSON();
      await route.fulfill({ json: ME });
    };
    await signIn(
      ME,
      routes({
        "PUT /auth/profile/rag-preference": put("rag"),
        "PUT /auth/profile/stats-preference": put("stats"),
        "PUT /auth/profile/notification-preference": put("notify"),
      }),
    );
    await page.goto("/settings");
    const form = page.getByRole("region", { name: "Settings" });
    await expect(form.getByText("All changes saved")).toBeVisible();
    await checkA11y();

    await form.getByRole("switch", { name: /Auto-expand text areas/ }).click();
    await expect(form.getByText("1 unsaved change")).toBeVisible();
    await expect(form.locator("#s-writing").getByText("Unsaved")).toBeVisible();
    await form.getByRole("button", { name: "Discard" }).click();
    await expect(form.getByText("All changes saved")).toBeVisible();
    await expect(form.getByRole("switch", { name: /Auto-expand text areas/ })).toHaveAttribute("aria-checked", "true");

    await form.getByRole("switch", { name: /Use RAG for courtroom AI/ }).click();
    await form.getByLabel("Partial wins count as").selectOption("half");
    await form.getByRole("switch", { name: /Case ready/ }).click();
    await expect(form.getByRole("switch", { name: /Hearing reminders/ })).toHaveAttribute("aria-checked", "true");
    await form.getByRole("switch", { name: /Product updates/ }).click();
    await expect(form.getByText("4 unsaved changes")).toBeVisible();
    await form.getByRole("button", { name: "Save settings" }).click();
    await expect(form.getByText("Settings saved successfully!")).toBeVisible();
    expect(puts).toEqual({
      rag: { rag_enabled: false },
      stats: { partial_scoring: "half" },
      notify: { case_ready: false, hearing_reminders: true, product_updates: true },
    });
  });

  test("a specific state must be chosen before saving", async ({ page, signIn }, info) => {
    let body: unknown = null;
    await signIn(
      ME,
      routes({
        "PUT /auth/profile/case-location-preference": async (route: Route) => {
          body = route.request().postDataJSON();
          await route.fulfill({ json: ME });
        },
      }),
    );
    await page.goto("/settings");
    await goTo(page, info.project.name !== "desktop", "Case management", "Cases");
    const form = page.getByRole("region", { name: "Settings" });
    await form.getByRole("radio", { name: /Specific state/ }).click();
    await form.getByRole("button", { name: "Save settings" }).click();
    await expect(form.getByText("Choose a state, or pick another option.")).toBeVisible();
    expect(body).toBeNull();

    await form.getByLabel("State", { exact: true }).selectOption("MH");
    await form.getByRole("button", { name: "Save settings" }).click();
    await expect(form.getByText("Settings saved successfully!")).toBeVisible();
    expect(body).toEqual({ case_location_preference: "specific_state", preferred_case_state: "MH" });
  });

  test("change the password and sign out the other devices", async ({ page, signIn }, info) => {
    let pw: unknown = null;
    let revoked = false;
    await signIn(
      ME,
      routes({
        "PUT /auth/password": async (route: Route) => {
          pw = route.request().postDataJSON();
          await route.fulfill({ json: { signed_out: 1 } });
        },
        "POST /auth/sessions/revoke-others": async (route: Route) => {
          revoked = true;
          await route.fulfill({ json: { signed_out: 1 } });
        },
      }),
    );
    await page.goto("/settings");
    await goTo(page, info.project.name !== "desktop", "Account & security", "Account");
    const account = page.locator("#s-account");
    await expect(account.getByText("Last changed 12 Sep 2026.")).toBeVisible();
    await expect(account.getByText("This device")).toBeVisible();
    await expect(account.getByText("Safari on iPhone")).toBeVisible();
    await expect(account.getByText("2 days ago")).toBeVisible();

    await account.getByRole("button", { name: "Sign out other devices" }).click();
    await expect(account.getByText("Signed out of 1 other device.")).toBeVisible();
    expect(revoked).toBe(true);

    await account.getByRole("button", { name: "Change password" }).click();
    const form = account.getByRole("form", { name: "Change password" });
    await expect(form.getByLabel("Current password")).toBeFocused();
    await form.getByLabel("New password", { exact: true }).fill("short");
    await form.getByRole("button", { name: "Update password" }).click();
    await expect(form.getByText("Enter your current password.")).toBeVisible();
    await expect(form.getByText("Password must be at least 8 characters")).toBeVisible();

    await form.getByLabel("Current password").fill("Password123!");
    await form.getByLabel("New password", { exact: true }).fill("NewPass123!");
    await form.getByLabel("Confirm new password").fill("NewPass123!");
    await form.getByRole("button", { name: "Update password" }).click();
    await expect(account.getByText("Password updated. Your other devices have been signed out.")).toBeVisible();
    expect(pw).toEqual({ current_password: "Password123!", new_password: "NewPass123!" });
  });

  test("delete with the password: two checks, then signed out", async ({ page, signIn }, info) => {
    let body: unknown = null;
    await signIn(
      ME,
      routes({
        "DELETE /auth/account": async (route: Route) => {
          body = route.request().postDataJSON();
          await route.fulfill({ json: { deleted: true, recoverable_until: "2026-11-12T10:00:00Z" } });
        },
      }),
    );
    await page.goto("/settings");
    await goTo(page, info.project.name !== "desktop", "Account & security", "Account");
    await page.getByRole("button", { name: "Delete account…" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete your account?" });
    await expect(dialog.getByText("Your profile, 1 case, their proceedings")).toBeVisible();
    await expect(dialog.getByLabel("Your password")).toBeFocused();
    const go = dialog.getByRole("button", { name: "Delete my account" });
    await expect(go).toBeDisabled();
    await dialog.getByLabel("Your password").fill("Password123!");
    await dialog.getByLabel('Type "DELETE" to confirm').fill("delete");
    await expect(go).toBeEnabled();
    await go.click();
    await expect(page).toHaveURL(/\/login\?deleted=1/);
    expect(body).toEqual({ password: "Password123!", confirm: "DELETE" });
  });

  test("a Google-only account deletes with an emailed code", async ({ page, signIn }, info) => {
    let body: unknown = null;
    const google = { ...ME, auth_method: "google", has_password: false, google_linked: true, google_email: ME.email };
    await signIn(
      google,
      routes({
        "POST /auth/account/delete-code": { sent_to: ME.email },
        "DELETE /auth/account": async (route: Route) => {
          body = route.request().postDataJSON();
          await route.fulfill({ json: { deleted: true } });
        },
      }),
    );
    await page.goto("/settings");
    await goTo(page, info.project.name !== "desktop", "Account & security", "Account");
    const account = page.locator("#s-account");
    await expect(account.getByText("You sign in with Google, so there’s no password.")).toBeVisible();
    await expect(account.getByText("You signed up with Google, so it stays connected.", { exact: false })).toBeVisible();
    await expect(account.getByRole("button", { name: "Disconnect" })).toHaveCount(0);

    await account.getByRole("button", { name: "Delete account…" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByLabel("Code from your email")).toBeDisabled();
    await dialog.getByRole("button", { name: "Email me a code" }).click();
    await expect(dialog.getByRole("button", { name: /Resend in \d+s/ })).toBeDisabled();
    await dialog.getByLabel("Code from your email").fill("12a3456");
    await expect(dialog.getByLabel("Code from your email")).toHaveValue("123456");
    await dialog.getByLabel('Type "DELETE" to confirm').fill("DELETE");
    await dialog.getByRole("button", { name: "Delete my account" }).click();
    await expect(page).toHaveURL(/\/login\?deleted=1/);
    expect(body).toEqual({ code: "123456", confirm: "DELETE" });
  });

  test("disconnect Google and request a copy of the data", async ({ page, signIn }, info) => {
    let exported = false;
    let user: Record<string, unknown> = { ...ME, google_linked: true, google_email: "aanya.g@gmail.com" };
    await signIn(
      user as typeof ME,
      routes({
        "GET /auth/profile": (route: Route) => route.fulfill({ json: user }),
        "DELETE /auth/google/link": async (route: Route) => {
          user = { ...user, google_linked: false, google_email: null };
          await route.fulfill({ json: user });
        },
        "POST /auth/export": async (route: Route) => {
          exported = true;
          user = { ...user, data_export_requested_at: new Date().toISOString() };
          await route.fulfill({ json: { requested_at: user.data_export_requested_at, email: ME.email } });
        },
      }),
    );
    await page.goto("/settings");
    await goTo(page, info.project.name !== "desktop", "Account & security", "Account");
    const account = page.locator("#s-account");
    await expect(
      account.getByText("Connected as aanya.g@gmail.com. You can sign in with Google or your email and password."),
    ).toBeVisible();
    await account.getByRole("button", { name: "Disconnect" }).click();
    await expect(account.getByText("Google disconnected. Sign in with your email and password from now on.")).toBeVisible();
    await expect(account.getByRole("button", { name: "Connect Google" })).toBeVisible();

    await account.getByRole("button", { name: "Request my data" }).click();
    await expect(account.getByRole("button", { name: "Requested" })).toBeDisabled();
    expect(exported).toBe(true);
  });

  test("developer mode applies at once and shows the models panel", async ({ page, signIn }, info) => {
    await signIn({ ...ME, is_developer: true } as typeof ME, routes());
    await page.goto("/settings");
    await goTo(page, info.project.name !== "desktop", "Courtroom AI", "AI");
    const form = page.getByRole("region", { name: "Settings" });
    await form.getByRole("switch", { name: /Show which AI model answered/ }).click();
    await expect(form.getByText("All changes saved")).toBeVisible();
    await page.getByRole("button", { name: /No AI calls yet/ }).click();
    await expect(
      page.getByRole("region", { name: "AI models" }).getByText("No AI calls yet. Responses that used a model appear here."),
    ).toBeVisible();
  });

  test("signed out: only this device's settings, and a way to log in", async ({ page }) => {
    await page.goto("/settings");
    const form = page.getByRole("region", { name: "Settings" });
    await expect(form.getByRole("heading", { name: "Accessibility" })).toBeVisible();
    await expect(form.getByRole("heading", { name: "Privacy" })).toBeVisible();
    await expect(form.getByRole("heading", { name: "Courtroom AI" })).toHaveCount(0);
    await expect(form.getByRole("heading", { name: "Account & security" })).toHaveCount(0);
    await expect(form.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=/settings");

    await form.getByRole("radio", { name: /Large/ }).click();
    await expect(form.getByText("1 unsaved change")).toBeVisible();
    await form.getByRole("button", { name: "Save settings" }).click();
    await expect(form.getByText("Settings saved successfully!")).toBeVisible();
  });
});
