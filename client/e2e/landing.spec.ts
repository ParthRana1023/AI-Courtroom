import type { Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";

const isMobile = (name: string) => name.startsWith("mobile");

/** Pretend this browser has no WebGL, as when hardware acceleration is off. */
const noWebGL = (page: Page) =>
  page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return /webgl/.test(type) ? null : (real as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof real;
  });
/** A stored landing choice, seeded once (later loads keep whatever the page saved). */
/** The scene's give-up time: CI's software WebGL can take longer than a real GPU's 25s budget. */
const revealTimeout = (page: Page, ms: number) => page.addInitScript((t) => Object.assign(window, { __acRevealTimeoutMs: t }), ms);
const prefer = (page: Page, view: "classic" | "3d") =>
  page.addInitScript((v) => localStorage.getItem("aiCourtroom-landing") || localStorage.setItem("aiCourtroom-landing", v), view);

test.describe("landing classic", () => {
  test("without WebGL: the simple page says why, with the cases and the call to action", async ({ page, api, checkA11y }) => {
    await noWebGL(page);
    await api();
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Your first case is waiting." })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("the 3D courtroom needs hardware graphics (WebGL)");
    await expect(page.getByRole("button", { name: "Walk through the 3D courtroom instead →" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Take a Side" }).first()).toHaveAttribute("href", "/register");
    await expect(page.getByRole("link", { name: "Login" }).first()).toHaveAttribute("href", "/login");

    // Three sample files; the first is open.
    const files = page.locator("section[aria-labelledby=cases-t] article");
    await expect(files).toHaveCount(3);
    await expect(files.first().getByRole("button", { expanded: true })).toContainText("Close file ▴");
    await expect(files.first().getByRole("heading", { name: "Timeline" })).toBeVisible();
    await expect(files.first().getByRole("link", { name: "Argue this case →" })).toHaveAttribute("href", "/register");
    await files.nth(1).getByRole("button", { expanded: false }).click();
    await expect(files.nth(1).getByRole("button", { expanded: true })).toContainText("Close file ▴");
    await expect(files.nth(1).getByRole("heading", { name: "Investigation board" })).toBeVisible();

    await expect(page.getByRole("navigation", { name: "Footer" }).getByRole("link")).toHaveCount(9);
    await checkA11y();
  });

  test("a stored choice opens the simple page, with a way back to 3D", async ({ page, api }) => {
    await prefer(page, "classic");
    await api();
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Your first case is waiting." })).toBeVisible();
    await expect(page.getByRole("note")).toHaveCount(0);
    await page.getByRole("button", { name: "Walk through the 3D courtroom instead →" }).click();
    await expect(page).toHaveURL(/\/\?view=3d$/);
    await expect(page.getByText("Today’s cause list")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("aiCourtroom-landing"))).toBe("3d");
  });

  test("signed in: Cases and the account menu", async ({ page, signIn }) => {
    await noWebGL(page);
    await signIn();
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Cases" })).toHaveAttribute("href", "/cases");
    await expect(page.getByRole("link", { name: "My cases" }).first()).toHaveAttribute("href", "/cases");
    await nav.getByRole("button", { name: "Account menu" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/settings");
    await expect(menu.getByRole("menuitem", { name: "Your profile" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Log out" })).toBeVisible();
  });
});

test.describe("landing 3D", () => {
  test("?view=3d overrides a stored simple view and shows the cause list loader", async ({ page, api }) => {
    await prefer(page, "classic");
    await api();
    await page.goto("/?view=3d");
    await expect(page.getByText("Today’s cause list")).toBeVisible();
    await expect(page.getByText("Chambers unlocked")).toBeVisible();
  });

  test("the courtroom opens at the door, then Simple view switches and is remembered @webkit", async ({ page, api }, info) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    await revealTimeout(page, 100_000);
    // The service worker is blocked in tests, which the PWA helper reports; anything else is a bug.
    page.on("pageerror", (e) => !/registration.waiting|reading .waiting./.test(e.message) && errors.push(e.message));
    await api();
    await page.goto("/");

    // The loader stamps its items, then lifts to show the door.
    await expect(page.getByText("Today’s cause list")).toBeVisible();
    await expect(page.getByRole("img", { name: /First-person 3D walk-through/ })).toBeAttached({ timeout: 30_000 });
    await expect(page.getByText("Today’s cause list")).toBeHidden({ timeout: 90_000 });
    await expect(page.getByRole("heading", { level: 1, name: "YOUR FIRST CASE IS WAITING.", exact: true })).toBeVisible();

    if (isMobile(info.project.name)) {
      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByRole("menuitem", { name: "Simple view" }).click();
    } else {
      await page.getByRole("button", { name: "Simple view" }).click();
    }
    await expect(page.getByRole("heading", { level: 1, name: "Your first case is waiting.", exact: true })).toBeVisible();
    await expect(page.getByRole("note")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("aiCourtroom-landing"))).toBe("classic");
    expect(errors).toEqual([]);
  });

  test("a scene that doesn't show itself in time gives way to the simple page", async ({ page, api }) => {
    await revealTimeout(page, 1);
    await api();
    await page.goto("/");
    await expect(page.getByRole("note")).toHaveText("The 3D courtroom didn’t load, so you’re seeing the simple version.");
    await expect(page.getByRole("heading", { level: 1, name: "Your first case is waiting.", exact: true })).toBeVisible();
    // A failure isn't a choice: next time the 3D page is tried again.
    expect(await page.evaluate(() => localStorage.getItem("aiCourtroom-landing"))).toBeNull();
  });
});
