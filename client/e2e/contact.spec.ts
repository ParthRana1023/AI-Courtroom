import type { Route } from "@playwright/test";
import { test, expect, TURNSTILE_TOKEN } from "./support/fixtures";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const SENT = { id: "f1", feedback_category: "general", created_at: "2026-10-14T10:00:00Z" };

test.describe("contact", () => {
  test("a guest leaves a name and email, then sends", async ({ page, api, checkA11y }) => {
    let body: Record<string, unknown> | null = null;
    await api({
      "POST /feedback/submit": async (route: Route) => {
        body = route.request().postDataJSON();
        await route.fulfill({ status: 201, json: SENT });
      },
    });
    await page.goto("/contact");

    const form = page.getByRole("form", { name: "Contact form" });
    await expect(form.getByRole("status")).toContainText("NOTICE.You’re not signed in.");
    await expect(form.getByRole("link", { name: "sign in" })).toHaveAttribute("href", "/login?next=/contact");
    await checkA11y();

    await form.getByRole("button", { name: "Send message to the maker →" }).click();
    await expect(form.getByText("Name is required")).toBeVisible();
    await expect(form.getByText("Email is required")).toBeVisible();
    await expect(form.getByText("Message is required")).toBeVisible();
    await expect(form.getByLabel("Your name")).toBeFocused();
    expect(body).toBeNull();

    await form.getByLabel("Your name").fill("Meera Iyer");
    await form.getByLabel("Email for our reply").fill("meera@example");
    await form.getByLabel("Your message").fill("Hi");
    await expect(form.getByText("2 / 10 characters minimum")).toBeVisible();
    await form.getByRole("button", { name: "Send message to the maker →" }).click();
    await expect(form.getByText("Enter a valid email address")).toBeVisible();
    await expect(form.getByText("Message must be at least 10 characters")).toBeVisible();

    await form.getByLabel("Email for our reply").fill("meera@example.com");
    await form.getByLabel("Your message").fill("The gavel sound is lovely.");
    await expect(form.getByText("26 characters")).toBeVisible();
    await expect(form.getByText("✓ Checked: you’re not a robot.")).toBeVisible();
    await form.getByRole("button", { name: "Send message to the maker →" }).click();

    await expect(form.getByText("RECEIVED")).toBeVisible();
    await expect(form.getByText("Filed under: General Feedback")).toBeVisible();
    await expect(form.getByRole("link", { name: "Back to my cases" })).toHaveCount(0);
    expect(body).toEqual({
      feedback_category: "general",
      message: "The gavel sound is lovely.",
      name: "Meera Iyer",
      email: "meera@example.com",
      turnstile_token: TURNSTILE_TOKEN,
    });

    await form.getByRole("button", { name: "Write another" }).click();
    await expect(form.getByLabel("Your message")).toHaveValue("");
    await expect(form.getByLabel("Your name")).toHaveValue("Meera Iyer");
  });

  test("?cat=account_recovery asks which account, and the message is optional", async ({ page, api }) => {
    let body: Record<string, unknown> = {};
    await api({
      "POST /feedback/submit": async (route: Route) => {
        body = route.request().postDataJSON();
        await route.fulfill({ status: 201, json: { ...SENT, feedback_category: "account_recovery" } });
      },
    });
    await page.goto("/contact?cat=account_recovery");

    const form = page.getByRole("form", { name: "Contact form" });
    await expect(form.getByRole("radio", { name: "Account Recovery" })).toHaveAttribute("aria-checked", "true");
    await expect(form.getByText("Deleted accounts are kept for 30 days", { exact: false })).toBeVisible();
    const when = form.getByLabel("Deleted on · optional");
    const today = new Date();
    const threeDaysAgo = iso(new Date(today.getTime() - 3 * 864e5));
    await expect(when).toHaveAttribute("max", iso(today));
    await expect(when).toHaveAttribute("min", iso(new Date(today.getTime() - 30 * 864e5)));

    await form.getByLabel("Your name").fill("Meera Iyer");
    await form.getByLabel("Email for our reply").fill("meera@example.com");
    await form.getByLabel("Email or phone on the account").fill("nobody");
    await form.getByRole("button", { name: "Send message to the maker →" }).click();
    await expect(form.getByText("Enter an email address or a phone number")).toBeVisible();
    await expect(form.getByText("Message is required")).toHaveCount(0);

    await form.getByLabel("Email or phone on the account").fill("+91 98765 43210");
    await when.fill(threeDaysAgo);
    await form.getByRole("button", { name: "Send message to the maker →" }).click();
    await expect(form.getByText("Filed under: Account Recovery")).toBeVisible();
    expect(body).toMatchObject({
      feedback_category: "account_recovery",
      message: "",
      account_identifier: "+91 98765 43210",
      deleted_on: threeDaysAgo,
    });
  });

  test("a guest whose robot check fails is told how to carry on", async ({ page, api }) => {
    let sent = false;
    await api({ "POST /feedback/submit": (route: Route) => ((sent = true), route.fulfill({ status: 201, json: SENT })) });
    await page.addInitScript(() => Object.assign(window, { __turnstileFail: true }));
    await page.goto("/contact");

    const form = page.getByRole("form", { name: "Contact form" });
    await expect(form.getByText("The robot check couldn’t load.")).toBeVisible();
    await form.getByLabel("Your name").fill("Meera Iyer");
    await form.getByLabel("Email for our reply").fill("meera@example.com");
    await form.getByLabel("Your message").fill("The gavel sound is lovely.");
    await form.getByRole("button", { name: "Send message to the maker →" }).click();

    await expect(form.getByRole("alert")).toContainText("or sign in to write without it");
    expect(sent).toBe(false);
  });

  test("signed in: no guest fields, and a refusal is shown as an objection", async ({ page, signIn }, info) => {
    await signIn(undefined, {
      "POST /feedback/submit": (route: Route) =>
        route.fulfill({ status: 429, json: { detail: "The registry has received several letters from you already." } }),
    });
    await page.goto("/contact");

    const form = page.getByRole("form", { name: "Contact form" });
    await expect(form.getByRole("radio", { name: "General Feedback" })).toBeVisible();
    await expect(form.getByText("NOTICE.")).toHaveCount(0);
    await expect(form.getByLabel("Your name")).toHaveCount(0);
    await form.getByRole("radio", { name: "Bug Report" }).click();
    await expect(form.getByLabel("Your message")).toHaveAttribute("placeholder", /What happened, and what did you expect\?/);
    if (!info.project.name.startsWith("mobile")) await expect(form.getByText("Category: Bug Report")).toBeVisible();
    await form.getByLabel("Your message").fill("The gavel never stops ringing.");
    await form.getByRole("button", { name: "Send message to the maker →" }).click();

    await expect(form.getByRole("alert")).toContainText("OBJECTION.The registry has received several letters from you already.");
    await expect(form.getByLabel("Your message")).toHaveValue("The gavel never stops ringing.");
  });

  test("offline, sending pauses and the message is kept", async ({ page, api, context }) => {
    await api();
    await page.goto("/contact");
    const form = page.getByRole("form", { name: "Contact form" });
    await form.getByLabel("Your message").fill("Writing on the train.");
    await context.setOffline(true);

    const send = form.getByRole("button", { name: "Offline · message kept" });
    await expect(send).toBeVisible();
    await send.click();
    await expect(form.getByRole("alert")).toContainText("You’re offline. Your message is kept");
    await expect(form.getByLabel("Your message")).toHaveValue("Writing on the train.");
    await context.setOffline(false);
  });
});
