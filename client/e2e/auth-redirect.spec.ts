import { test, expect } from "@playwright/test";
import { safeNext } from "../lib/auth-redirect";

// Pure check of the ?next= guard; no page is opened.
test("only same-site paths survive ?next=", () => {
  expect(safeNext("/settings")).toBe("/settings");
  expect(safeNext("/cases?status=active#top")).toBe("/cases?status=active#top");
  for (const bad of [
    null,
    "",
    "settings",
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\\/evil.com",
    "/\tevil",
    "/\n//evil.com",
    "javascript:alert(1)",
    "/.//evil.com",
    "/..//evil.com",
    "/a/..//evil.com",
  ]) {
    expect(safeNext(bad), String(bad)).toBe("/cases");
  }
});
