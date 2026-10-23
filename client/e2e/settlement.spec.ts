import type { Route } from "@playwright/test";
import { test, expect, USERS } from "./support/fixtures";
import { CNR, caseOf } from "./support/case-data";

const base = `/cases/${CNR}`;
const AT = "2026-10-18T10:40:00Z";

// The user takes the plaintiff side; the applicant, Raghav Menon, is the accused.
const PROFILE = {
  route: "quash",
  title: "Quashing on compromise",
  court: "§ 528 BNSS · High Court of Delhi",
  offences: [
    { section: "§ 318(4)", title: "Cheating", note: "A private money dispute. The court can quash it on compromise." },
    { section: "§ 316(2)", title: "Criminal breach of trust", note: "The same test applies." },
  ],
  must: "Both complainants must sign.",
  must_detail: "The court won’t quash the FIR on a part-settlement.",
  footnote: "Compounding (§ 359) and plea bargaining apply to trials.",
  closed: [],
  conditions: [
    { key: "deposit", label: "First instalment deposited in court", short: "Deposit in court", clause: "…", favours: "complainants" },
    { key: "apology", label: "Written apology to each complainant", short: "Written apology", clause: "…", favours: "complainants" },
    {
      key: "withdraw",
      label: "Consumer complaints withdrawn on final payment",
      short: "Complaints withdrawn",
      clause: "…",
      favours: "accused",
    },
  ],
  accused: "Raghav Menon",
  accused_side: "plaintiff",
  complainants: ["Priya Khanna", "Amit Sehgal"],
  claim: 4200000,
};

const T1 = { amount: 4200000, instalments: 6, months: 12, interest: 0, conditions: ["apology"] };
const T2 = { amount: 4200000, instalments: 3, months: 6, interest: 9, conditions: ["apology", "deposit"] };

const entry = (by: "user" | "ai", kind: string, terms: object | null = null, note = "") => ({
  id: `${by}-${kind}-${Math.random()}`,
  by,
  kind,
  terms,
  note,
  at: AT,
});
const attempt = (entries: object[], over: Record<string, unknown> = {}) => ({
  id: "s1",
  status: "negotiating",
  entries,
  agreed: null,
  ruling: null,
  court_order: null,
  started_at: AT,
  ended_at: null,
  ...over,
});
const view = (over: Record<string, unknown> = {}) => ({
  profile: PROFILE,
  attempt: null,
  attempts: 0,
  closed: null,
  can_start: true,
  start_blocked: null,
  max_offers: 3,
  ...over,
});

const routes = (
  over: Record<string, unknown> = {},
  kase = caseOf({ user_role: "plaintiff", ai_role: "defendant", status: "adjourned" }),
) => ({
  [`GET ${base}`]: kase,
  [`GET ${base}/settlement`]: view(),
  [`POST ${base}/settlement/start`]: view({ attempt: attempt([]), attempts: 1, can_start: false }),
  ...over,
});

