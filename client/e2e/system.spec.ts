import { test, expect } from "./support/fixtures";

test("404 page", async ({ page, checkA11y }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page Not Found", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "My cases" })).toHaveAttribute("href", "/cases");
  await checkA11y();
});

test("404 page matches the design @visual", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "Page Not Found" })).toBeVisible();
  await expect(page).toHaveScreenshot("not-found.png");
});

test("offline page", async ({ page, checkA11y }) => {
  await page.goto("/~offline");
  await expect(page.getByRole("heading", { name: "You’re offline", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await checkA11y();
});

test("landing page has no serious accessibility issues", async ({ page, checkA11y }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await checkA11y();
});
