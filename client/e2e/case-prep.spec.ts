import type { Page, Route } from "@playwright/test";
import { test, expect, USERS } from "./support/fixtures";
import { CNR, EVIDENCE, PARTIES, caseOf } from "./support/case-data";

const base = `/cases/${CNR}`;

function routes(over: Record<string, unknown> = {}, kase = caseOf({ user_role: "plaintiff", ai_role: "defendant" })) {
  return {
    [`GET ${base}`]: kase,
    [`GET ${base}/parties`]: { parties: PARTIES, user_role: kase.user_role, can_access_courtroom: false, is_in_courtroom: kase.status === "active", case_status: kase.status },
    [`GET ${base}/evidence`]: { evidence: EVIDENCE },
    [`GET ${base}/parties/p1/chat-history`]: { messages: [] },
    [`GET ${base}/parties/p2/chat-history`]: { messages: [] },
    [`GET ${base}/parties/p2`]: { ...PARTIES[1], bio: "Priya Khanna teaches mathematics in Janakpuri." },
    ...over,
  };
}

/** Opens the interview with the default client on either layout. */
async function openInterview(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole("button", { name: /Raghav Menon/ }).click();
  await page.getByRole("button", { name: "Interview Raghav →" }).click();
  return page.getByRole("log", { name: "Interview transcript" });
}

