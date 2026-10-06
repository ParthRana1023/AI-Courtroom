import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Monocart resolves paths from the working directory, so anchor them to this folder.
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Everything Playwright lives in client/e2e: this config, specs, support/, __screenshots__/
// and the git-ignored .results/ and .report/ output. Run with `pnpm test:e2e`.
//
// The client is built against an API origin that never answers; every call is mocked
// per test with page.route (support/fixtures.ts), so no server, DB or LLM is needed.
export const E2E_API = "http://127.0.0.1:8765";
const PORT = 3100;

export default defineConfig({
  testDir: ".",
  outputDir: "./.results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}",
  fullyParallel: true,
  // Browser start-up is slow on Windows; too many workers starve each other.
  workers: process.env.CI ? 2 : 4,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    process.env.CI ? ["github"] : ["list"],
    ["html", { open: "never", outputFolder: "./.report/html" }],
    // Client code coverage from Chromium (V8), mapped to our source through source maps.
    // Open e2e/.report/coverage/index.html; the totals also print after the run.
    [
      "monocart-reporter",
      {
        name: "AI Courtroom e2e",
        outputFile: here("./.report/monocart/index.html"),
        coverage: {
          outputDir: here("./.report/coverage"),
          reports: ["v8", "console-summary"],
          entryFilter: (entry: { url: string }) => entry.url.includes("/_next/static/chunks/"),
          sourceFilter: (path: string) =>
            /(^|\/)(app|components|contexts|hooks|lib)\//.test(path) && !path.includes("node_modules"),
        },
      },
    ],
  ],
  // Baselines are per OS; CI runs on Linux and skips @visual until Linux baselines exist.
  grepInvert: process.env.CI ? /@visual/ : undefined,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: "block",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 924, height: 540 } },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      // Safari has its own WebGL quirks; only the 3D specs run here.
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"] },
      grep: /@webkit/,
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    cwd: "..",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
    // E2E_COVERAGE turns on browser source maps so coverage maps back to our files.
    env: { NEXT_PUBLIC_API_URL: E2E_API, NEXT_PUBLIC_PHONE_AUTH_ENABLED: "true", E2E_COVERAGE: "true" },
  },
});
