import type { Page, Route } from "@playwright/test";
import { test, expect, USERS, type ApiRoutes } from "./support/fixtures";

const isMobile = (name: string) => name.startsWith("mobile");
const token = { access_token: "e2e-token", token_type: "bearer" };
const LOCATIONS: ApiRoutes = {
  "GET /location/countries": [
    { name: "India", iso2: "IN" },
    { name: "Nepal", iso2: "NP" },
  ],
  "GET /location/states/IN": [
    { name: "Maharashtra", iso2: "MH" },
    { name: "Karnataka", iso2: "KA" },
  ],
};

/** Type the six digits into the first box the way a paste would fill them. */
async function enterCode(page: Page, code = "123456") {
  await page.getByLabel("Digit 1 of 6").focus();
  await page.evaluate((digits) => {
    const box = document.activeElement as HTMLElement;
    const data = new DataTransfer();
    data.setData("text", digits);
    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, code);
}

/** Records the JSON body of the last request a route received. */
function capture(reply: unknown = {}) {
  const seen: { body?: Record<string, unknown> } = {};
  const handler = async (route: Route) => {
    seen.body = route.request().postDataJSON();
    await route.fulfill({ json: reply });
  };
  return { seen, handler };
}

async function pick(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

test.describe("sign in", () => {
  test("checks the fields and focuses the first one", async ({ page, checkA11y }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign the register" })).toBeVisible();
    await checkA11y();

    await page.getByRole("button", { name: "Enter the court →" }).click();
    await expect(page.getByText("Email is required")).toBeVisible();
    await expect(page.getByText("Password is required")).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeFocused();
    await expect(page.getByLabel("Email address")).toHaveAttribute("aria-invalid", "true");
  });

  test("email, password, then the emailed code", async ({ page, api }) => {
    const initiate = capture({ message: "sent" });
    await api({
      "POST /auth/login/initiate": initiate.handler,
      "POST /auth/login/verify": token,
      "GET /auth/profile": USERS.email,
    });
    await page.goto("/login?next=%2Fsettings");
    await page.getByLabel("Email address").fill("aanya.kapoor@gmail.com");
    await page.getByLabel("Password", { exact: true }).fill("Password123!");
    await page.getByRole("checkbox", { name: "Keep me signed in on this device" }).click();
    await page.getByRole("button", { name: "Enter the court →" }).click();

    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    expect(initiate.seen.body).toEqual({
      email: "aanya.kapoor@gmail.com",
      password: "Password123!",
      remember_me: true,
    });
    await expect(page.getByRole("button", { name: "Resend in 30s" })).toBeDisabled();
    await enterCode(page);
    await expect(page.getByText("ADMITTED")).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("shows the court's objection", async ({ page, api }) => {
    await api({
      "POST /auth/login/initiate": (route: Route) => route.fulfill({ status: 401, json: { detail: "Invalid credentials" } }),
    });
    await page.goto("/login");
    await page.getByLabel("Email address").fill("a@b.co");
    await page.getByLabel("Password", { exact: true }).fill("nope");
    await page.getByRole("button", { name: "Enter the court →" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("OBJECTION.");
    await expect(page.locator("form").getByRole("alert")).toContainText("Invalid credentials");
  });

  test("a wrong code is announced and the boxes clear", async ({ page, api }) => {
    await api({
      "POST /auth/login/initiate": {},
      "POST /auth/login/verify": (route: Route) =>
        route.fulfill({ status: 400, json: { detail: "This code does not match the court records." } }),
    });
    await page.goto("/login");
    await page.getByLabel("Email address").fill("a@b.co");
    await page.getByLabel("Password", { exact: true }).fill("pw");
    await page.getByRole("button", { name: "Enter the court →" }).click();
    await enterCode(page, "999999");
    await expect(page.locator("form").getByRole("alert")).toHaveText("This code does not match the court records.");
    await expect(page.getByLabel("Digit 1 of 6")).toHaveValue("");
    await expect(page.getByLabel("Digit 1 of 6")).toBeFocused();
  });

  test("phone sign-in sends a code by SMS", async ({ page, api }) => {
    const send = capture({ message: "sent" });
    await api({ "POST /auth/phone/send-otp": send.handler });
    await page.goto("/login");
    await page.getByRole("button", { name: "Phone", exact: true }).click();
    await expect(page.getByRole("button", { name: "Email", exact: true })).toBeVisible();

    await page.getByLabel("Mobile number").fill("12345");
    await page.getByRole("button", { name: "Send code →" }).click();
    await expect(page.getByText("Enter a 10-digit mobile number")).toBeVisible();

    await page.getByLabel("Mobile number").fill("98765 43210");
    await page.getByRole("button", { name: "Send code →" }).click();
    await expect(page.getByRole("heading", { name: "Check your phone" })).toBeVisible();
    await expect(page.getByText("+91 98765 43210")).toBeVisible();
    expect(send.seen.body).toMatchObject({ phone_code: "91", phone_number: "98765 43210", purpose: "login" });
  });

  test("session expiry and sign-out notices", async ({ page }) => {
    await page.goto("/login?session=expired");
    await expect(page.getByText("Your session has expired. Please sign in again.")).toBeVisible();
    await page.goto("/login?signedout=1");
    await expect(page.getByText("You’ve been logged out.")).toBeVisible();
  });

  test("a first sign-in asks for the seat of practice", async ({ page, api }) => {
    const save = capture(USERS.email);
    await api({
      "POST /auth/login/initiate": {},
      "POST /auth/login/verify": token,
      "GET /auth/profile": USERS.fresh,
      "PUT /auth/profile": save.handler,
      ...LOCATIONS,
    });
    await page.goto("/login");
    await page.getByLabel("Email address").fill("aanya.kapoor@gmail.com");
    await page.getByLabel("Password", { exact: true }).fill("Password123!");
    await page.getByRole("button", { name: "Enter the court →" }).click();
    await enterCode(page);

    await expect(page.getByRole("heading", { name: "Where do you practise?" })).toBeVisible();
    await page.getByRole("button", { name: "Open my first case →" }).click();
    await expect(page.getByText("Country is required")).toBeVisible();

    await pick(page, "Country", "India");
    await pick(page, "State / province", "Maharashtra");
    await page.getByLabel("City").fill("Pune");
    await page.getByRole("button", { name: "Open my first case →" }).click();
    await expect(page).toHaveURL(/\/cases$/);
    expect(save.seen.body).toEqual({
      country: "India",
      country_iso2: "IN",
      state: "Maharashtra",
      state_iso2: "MH",
      city: "Pune",
    });
  });

  test("signed-out visitors to a protected page come back after signing in", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/);
  });
});

// ---------------------------------------------------------------------------
// Enrol
// ---------------------------------------------------------------------------

test.describe("enrol", () => {
  test("checks every field and shows the password rules", async ({ page, checkA11y }, info) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "Enrol at the bar" })).toBeVisible();
    if (isMobile(info.project.name)) await expect(page.getByText("Step I of III")).toBeVisible();
    else await expect(page.getByRole("listitem").filter({ hasText: "Enrol" })).toContainText("Now");
    await checkA11y();

    await page.getByRole("button", { name: "Enrol →" }).click();
    for (const message of [
      "First name is required",
      "Last name is required",
      "Email is required",
      "Password is required",
      "You must be at least 18 years old to register",
    ]) {
      await expect(page.getByText(message)).toBeVisible();
    }
    await expect(page.getByLabel("First name")).toBeFocused();

    const rules = page.getByRole("tooltip");
    await page.getByLabel("Choose a password").focus();
    await expect(rules).toBeVisible();
    await expect(rules.getByRole("listitem").filter({ hasText: "8+ characters" })).toHaveClass(/d8ccb4/);
    await page.getByLabel("Choose a password").fill("Password1!");
    await expect(rules.getByRole("listitem").filter({ hasText: "8+ characters" })).toHaveClass(/9fd0a4/);
  });

  test("email enrolment: code, then seat of practice", async ({ page, api }) => {
    const initiate = capture({ skip_otp: false });
    await api({
      "POST /auth/register/initiate": initiate.handler,
      "POST /auth/register/verify": token,
      "GET /auth/profile": USERS.fresh,
      "PUT /auth/profile": USERS.email,
      ...LOCATIONS,
    });
    await page.goto("/register");
    await page.getByLabel("First name").fill("Asha");
    await page.getByLabel("Last name").fill("Verma");
    await page.getByLabel("Email address").fill("asha@example.com");
    await page.getByLabel("Choose a password").fill("Password123!");
    await page.getByRole("checkbox", { name: /18 or older/ }).click();
    await page.getByRole("button", { name: "Enrol →" }).click();

    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    expect(initiate.seen.body).toEqual({
      first_name: "Asha",
      last_name: "Verma",
      email: "asha@example.com",
      password: "Password123!",
      confirm_adult: true,
    });
    await enterCode(page);
    await expect(page.getByText("Email confirmed. Welcome to the bar, Asha.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where do you practise?" })).toBeVisible();
  });

  test("arriving from Google: details prefilled, no code needed", async ({ page, api }) => {
    await page.addInitScript(() =>
      sessionStorage.setItem(
        "googleUserData",
        JSON.stringify({
          first_name: "Aanya",
          last_name: "Kapoor",
          email: "aanya@gmail.com",
          google_signup_token: "g-token",
        }),
      ),
    );
    const initiate = capture({ skip_otp: true, ...token });
    await api({
      "POST /auth/register/initiate": initiate.handler,
      "GET /auth/profile": USERS.fresh,
      ...LOCATIONS,
    });
    await page.goto("/register?google=1");
    await expect(page.getByRole("heading", { name: "Complete your enrolment" })).toBeVisible();
    await expect(page.getByText("Signed in with Google")).toBeVisible();
    await expect(page.getByLabel("Email address")).toHaveCount(0);
    await expect(page.getByLabel("First name")).toHaveValue("Aanya");

    await page.getByLabel("Choose a password").fill("Password123!");
    await page.getByRole("checkbox", { name: /18 or older/ }).click();
    await page.getByRole("button", { name: "Enrol →" }).click();
    await expect(page.getByText("Welcome to the bar, Aanya.")).toBeVisible();
    expect(initiate.seen.body).toMatchObject({ email: "aanya@gmail.com", google_signup_token: "g-token" });
  });

  test("phone enrolment asks for the number instead of email and password", async ({ page, api }) => {
    const send = capture({});
    await api({ "POST /auth/phone/send-otp": send.handler });
    await page.goto("/register");
    await page.getByRole("button", { name: "Phone", exact: true }).click();
    await expect(page.getByLabel("Choose a password")).toHaveCount(0);
    await page.getByLabel("First name").fill("Ravi");
    await page.getByLabel("Last name").fill("Kumar");
    await page.getByLabel("Mobile number").fill("9876543210");
    await page.getByRole("checkbox", { name: /18 or older/ }).click();
    await page.getByRole("button", { name: "Enrol →" }).click();
    await expect(page.getByRole("heading", { name: "Check your phone" })).toBeVisible();
    expect(send.seen.body).toMatchObject({ purpose: "register", first_name: "Ravi", confirm_adult: true });
  });
});

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

