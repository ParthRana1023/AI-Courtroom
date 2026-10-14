import type { Route } from "@playwright/test";
import { test, expect } from "./support/fixtures";

const IDS = ["web", "auth", "gen", "court", "analysis", "db"];
const status = (over: Record<string, string> = {}, incidents: unknown[] = []) => ({
  updated_at: new Date().toISOString(),
  components: IDS.map((id) => ({ id, status: over[id] ?? "ok" })),
  incidents,
});

test.describe("system status, signed out", () => {
  test("all systems operational", async ({ page, api, checkA11y }) => {
    await api({ "GET /status": status() });
    await page.goto("/status");

    await expect(page.getByRole("heading", { level: 1, name: "SYSTEM STATUS" })).toBeVisible();
    const services = page.getByRole("region", { name: "Services" });
    await expect(services.getByRole("status")).toHaveText("All systems operational");
    await expect(services.getByRole("listitem")).toHaveCount(6);
    await expect(services.getByText("Operational", { exact: true })).toHaveCount(6);
    await expect(services.getByText("No incidents reported in the last 90 days.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Report a problem" })).toHaveAttribute("href", "/contact");
    await checkA11y();
  });

  test("an outage, a slow service and their incidents", async ({ page, api }) => {
    const at = new Date().toISOString();
    await api({
      "GET /status": status({ court: "outage", analysis: "degraded" }, [
        {
          id: "i1",
          title: "Courtroom AI is unavailable",
          impact: "outage",
          status: "Investigating",
          resolved: false,
          updates: [{ at, kind: "Investigating", text: "Arguments can’t be submitted right now." }],
        },
        {
          id: "i2",
          title: "Case generation is slower than usual",
          impact: "degraded",
          status: "Resolved",
          resolved: true,
          updates: [{ at: "2026-09-30T08:05:00Z", kind: "Resolved", text: "Drafting is back to normal." }],
        },
      ]),
    });
    await page.goto("/status");

    const services = page.getByRole("region", { name: "Services" });
    await expect(services.getByRole("status")).toHaveText("Courtroom AI is down");
    await expect(services.getByRole("listitem").filter({ hasText: "Courtroom AI" })).toContainText("Outage");
    await expect(services.getByRole("listitem").filter({ hasText: "Case analysis" })).toContainText("Slower than usual");
    const open = services.getByRole("article").filter({ hasText: "Courtroom AI is unavailable" });
    await expect(open).toContainText("Investigating.");
    await expect(open).toContainText(new Date(at).toTimeString().slice(0, 5));
    await expect(services.getByRole("article").filter({ hasText: "slower than usual" })).toContainText("30 Sep");
  });

  test("when the API can't be reached, it says so", async ({ page, api }) => {
    await api({ "GET /status": (route: Route) => route.fulfill({ status: 503, body: "" }) });
    await page.goto("/status");
    await expect(page.getByRole("region", { name: "Services" }).getByRole("status")).toHaveText("AI Courtroom can’t be reached");
  });
});
