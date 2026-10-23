import { test, expect } from "./support/fixtures";

const isMobile = (name: string) => name.startsWith("mobile");

// [path, h1, article label, footer name of this page, sections, last updated]
const DOCS: [string, string, string, string, number, string | null][] = [
  ["/about", "ABOUT AI COURTROOM", "About", "About", 5, null],
  ["/privacy", "PRIVACY POLICY", "Privacy Policy", "Privacy Policy", 8, "24 October 2026"],
  ["/terms", "TERMS OF SERVICE", "Terms of Service", "Terms of Service", 12, "24 October 2026"],
  ["/cookies", "COOKIE POLICY", "Cookie Policy", "Cookie Policy", 7, "18 October 2026"],
  ["/help", "HELP & FAQ", "Help and FAQ", "Help & FAQ", 7, "24 October 2026"],
  ["/changelog", "CHANGELOG", "Changelog", "Changelog", 13, "24 October 2026"],
  ["/accessibility", "ACCESSIBILITY", "Accessibility", "Accessibility", 4, "4 October 2026"],
];
const FOOTER = [
  "About",
  "Help & FAQ",
  "Changelog",
  "Privacy Policy",
  "Cookie Policy",
  "Terms of Service",
  "Accessibility",
  "Contact Us",
  "System status",
];

test.describe("documents, signed out", () => {
  for (const [path, h1, label, here, sections, updated] of DOCS) {
    test(`${path} opens with its index and footer`, async ({ page, api }, info) => {
      await api();
      await page.goto(path);

      await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
      const doc = page.getByRole("article", { name: label });
      await expect(doc.locator("section[data-sec]")).toHaveCount(sections);
      if (updated) await expect(page.getByText(`Last updated: ${updated}`)).toBeVisible();
      await expect(doc.getByText("AI Courtroom is a practice simulator for learning advocacy.", { exact: false })).toBeAttached();
      await expect(doc.getByRole("navigation", { name: "Legal" }).getByRole("link")).toHaveText(FOOTER.filter((t) => t !== here));

      if (isMobile(info.project.name))
        await expect(page.getByRole("combobox", { name: "Jump to section" }).locator("option")).toHaveCount(sections);
      else await expect(page.getByRole("navigation", { name: "Contents" }).getByRole("button")).toHaveCount(sections);
    });
  }

  test("the index jumps to a section and follows the scroll", async ({ page, api, checkA11y }, info) => {
    await api();
    await page.goto("/terms");
    const last = page.locator("#s-contact");

    if (isMobile(info.project.name)) {
      const jump = page.getByRole("combobox", { name: "Jump to section" });
      await jump.selectOption("contact");
      await expect(last).toBeInViewport();
      await expect(jump).toHaveValue("contact");
    } else {
      const index = page.getByRole("navigation", { name: "Contents" });
      await index.getByRole("button", { name: /Contact us/ }).click();
      await expect(last).toBeInViewport();
      await expect(index.getByRole("button", { name: /Contact us/ })).toHaveAttribute("aria-current", "true");
      // Scrolling back to the top marks the first section again (once the jump's 0.7s hold is over).
      await page.waitForTimeout(800);
      await page
        .getByRole("article", { name: "Terms of Service" })
        .locator("[data-scroller]")
        .evaluate((el) => el.scrollTo(0, 0));
      await expect(index.getByRole("button", { name: /Agreement to terms/ })).toHaveAttribute("aria-current", "true");
    }
    await checkA11y();
  });

  test("about: the maker and the call to action", async ({ page, api }) => {
    await api();
    await page.goto("/about");
    const doc = page.getByRole("article", { name: "About" });
    await expect(doc.getByRole("link", { name: "GitHub ↗" })).toHaveAttribute("target", "_blank");
    await expect(doc.getByRole("link", { name: "Send a message to the maker →" })).toHaveAttribute("href", "/contact");
    await expect(doc.getByRole("link", { name: "Take a Side" })).toHaveAttribute("href", "/register");
    await expect(doc.getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
  });

  test("about, signed in: the call to action leads to your cases", async ({ page, signIn }) => {
    await signIn();
    await page.goto("/about");
    await expect(page.getByRole("article", { name: "About" }).getByRole("link", { name: "My cases" })).toHaveAttribute("href", "/cases");
  });

  test("links between documents work", async ({ page, api }) => {
    await api();
    await page.goto("/privacy");
    await page
      .getByRole("article", { name: "Privacy Policy" })
      .getByRole("navigation", { name: "Legal" })
      .getByRole("link", { name: "Cookie Policy" })
      .click();
    await expect(page).toHaveURL(/\/cookies$/);
    await expect(page.getByRole("heading", { level: 1, name: "COOKIE POLICY" })).toBeVisible();
  });
});