test.describe("case prep", () => {
  test("interview a client, extract the answer, and view the exhibit", async ({ page, signIn, checkA11y }, info) => {
    const mobile = info.project.name !== "desktop";
    let extracted = false;
    await signIn(
      USERS.email,
      routes({
        [`POST ${base}/parties/p1/chat`]: {
          user_message: { id: "q1", sender: "user", content: "What happened, in your own words?", timestamp: "2026-10-07T10:00:00Z" },
          party_response: { id: "a1", sender: "person", content: "Our funding partner pulled out in May.", timestamp: "2026-10-07T10:00:05Z" },
        },
        [`POST ${base}/evidence/extract`]: async (route: Route) => {
          extracted = true;
          expect(route.request().postDataJSON()).toEqual({ party_id: "p1", message_id: "a1" });
          await route.fulfill({
            status: 201,
            json: {
              evidence: { id: "e3", exhibit_ref: "PN-01", title: "Statement of Raghav Menon", evidence_type: "Witness Testimony", description: "Our funding partner pulled out in May.", source: "Raghav Menon chat", media_status: "pending", origin_id: "p1:a1", private: true },
            },
          });
        },
      }),
    );
    await page.goto(`${base}/case-prep`);

    await expect(page.getByRole("heading", { name: "Case Prep" })).toBeVisible();
    await expect(page.getByText("You are the Plaintiff Lawyer")).toBeVisible();
    await expect(page.getByText("Applicants. You can interview them.")).toBeVisible();
    if (!mobile) await expect(page.getByText("He says a funding partner withdrew.")).toBeVisible();

    const log = await openInterview(page, mobile);
    await expect(log.getByText("No questions yet.")).toBeVisible();
    await log.getByRole("button", { name: "What happened, in your own words?" }).click();
    await expect(page.getByLabel("Question for Raghav Menon")).toHaveValue("What happened, in your own words?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(log.getByText("Our funding partner pulled out in May.")).toBeVisible();
    await checkA11y();

    await log.getByRole("button", { name: "Save to Privileged" }).click();
    await expect(page.getByText("Saved to Privileged as PN-01. Only you can see it until you cite it in court.")).toBeVisible();
    expect(extracted).toBe(true);

    await log.getByRole("button", { name: "In Privileged as PN-01 · view" }).click();
    const viewer = page.getByRole("dialog");
    await expect(viewer.getByText("Privileged note 1 of 1")).toBeVisible();
    await expect(viewer.getByText("Saved by you from an interview. Privileged: only you can see it until you cite it in court")).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Close" })).toBeFocused();
    // notes are paged apart from the exhibits
    await page.keyboard.press("ArrowLeft");
    await expect(viewer.getByText("Privileged note 1 of 1")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();

    // the note lives in its own tab, not with the exhibits
    await page.getByRole("tab", { name: /Evidence/ }).click();
    await expect(page.getByText("Exhibits · 2")).toBeVisible();
    await page.getByRole("tab", { name: /Privileged/ }).click();
    await expect(page.getByText("Privileged · 1")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open PN-01, Statement of Raghav Menon" })).toBeVisible();
  });

  test("an exhibit can be pinned to a question", async ({ page, signIn }, info) => {
    let posted: unknown;
    await signIn(
      USERS.email,
      routes({
        [`POST ${base}/parties/p1/chat`]: async (route: Route) => {
          posted = route.request().postDataJSON();
          await route.fulfill({
            json: {
              user_message: { id: "q1", sender: "user", content: "Is this yours?", timestamp: "2026-10-07T10:00:00Z", exhibit_refs: ["EX-01"] },
              party_response: { id: "a1", sender: "person", content: "Yes, those are my receipts.", timestamp: "2026-10-07T10:00:05Z" },
            },
          });
        },
      }),
    );
    await page.goto(`${base}/case-prep`);
    await openInterview(page, info.project.name !== "desktop");
    await page.getByRole("button", { name: "Pin an exhibit" }).click();
    await page.getByRole("dialog", { name: "Refer to an exhibit" }).getByRole("button", { name: /EX-01/ }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Refer to an exhibit" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Remove EX-01" })).toBeVisible();
    await page.getByLabel("Question for Raghav Menon").fill("Is this yours?");
    await page.getByRole("button", { name: "Send", exact: true }).click();

    const log = page.getByRole("log", { name: "Interview transcript" });
    await expect(log.getByText("Yes, those are my receipts.")).toBeVisible();
    expect(posted).toEqual({ message: "Is this yours?", exhibit_refs: ["EX-01"] });
    await expect(page.getByRole("button", { name: "Remove EX-01" })).toHaveCount(0);
    await log.getByRole("button", { name: /EX-01/ }).click();
    await expect(page.getByRole("dialog").getByText("Exhibit 1 of 2")).toBeVisible();
  });

  test("the other side can be read but not interviewed", async ({ page, signIn }, info) => {
    await signIn(USERS.email, routes());
    await page.goto(`${base}/case-prep`);
    await page.getByRole("button", { name: /Priya Khanna/ }).click();
    await expect(page.getByText("Priya Khanna teaches mathematics in Janakpuri.")).toBeVisible();
    await expect(page.getByText("NOT YOUR CLIENT").first()).toBeVisible();
    await expect(page.getByText("As the Plaintiff Lawyer you can only interview applicants. You’ll question Priya in court.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Interview Priya →" })).toHaveCount(0);
    if (info.project.name !== "desktop") {
      await page.getByRole("button", { name: "All parties" }).click();
      await expect(page.getByText("Other side")).toBeVisible();
    }
  });

  test("a rate-limited question keeps the draft and says why", async ({ page, signIn }, info) => {
    await signIn(
      USERS.email,
      routes({ [`POST ${base}/parties/p1/chat`]: (route: Route) => route.fulfill({ status: 429, json: { detail: "You’ve asked a lot of questions. Try again in 2 minutes." } }) }),
    );
    await page.goto(`${base}/case-prep`);
    await openInterview(page, info.project.name !== "desktop");
    await page.getByLabel("Question for Raghav Menon").fill("Where did the money go?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Try again in 2 minutes." })).toBeVisible();
    await expect(page.getByLabel("Question for Raghav Menon")).toHaveValue("Where did the money go?");
  });

  test("exhibits: a failed image is remade in the background", async ({ page, signIn }) => {
    // The server queues the image and makes it after replying; the page checks back.
    let made = false;
    const second = (media_status: string) => ({ ...EVIDENCE[1], media_status });
    await signIn(
      USERS.email,
      routes({
        [`POST ${base}/evidence/e2/image/regenerate`]: async (route: Route) => {
          await route.fulfill({ json: { evidence: [EVIDENCE[0], second("pending")] } });
          made = true;
        },
        [`GET ${base}/evidence`]: async (route: Route) =>
          route.fulfill({ json: { evidence: [EVIDENCE[0], second(made ? "generated" : "failed")] } }),
      }),
    );
    await page.goto(`${base}/case-prep`);
    await page.getByRole("tab", { name: /Evidence/ }).click();
    await expect(page.getByText("Exhibits · 2")).toBeVisible();
    await expect(page.getByText("Image generation failed")).toBeVisible();
    await page.getByRole("button", { name: "↻ Regenerate" }).click();
    await expect(page.getByText("Making the image. It appears here when it’s ready.")).toBeVisible();
    await expect(page.getByText("Image generation failed")).toHaveCount(0);
    await expect(page.getByText("Image ready")).toHaveCount(2, { timeout: 12000 });

    await page.getByRole("button", { name: "Open EX-01, Booking receipts" }).click();
    await expect(page.getByRole("dialog").getByText("With the case file")).toBeVisible();
  });

  test("in session: interviews are read-only and the courtroom is one step away", async ({ page, signIn }, info) => {
    await signIn(USERS.email, routes({}, caseOf({ user_role: "plaintiff", ai_role: "defendant", status: "active" })));
    await page.goto(`${base}/case-prep`);
    await expect(page.getByText("Courtroom in session")).toBeVisible();
    await expect(page.getByRole("button", { name: "Return to Courtroom →" })).toBeVisible();
    if (info.project.name !== "desktop") await page.getByRole("button", { name: /Raghav Menon/ }).click();
    await page.getByRole("button", { name: "Read transcript →" }).click();
    await expect(page.getByText("Read-only · courtroom in session")).toBeVisible();
    await expect(page.getByLabel("Question for Raghav Menon")).toHaveCount(0);
  });

  test("as the defendant, proceeding prepares the opening, then opens the courtroom", async ({ page, signIn }) => {
    const calls: string[] = [];
    const kase = caseOf({ user_role: "defendant", ai_role: "plaintiff" });
    await signIn(
      USERS.email,
      routes(
        {
          [`POST ${base}/generate-plaintiff-opening`]: async (route: Route) => {
            calls.push("opening");
            await route.fulfill({ json: {} });
          },
          [`PUT ${base}/status`]: async (route: Route) => {
            calls.push(`status:${route.request().postDataJSON().status}`);
            await route.fulfill({ json: {} });
          },
        },
        kase,
      ),
    );
    await page.goto(`${base}/case-prep`);
    await expect(page.getByText("Non-applicants. You can interview them.")).toBeVisible();
    await page.getByRole("button", { name: "Proceed to Courtroom →" }).click();
    await expect(page).toHaveURL(new RegExp(`${base}/courtroom$`));
    expect(calls).toEqual(["opening", "status:active"]);
  });

  test("without a side, it goes back to the case file", async ({ page, signIn }) => {
    await signIn(USERS.email, { ...routes({}, caseOf()) });
    await page.goto(`${base}/case-prep`);
    await expect(page).toHaveURL(new RegExp(`${base}$`));
    await expect(page.getByText("Choose your side")).toBeVisible();
  });
});
