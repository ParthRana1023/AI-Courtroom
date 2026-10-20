import type { Route } from "@playwright/test";
import { test, expect } from "./support/fixtures";

const ON = { kind: "product_updates", label: "Product updates", subscribed: true };

test.describe("unsubscribe", () => {
  test("opening the link asks first; the button unsubscribes", async ({ page, api, checkA11y }) => {
    let posted: string | null = null;
    await api({
      "GET /notifications/unsubscribe": ON,
      "POST /notifications/unsubscribe": async (route: Route) => {
        posted = new URL(route.request().url()).searchParams.get("token");
        await route.fulfill({ json: { ...ON, subscribed: false } });
      },
    });
    await page.goto("/unsubscribe?token=tok-123");

    await expect(page.getByRole("heading", { name: "Stop “Product updates” emails?" })).toBeVisible();
    expect(posted).toBeNull(); // opening the page changes nothing
    await checkA11y();

    await page.getByRole("button", { name: "Unsubscribe" }).click();
    await expect(page.getByRole("heading", { name: "You’re unsubscribed" })).toBeVisible();
    await expect(page.getByText("You won’t get “Product updates” emails any more.")).toBeVisible();
    expect(posted).toBe("tok-123");
    await expect(page.getByRole("link", { name: "Email settings" })).toHaveAttribute("href", "/settings#notify");
  });

  test("an email already off says so straight away", async ({ page, api }) => {
    await api({ "GET /notifications/unsubscribe": { ...ON, subscribed: false } });
    await page.goto("/unsubscribe?token=tok");

    await expect(page.getByRole("heading", { name: "You’re unsubscribed" })).toBeVisible();
  });

  test("a bad or missing link explains itself", async ({ page, api }) => {
    await api({
      "GET /notifications/unsubscribe": (route: Route) =>
        route.fulfill({
          status: 400,
          json: { detail: "This unsubscribe link is invalid or has expired. Change your emails in Settings." },
        }),
    });
    await page.goto("/unsubscribe?token=bad");
    await expect(page.getByRole("heading", { name: "This link doesn’t work" })).toBeVisible();
    await expect(page.getByText("This unsubscribe link is invalid or has expired.")).toBeVisible();

    await page.goto("/unsubscribe");
    await expect(page.getByRole("heading", { name: "This link doesn’t work" })).toBeVisible();
  });
});
