import { test as base, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { addCoverageReport } from "monocart-reporter";
import { E2E_API } from "../playwright.config";

type Handler = unknown | ((route: Route) => Promise<void> | void);

/** "GET /auth/profile" → JSON body, or a function for full control (status, delay, abort). */
export type ApiRoutes = Record<string, Handler>;

const base_user = {
  id: "u1",
  first_name: "Aanya",
  last_name: "Kapoor",
  email: "aanya.kapoor@gmail.com" as string | null,
  auth_method: "email",
  profile_photo_url: null,
  country: "India" as string | null,
  country_iso2: "IN" as string | null,
  state: "Maharashtra" as string | null,
  state_iso2: "MH" as string | null,
  city: "Mumbai" as string | null,
};

export const USERS = {
  email: base_user,
  /** Just enrolled: no seat of practice yet. */
  fresh: { ...base_user, country: null, country_iso2: null, state: null, state_iso2: null, city: null },
};

const CONSENT = {
  essential: true,
  functional: true,
  analytics: false,
  marketing: false,
  timestamp: "2026-10-06T00:00:00.000Z",
  version: "1.0",
};

async function routeApi(page: Page, routes: ApiRoutes) {
  await page.route(`${E2E_API}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const handler = routes[`${req.method()} ${path}`];
    if (handler === undefined) {
      await route.fulfill({ status: 404, json: { detail: `Not mocked: ${req.method()} ${path}` } });
    } else if (typeof handler === "function") {
      await handler(route);
    } else {
      await route.fulfill({ json: handler });
    }
  });
}

interface Fixtures {
  /** Records client JS coverage on Chromium for the monocart report (runs for every test). */
  coverage: void;
  /** Mock API routes for this test; unmocked calls get a 404. */
  api: (routes?: ApiRoutes) => Promise<void>;
  /** Sign in as a mocked user (token cookie + GET /auth/profile). */
  signIn: (user?: (typeof USERS)[keyof typeof USERS], routes?: ApiRoutes) => Promise<void>;
  /** Fail the test on serious accessibility violations on the current page. */
  checkA11y: () => Promise<void>;
  /** Set to false to see the cookie banner. */
  consented: boolean;
}

export const test = base.extend<Fixtures>({
  consented: [true, { option: true }],

  coverage: [
    async ({ page, browserName }, run, info) => {
      const on = browserName === "chromium";
      if (on) await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await run();
      if (on) await addCoverageReport(await page.coverage.stopJSCoverage(), info);
    },
    { auto: true },
  ],

  page: async ({ page, context, baseURL, consented }, run) => {
    // Tests never reach a third party (e.g. Google's sign-in script): only the app and the mocked API.
    await context.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (route) => route.abort("blockedbyclient"));
    if (consented) {
      await context.addCookies([
        { name: "ai_courtroom_consent", value: encodeURIComponent(JSON.stringify(CONSENT)), url: baseURL! },
      ]);
    }
    await run(page);
  },

  api: async ({ page }, run) => {
    await run((routes = {}) => routeApi(page, routes));
  },

  signIn: async ({ page, context, baseURL }, run) => {
    await run(async (user = USERS.email, routes = {}) => {
      await context.addCookies([{ name: "token", value: "e2e-token", url: baseURL! }]);
      await routeApi(page, { "GET /auth/profile": user, "POST /auth/logout": {}, ...routes });
    });
  },

  checkA11y: async ({ page }, run) => {
    await run(async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
    });
  },
});

export { expect };