test.describe("forgot password", () => {
  test("asks for the email and confirms the link was sent", async ({ page, api, checkA11y }) => {
    const forgot = capture({ message: "sent" });
    await api({ "POST /auth/password/forgot": forgot.handler });
    await page.goto("/forgot-password?email=asha%40example.com");
    await expect(page.getByLabel("Email address")).toHaveValue("asha@example.com");
    await checkA11y();
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resend in 30s" })).toBeDisabled();
    expect(forgot.seen.body).toEqual({ email: "asha@example.com" });
  });

  test("sets a new password from the link", async ({ page, api }) => {
    const reset = capture({ message: "changed" });
    await api({ "POST /auth/password/reset": reset.handler });
    const payload = Buffer.from(JSON.stringify({ email: "asha@example.com" })).toString("base64url");
    const link = `h.${payload}.s`;
    await page.goto(`/forgot-password?token=${link}`);

    await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();
    await expect(page.getByText("asha@example.com")).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill("Password123!");
    await page.getByLabel("Confirm new password").fill("Different1!");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Passwords don’t match.")).toBeVisible();

    await page.getByLabel("Confirm new password").fill("Password123!");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("RESET")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in →" })).toHaveAttribute("href", "/login");
    expect(reset.seen.body).toEqual({ token: link, password: "Password123!" });
  });

  test("an expired link is explained", async ({ page, api }) => {
    await api({
      "POST /auth/password/reset": (route: Route) =>
        route.fulfill({ status: 400, json: { detail: "This reset link is invalid or has expired." } }),
    });
    await page.goto("/forgot-password?token=x.e30.y");
    await page.getByLabel("New password", { exact: true }).fill("Password123!");
    await page.getByLabel("Confirm new password").fill("Password123!");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("This reset link is invalid or has expired.");
  });
});
