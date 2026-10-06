import { test, expect } from "./support/fixtures";

test.describe("cookie consent", () => {
  test.use({ consented: false });

  test("Accept All hides the banner for good", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("region", { name: "Cookie consent" });
    await expect(banner).toContainText("We value your privacy");
    await banner.getByRole("button", { name: "Accept All" }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { name: "AI Courtroom", level: 1 })).toBeVisible();
    await expect(banner).toBeHidden();
  });

  test("Customize saves chosen categories", async ({ page, checkA11y }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Customize" }).click();
    const dialog = page.getByRole("dialog", { name: "Cookie Preferences" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("switch", { name: "Toggle Essential Cookies" })).toBeDisabled();
    const analytics = dialog.getByRole("switch", { name: "Toggle Analytics Cookies" });
    await expect(analytics).toHaveAttribute("aria-checked", "false");
    await analytics.click();
    await expect(analytics).toHaveAttribute("aria-checked", "true");
    await checkA11y();
    await dialog.getByRole("button", { name: "Save Preferences" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("region", { name: "Cookie consent" })).toBeHidden();

    const consent = (await page.context().cookies()).find((c) => c.name === "ai_courtroom_consent");
    expect(JSON.parse(decodeURIComponent(consent!.value))).toMatchObject({
      analytics: true,
      functional: false,
      marketing: false,
    });
  });

  test("Escape closes the preferences without saving", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Customize" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("region", { name: "Cookie consent" })).toBeVisible();
  });
});

test.describe("install prompt", () => {
  // A browser that offers installation fires beforeinstallprompt; fake one that is accepted.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener("load", () => {
        const e = new Event("beforeinstallprompt") as Event & Record<string, unknown>;
        e.prompt = async () => {};
        e.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
        window.dispatchEvent(e);
      });
    });
  });

  test("opens by itself on the landing page and installs", async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "Install AI Courtroom" });
    await expect(dialog).toBeVisible({ timeout: 6000 });
    await expect(dialog).toContainText("Form I-1 · Installation");
    await dialog.getByRole("button", { name: "Install", exact: true }).click();
    // The dialog's title changes to the confirmation line once installed.
    const done = page.getByRole("dialog");
    await expect(done.getByRole("status")).toContainText("INSTALLED");
    await done.getByRole("button", { name: "Done" }).click();
    await expect(done).toBeHidden();
  });

  test("Not now is remembered for the session", async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "Install AI Courtroom" });
    await dialog.getByRole("button", { name: "Not now" }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await page.waitForTimeout(2500);
    await expect(dialog).toBeHidden();
  });

  test("the header Install button opens it", async ({ page }, info) => {
    await page.goto("/about");
    if (info.project.name.startsWith("mobile")) {
      await page.getByRole("button", { name: "Menu" }).click();
      await page.locator("#mobile-menu").getByRole("link", { name: "Install app" }).click();
    } else {
      await page.getByRole("button", { name: "Install", exact: true }).click();
    }
    await expect(page.getByRole("dialog", { name: "Install AI Courtroom" })).toBeVisible();
  });
});

test.describe("install prompt on Android", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  });

  test("offers the APK", async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "Download AI Courtroom" });
    await expect(dialog).toBeVisible({ timeout: 6000 });
    await expect(dialog.getByRole("button", { name: "Download APK" })).toBeVisible();
  });
});

test("offline banner comes and goes", async ({ page, context }) => {
  await page.clock.install();
  await page.goto("/about");
  await context.setOffline(true);
  const status = page.getByRole("status").filter({ hasText: "OFFLINE" });
  await expect(status).toContainText("Some actions are paused");
  await context.setOffline(false);
  const back = page.getByRole("status").filter({ hasText: "BACK ONLINE." });
  await expect(back).toBeVisible();
  await page.clock.runFor(3000);
  await expect(back).toBeHidden();
});
