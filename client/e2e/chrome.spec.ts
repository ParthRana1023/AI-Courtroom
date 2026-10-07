import { test, expect } from "./support/fixtures";

const isMobile = (name: string) => name.startsWith("mobile");

test.describe("header, signed out", () => {
  test("shows public nav and sign-in links", async ({ page }, info) => {
    await page.goto("/");
    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "AI Courtroom home" })).toBeVisible();

    if (isMobile(info.project.name)) {
      await header.getByRole("button", { name: "Menu" }).click();
      const menu = page.locator("#mobile-menu");
      for (const tile of ["Home", "Contact", "About", "Settings", "Login", "Take a Side"]) {
        await expect(menu.getByRole("link", { name: tile, exact: true })).toBeVisible();
      }
      await expect(menu.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
    } else {
      const nav = header.getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link")).toHaveText(["Home", "Contact", "About", "Settings", "Login", "Take a Side"]);
      await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    }
  });

  test("More menu lists the documents and marks the current one", async ({ page }, info) => {
    await page.goto("/privacy");
    const docs = [
      "Help & FAQ",
      "Changelog",
      "Privacy Policy",
      "Cookie Policy",
      "Terms of Service",
      "Accessibility",
    ];

    if (isMobile(info.project.name)) {
      // No dropdown on phones: the same links sit in the mobile menu's footer strip.
      await page.getByRole("button", { name: "Menu" }).click();
      const menu = page.locator("#mobile-menu");
      for (const doc of docs) await expect(menu.getByRole("link", { name: doc })).toBeVisible();
      await expect(menu.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("aria-current", "page");
      return;
    }

    await page.getByRole("button", { name: "More" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveText(docs);
    await expect(menu.getByRole("menuitem", { name: "Privacy Policy" })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(page.getByRole("button", { name: "More" })).toBeFocused();
  });
});

test.describe("header, signed in", () => {
  test("shows Cases, the avatar menu and logs out", async ({ page, signIn }, info) => {
    await signIn();
    await page.goto("/contact");

    if (isMobile(info.project.name)) {
      await page.getByRole("button", { name: "Menu" }).click();
      const menu = page.locator("#mobile-menu");
      await expect(menu.getByRole("link", { name: "Cases", exact: true })).toBeVisible();
      await expect(menu.getByRole("link", { name: "Contact", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(menu.getByRole("link", { name: "Profile" })).toBeVisible();
      await menu.getByRole("link", { name: "Log out" }).click();
    } else {
      const nav = page.getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link", { name: "Cases" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Contact" })).toHaveAttribute("aria-current", "page");
      const avatar = page.getByRole("button", { name: "Account menu" });
      await expect(avatar).toHaveText("AK");
      await avatar.click();
      const menu = page.getByRole("menu");
      await expect(menu).toContainText("Aanya Kapoor");
      await expect(menu).toContainText("aanya.kapoor@gmail.com");
      await expect(menu.getByRole("menuitem", { name: "Your profile" })).toHaveAttribute("href", "/profile");
      await menu.getByRole("menuitem", { name: "Log out" }).click();
    }
    await expect(page).toHaveURL(/\/login\?signedout=1$/);
  });
});

test.describe("theme", () => {
  test("defaults to dark, toggles to light and remembers it", async ({ page }, info) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");

    if (isMobile(info.project.name)) {
      await page.getByRole("button", { name: "Menu" }).click();
      await page.locator("#mobile-menu").getByRole("button", { name: "Switch to light theme" }).click();
    } else {
      await page.getByRole("button", { name: "Switch to light theme" }).click();
    }
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", "#d9cfbb");

    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => localStorage.getItem("aiCourtroom-theme"))).toBe("light");
  });
});