test.describe("settlement", () => {
  test("counsel for the accused offers, hears a counter and accepts it", async ({ page, signIn, checkA11y }) => {
    let sent: { terms: typeof T1; note: string } | null = null;
    const countered = attempt([entry("user", "offer", T1, "He needs time."), entry("ai", "counter", T2, "The buyers want interest.")]);
    await signIn(
      USERS.email,
      routes({
        [`POST ${base}/settlement/offers`]: async (route: Route) => {
          sent = route.request().postDataJSON();
          await route.fulfill({ json: view({ attempt: countered, attempts: 1, can_start: false }) });
        },
        [`POST ${base}/settlement/accept`]: view({
          attempt: attempt([...countered.entries, entry("user", "accept")], { status: "agreed", agreed: T2 }),
          attempts: 1,
          can_start: false,
        }),
      }),
    );
    await page.goto(`${base}/settlement`);

    await expect(page.getByRole("heading", { name: "Settlement", level: 1 })).toBeVisible();
    await expect(page.getByText("Quashing on compromise")).toBeVisible();
    await expect(page.getByText("Set the terms your client offers.")).toBeVisible();
    const offer = page.getByRole("region", { name: "Your offer" });
    await expect(offer.getByRole("textbox", { name: "Amount (₹)" })).toHaveValue("42,00,000");
    await checkA11y();

    await offer.getByRole("radio", { name: "6" }).first().click();
    await offer.getByRole("radiogroup", { name: "Over (months)" }).getByRole("radio", { name: "12" }).click();
    await offer.getByRole("checkbox", { name: "Written apology to each complainant" }).click();
    await offer.getByRole("textbox", { name: "Note to the other side" }).fill("He needs time.");
    await offer.getByRole("button", { name: "Send offer" }).click();

    expect(sent).toEqual({ terms: T1, note: "He needs time." });
    const talks = page.getByRole("region", { name: "Negotiation" });
    await expect(talks.getByText("Counter-offer")).toBeVisible();
    await expect(talks.getByText("“The buyers want interest.”")).toBeVisible();
    await expect(talks.getByText("Your offers · 1 of 3")).toBeVisible();
    await expect(page.getByText("Your offer stays open. Talks continue after the hearing.")).toBeVisible();
    await expect(offer.getByText("Pre-filled with their last terms. Change what you want to offer.")).toBeVisible();
    await expect(offer.getByRole("textbox", { name: "Interest (% a year)" })).toHaveValue("9");

    await offer.getByRole("button", { name: "Accept their terms" }).click();
    await expect(talks.getByText("Terms agreed")).toBeVisible();
    await expect(offer.getByText("No more offers. The compromise deed is drafted from the agreed terms.")).toBeVisible();
  });

  test("counsel for the complainants hears the opening offer; changed terms can only be sent", async ({ page, signIn }) => {
    let started = 0;
    await signIn(
      USERS.email,
      routes({
        [`GET ${base}/settlement`]: view({ profile: { ...PROFILE, accused_side: "defendant" } }),
        [`POST ${base}/settlement/start`]: async (route: Route) => {
          started += 1;
          await route.fulfill({
            json: view({
              profile: { ...PROFILE, accused_side: "defendant" },
              attempt: attempt([entry("ai", "offer", T1, "Our client accepts the money is owed.")]),
              attempts: 1,
              can_start: false,
            }),
          });
        },
      }),
    );
    await page.goto(`${base}/settlement`);

    const talks = page.getByRole("region", { name: "Negotiation" });
    await expect(talks.getByText("Menon’s counsel")).toBeVisible();
    await expect(talks.getByText("“Our client accepts the money is owed.”")).toBeVisible();
    expect(started).toBe(1);

    const offer = page.getByRole("region", { name: "Your offer" });
    const accept = offer.getByRole("button", { name: "Accept their terms" });
    await expect(accept).toBeEnabled();
    await offer.getByRole("textbox", { name: "Interest (% a year)" }).fill("9");
    await expect(accept).toBeDisabled();
    await expect(offer.getByText("You’ve changed their terms. Send them as a counter-offer, or undo to accept.")).toBeVisible();
    await offer.getByRole("button", { name: "Undo changes" }).click();
    await expect(accept).toBeEnabled();
    await expect(offer.getByRole("button", { name: "Send counter-offer" })).toBeVisible();
  });

  test("refused talks close until the next hearing", async ({ page, signIn }) => {
    await signIn(
      USERS.email,
      routes({
        [`GET ${base}/settlement`]: view({
          attempt: attempt([entry("user", "offer", T1), entry("ai", "refuse", null, "Three buyers won’t settle.")], {
            status: "rejected",
            ended_at: AT,
          }),
          attempts: 1,
          can_start: false,
          start_blocked: "Talks are closed for now. You can propose again after the next hearing.",
        }),
      }),
    );
    await page.goto(`${base}/settlement`);

    const talks = page.getByRole("region", { name: "Negotiation" });
    await expect(talks.getByText("Refused", { exact: true })).toBeVisible();
    await expect(talks.getByText("Talks closed")).toBeVisible();
    await expect(page.getByRole("region", { name: "Your offer" }).getByText("Talks closed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept their terms" })).toHaveCount(0);
  });

  test("while the court sits, the desk is read-only", async ({ page, signIn }) => {
    await signIn(
      USERS.email,
      routes(
        {
          [`GET ${base}/settlement`]: view({
            attempt: attempt([entry("user", "offer", T1), entry("ai", "counter", T2)]),
            attempts: 1,
            can_start: false,
            closed: "The court is in session.",
          }),
        },
        caseOf({ user_role: "plaintiff", ai_role: "defendant", status: "active" }),
      ),
    );
    await page.goto(`${base}/settlement`);

    await expect(page.getByText("Read-only · courtroom in session")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send counter-offer" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Return to Courtroom →" })).toBeVisible();
  });

  test("talks that fail to open can be opened again by hand", async ({ page, signIn }) => {
    let tries = 0;
    await signIn(
      USERS.email,
      routes({
        [`POST ${base}/settlement/start`]: async (route: Route) => {
          tries += 1;
          if (tries === 1) {
            await route.fulfill({ status: 500, json: { detail: "Couldn’t open talks. Please try again." } });
            return;
          }
          await route.fulfill({ json: view({ attempt: attempt([]), attempts: 1, can_start: false }) });
        },
      }),
    );
    await page.goto(`${base}/settlement`);

    const offer = page.getByRole("region", { name: "Your offer" });
    await expect(offer.getByText("Couldn’t open talks", { exact: true })).toBeVisible();
    await offer.getByRole("button", { name: "Try again" }).click();

    await expect(offer.getByRole("button", { name: "Send offer" })).toBeVisible();
    expect(tries).toBe(2);
  });

  test("offline, the offer is kept", async ({ page, context, signIn }) => {
    let posted = false;
    await signIn(
      USERS.email,
      routes({
        [`POST ${base}/settlement/offers`]: async (route: Route) => {
          posted = true;
          await route.abort();
        },
      }),
    );
    await page.goto(`${base}/settlement`);
    await expect(page.getByRole("button", { name: "Send offer" })).toBeVisible();

    await context.setOffline(true);
    await page.getByRole("button", { name: "Offline" }).click();

    await expect(page.getByText("You’re offline. Your offer is kept, so you can send it when you’re back online.")).toBeVisible();
    expect(posted).toBe(false);
  });

  test("no route: each one is closed, and Case Prep's link says so", async ({ page, signIn }) => {
    const none = {
      ...PROFILE,
      route: "none",
      title: "",
      court: "",
      offences: [],
      conditions: [],
      closed: [
        { section: "§ 528", title: "Quashing on compromise", note: "Needs a petition before the High Court." },
        { section: "§ 359", title: "Compounding", note: "One of the charges isn’t compoundable." },
        { section: "§ 289", title: "Plea bargaining", note: "The 30 days from the charge have passed." },
      ],
    };
    const kase = caseOf({ user_role: "plaintiff", ai_role: "defendant", status: "adjourned", settlement_profile: none });
    await signIn(
      USERS.email,
      routes(
        {
          [`GET ${base}/settlement`]: view({ profile: none, can_start: false, closed: "No settlement route is open for this case." }),
          [`GET ${base}/parties`]: {
            parties: [],
            user_role: "plaintiff",
            can_access_courtroom: false,
            is_in_courtroom: false,
            case_status: "adjourned",
          },
          [`GET ${base}/evidence`]: { evidence: [] },
        },
        kase,
      ),
    );
    await page.goto(`${base}/settlement`);

    await expect(page.getByRole("heading", { name: "No settlement route is open" })).toBeVisible();
    await expect(page.getByText("CLOSED", { exact: true })).toBeVisible();
    await expect(page.getByText("Closed", { exact: true })).toHaveCount(3);

    await page.getByRole("link", { name: "Back to Case Prep" }).click();
    await expect(page).toHaveURL(new RegExp(`${base}/case-prep$`));
    const link = page.getByRole("link", { name: "Settlement", exact: true });
    await expect(link).toHaveAttribute("aria-disabled", "true");
    await link.click({ force: true }); // aria-disabled, but a click still explains why
    await expect(page.getByText(/No settlement route is open for this case\. At least one charge/)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${base}/case-prep$`));
  });
});
