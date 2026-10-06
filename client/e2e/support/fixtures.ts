import { test as base, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { E2E_API } from "../playwright.config";

type Handler = unknown | ((route: Route) => Promise<void> | void);

/** "GET /auth/profile" → JSON body, or a function for full control (status, delay, abort). */
export type ApiRoutes = Record<string, Handler>;

export const USERS = {
  email: {
    id: "u1",
    first_name: "Aanya",
    last_name: "Kapoor",
    email: "aanya.kapoor@gmail.com",
    profile_photo_url: null,
  },
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

  page: async ({ page, context, baseURL, consented }, run) => {
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
