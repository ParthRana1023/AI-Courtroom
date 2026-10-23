import type { Page, Route } from "@playwright/test";
import { test, expect, USERS } from "./support/fixtures";
import { CNR, PARTIES, caseOf } from "./support/case-data";

const base = `/cases/${CNR}`;
let clock = 0;

type Event = Record<string, unknown>;
type Kase = Record<string, unknown> & { courtroom_proceedings: Event[] };

/** A courtroom event, a minute after the last one. */
function ev(id: string, type: string, content: string, speaker_role: string | null = null, extra: Record<string, unknown> = {}): Event {
  clock += 1;
  return {
    id,
    type,
    content,
    speaker_role,
    speaker_name: null,
    timestamp: `2026-10-02T10:${String(clock).padStart(2, "0")}:00Z`,
    exhibit_refs: [],
    ...extra,
  };
}

const OPENING = () => [
  ev("e1", "system_message", "Court is in session"),
  ev("e2", "opening_statement", "May it please the court. The applicant never meant to cheat anyone.", "plaintiff"),
  ev("e3", "opening_statement", "The State will show the accused took ₹42,00,000 on a false sanction.", "defendant"),
];
const NO_WITNESS = { has_witness: false, examination_history: [], is_ai_examining: false };

/** A hearing the mock server keeps state for: GET returns what the test last set. */
function hearing(over: Record<string, unknown> = {}) {
  clock = 0;
  const s = {
    kase: caseOf({
      user_role: "plaintiff",
      ai_role: "defendant",
      status: "active",
      hearing_controlled_here: true,
      session_args_at_start: 0,
      courtroom_proceedings: OPENING(),
      reported: [],
      pending_leave: null,
      is_ai_examining: false,
      ...over,
    }) as unknown as Kase,
    witness: NO_WITNESS as Record<string, unknown>,
    /** objection holds sent: true when the dialog opens, false when withdrawn */
    holds: [] as boolean[],
  };
  const push = (...e: Event[]) => {
    s.kase = { ...s.kase, courtroom_proceedings: [...s.kase.courtroom_proceedings, ...e] };
  };
  const routes: Record<string, unknown> = {
    [`GET ${base}`]: (route: Route) => route.fulfill({ json: s.kase }),
    [`GET ${base}/witness/current`]: (route: Route) => route.fulfill({ json: s.witness }),
    [`GET ${base}/parties`]: {
      parties: PARTIES,
      user_role: "plaintiff",
      can_access_courtroom: true,
      is_in_courtroom: true,
      case_status: "active",
    },
    "GET /limit/argument": { remaining_attempts: 7, max_attempts: 10, seconds_until_next: null },
    [`POST ${base}/objections/hold`]: async (route: Route) => {
      s.holds.push(route.request().postDataJSON().on);
      await route.fulfill({ json: { held: true } });
    },
  };
  return { s, push, routes };
}

/** Open the courtroom and wait out the "court is in session" stamp. */
async function open(page: Page, stamp = true) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${base}/courtroom`);
  await expect(page.getByRole("heading", { level: 1, name: "Raghav Menon v. State of NCT of Delhi and Another" })).toBeVisible();
  if (stamp) {
    await expect(page.getByText("COURT IS IN SESSION", { exact: true })).toBeVisible();
    await expect(page.getByText("COURT IS IN SESSION", { exact: true })).toBeHidden({ timeout: 6000 });
  }
  return page.getByRole("log", { name: "Record of proceedings" });
}

test.describe("courtroom", () => {
  test("the record, an objection that is sustained, and a report", async ({ page, signIn, checkA11y }) => {
    const h = hearing();
    h.push(
      ev("e4", "user_argument", "There is no evidence he drafted the letter.", "plaintiff"),
      ev("e5", "ai_argument", "₹50 lakh went missing from the project account.", "defendant"),
    );
    let objection: unknown;
    let report: unknown;
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/objections`]: async (route: Route) => {
        objection = route.request().postDataJSON();
        const list = h.s.kase.courtroom_proceedings;
        h.s.kase = {
          ...h.s.kase,
          courtroom_proceedings: [
            ...list.slice(0, -1),
            { ...list[list.length - 1], struck: "struck" },
            ev("e6", "objection", "Objection. Facts not in evidence. No exhibit shows that figure.", "plaintiff", {
              objection: { target_id: "e5", grounds: "Facts not in evidence", details: "" },
            }),
            ev("e7", "ruling", "Sustained. No exhibit supports that figure. It is struck from the record.", "judge", { sustained: true }),
          ],
        };
        await route.fulfill({ json: { sustained: true, ruling: "Sustained." } });
      },
      [`POST ${base}/reports`]: async (route: Route) => {
        report = route.request().postDataJSON();
        await route.fulfill({ json: { reported: true } });
      },
    });
    const log = await open(page);

    await expect(page.getByText("in session", { exact: true })).toBeVisible();
    await expect(page.getByText("Counsel for the Plaintiff", { exact: true })).toBeVisible();
    await expect(page.getByText("5 entries")).toBeVisible();
    await expect(log.getByText("Court is in session")).toBeVisible();
    await expect(log.getByText("Opening", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("2 arguments this session · 7 left today")).toBeVisible();
    await checkA11y();

    // Only the latest opposing argument can be objected to.
    await expect(log.getByRole("button", { name: "Object" })).toHaveCount(1);
    // Clicking Object holds the hearing; withdrawing lets it go on.
    await log.getByRole("button", { name: "Object" }).click();
    const dlg = page.getByRole("dialog", { name: "Objection, your honour." });
    await dlg.getByRole("button", { name: "Withdraw" }).click();
    await expect(dlg).toBeHidden();
    await expect.poll(() => h.s.holds).toEqual([true, false]);
    await log.getByRole("button", { name: "Object" }).click();
    await expect.poll(() => h.s.holds).toEqual([true, false, true]);
    await expect(dlg.getByText("₹50 lakh went missing from the project account.")).toBeVisible();
    await expect(dlg.getByText("0 / 500")).toBeVisible();
    await dlg.getByRole("button", { name: "Raise objection" }).click({ force: true });
    await expect(page.getByText("Choose the grounds for your objection.")).toBeVisible();
    await dlg.getByRole("radio", { name: "Facts not in evidence" }).click();
    await dlg.getByRole("textbox").fill("No exhibit shows that figure.");
    await expect(dlg.getByText("29 / 500")).toBeVisible();
    await dlg.getByRole("button", { name: "Raise objection" }).click();
    await expect(page.getByText("The court is considering the objection.")).toBeVisible();
    await expect(page.getByText("SUSTAINED", { exact: true })).toBeVisible({ timeout: 5000 });
    expect(objection).toEqual({ target_id: "e5", grounds: "Facts not in evidence", details: "No exhibit shows that figure." });
    await expect(log.getByText("Struck from the record", { exact: true })).toBeVisible({ timeout: 6000 });
    await expect(log.getByText("Sustained. No exhibit supports that figure.", { exact: false })).toBeVisible();
    await expect(log.getByRole("button", { name: "Object" })).toHaveCount(0);

    // Report the ruling.
    await log.getByRole("button", { name: "Report this AI response" }).last().click();
    const form = page.getByRole("dialog", { name: "What’s wrong with this response?" });
    await expect(form.getByRole("radio").first()).toBeFocused();
    await form.getByRole("radio", { name: /Wrong law or procedure/ }).click();
    await form.getByLabel("Details (optional)").fill("Section 999 doesn't exist.");
    await expect(form.getByText("26 / 500 · Your case number and entry 07 are attached automatically.")).toBeVisible();
    await form.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText("Report sent. Thanks — it helps us improve the AI.")).toBeVisible();
    expect(report).toEqual({ entry_id: "e7", reason: "law", details: "Section 999 doesn't exist." });
    await expect(log.getByRole("button", { name: "Response reported" })).toBeDisabled();
  });

  test("argue with a pinned exhibit; offline keeps the draft", async ({ page, context, signIn }, info) => {
    const mobile = info.project.name !== "desktop";
    const h = hearing();
    let body: unknown;
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/arguments`]: async (route: Route) => {
        body = route.request().postDataJSON();
        h.push(
          ev("e4", "user_argument", "The receipts were issued by the company.", "plaintiff", { exhibit_refs: ["EX-01"] }),
          ev("e5", "ai_argument", "Showing receipts is not the same as having approval.", "defendant"),
        );
        await route.fulfill({ json: { ai_counter_argument: "…", ai_counter_role: "defendant" } });
      },
    });
    const log = await open(page);

    await page.getByRole("button", { name: "Pin an exhibit" }).click();
    const picker = page.getByRole("dialog", { name: "Refer to an exhibit" });
    await picker.getByRole("button", { name: /EX-01.*Booking receipts/ }).click();
    await picker.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Referring to")).toBeVisible();

    const box = page.getByRole("textbox", { name: "Your argument" });
    await box.fill("The receipts were issued by the company.");
    if (mobile) await page.getByRole("button", { name: "Submit", exact: true }).click();
    else {
      await expect(page.getByText("Enter to submit · Shift + Enter for a new line")).toBeVisible();
      await box.press("Enter");
    }
    await expect(log.getByText("Showing receipts is not the same as having approval.")).toBeVisible();
    expect(body).toEqual({ role: "plaintiff", argument: "The receipts were issued by the company.", exhibit_refs: ["EX-01"] });
    await expect(box).toHaveValue("");

    // Voice input isn't built yet: the button only says so.
    await page.getByRole("button", { name: "Voice input, coming in a future update" }).click({ force: true });
    await expect(page.getByText("Voice input is coming in a future update.")).toBeVisible();

    // The pinned exhibit sits under the argument and opens the exhibit.
    await log.getByRole("button", { name: /EX-01.*Booking receipts/ }).click();
    const viewer = page.getByRole("dialog", { name: "Booking receipts" });
    await expect(viewer.getByText("Exhibit 1 of 2")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();

    await context.setOffline(true);
    await box.fill("A point for later.");
    await expect(page.getByRole("button", { name: "Offline" })).toBeVisible();
    await page.getByRole("button", { name: "Offline" }).click();
    await expect(page.getByText("You’re offline. Your argument is kept, so you can submit it when you’re back online.")).toBeVisible();
    await expect(box).toHaveValue("A point for later.");
    await context.setOffline(false);
  });

  test("the record follows new text, but not once the reader scrolls up", async ({ page, signIn }, info) => {
    const mobile = info.project.name !== "desktop";
    const h = hearing();
    for (let i = 0; i < 12; i++)
      h.push(ev(`p${i}`, i % 2 ? "ai_argument" : "user_argument", `Point ${i}. `.repeat(30), i % 2 ? "defendant" : "plaintiff"));
    let reply: () => void = () => undefined;
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/arguments`]: async (route: Route) => {
        // The reply waits until the test has scrolled up to read.
        await new Promise<void>((r) => (reply = r));
        h.push(ev("u1", "user_argument", "One more point.", "plaintiff"), ev("a1", "ai_argument", "My Lord, ".repeat(200), "defendant"));
        await route.fulfill({ json: { ai_counter_argument: "…", ai_counter_role: "defendant", ai_objection: null } });
      },
    });
    const log = await open(page);
    const gap = () => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
    await expect.poll(gap).toBeLessThan(40); // starts at the newest entry

    await page.emulateMedia({ reducedMotion: "no-preference" }); // let the reply type out
    const box = page.getByRole("textbox", { name: "Your argument" });
    await box.fill("One more point.");
    if (mobile) await page.getByRole("button", { name: "Submit", exact: true }).click();
    else await box.press("Enter");
    await expect.poll(gap).toBeLessThan(40); // what the user sent comes into view

    // Scroll up while the AI prepares and types its reply: the record stays where the reader put it.
    if (mobile) await log.evaluate((el) => el.scrollBy(0, -600));
    else {
      await log.hover();
      await page.mouse.wheel(0, -600);
    }
    await expect.poll(gap).toBeGreaterThan(300);
    reply();
    await expect(log.getByText("Preparing a reply")).toBeHidden({ timeout: 8000 });
    await page.waitForTimeout(800);
    expect(await gap()).toBeGreaterThan(300);

    // Back at the end, it follows again.
    await log.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect.poll(gap).toBeLessThan(40);
  });

  test("AI counsel objects to an argument and the court strikes it", async ({ page, signIn }, info) => {
    const mobile = info.project.name !== "desktop";
    const h = hearing();
    const RULING = "Sustained. No exhibit shows that sum. The remark is struck from the record.";
    let responded = false;
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/arguments`]: async (route: Route) => {
        // While the turn is heard, the case shows the objection, then the ruling.
        const live = { kind: "argument", grounds: "Facts not in evidence" };
        h.s.kase = { ...h.s.kase, ai_objection_live: live };
        await new Promise((r) => setTimeout(r, 2000));
        h.s.kase = { ...h.s.kase, ai_objection_live: { ...live, sustained: true, ruling: RULING } };
        await new Promise((r) => setTimeout(r, 3000));
        h.s.kase = { ...h.s.kase, ai_objection_live: null };
        responded = true;
        h.push(
          ev("e4", "user_argument", "₹5 crore was paid in cash.", "plaintiff", { struck: "struck" }),
          ev("e5", "objection", "Objection. Facts not in evidence. No exhibit shows that sum.", "defendant", {
            objection: { target_id: "e4", grounds: "Facts not in evidence", details: "No exhibit shows that sum." },
          }),
          ev("e6", "ruling", RULING, "judge", { sustained: true }),
        );
        await route.fulfill({
          json: {
            ai_counter_argument: null,
            ai_counter_role: "defendant",
            ai_objection: { grounds: "Facts not in evidence", sustained: true, ruling: RULING },
          },
        });
      },
    });
    const log = await open(page);

    const box = page.getByRole("textbox", { name: "Your argument" });
    await box.fill("₹5 crore was paid in cash.");
    if (mobile) await page.getByRole("button", { name: "Submit", exact: true }).click();
    else await box.press("Enter");

    // The same stamps as the user's own objection, each as it happens, then the record.
    await expect(page.getByText("Opposing counsel objects. The court is considering the objection.")).toBeVisible();
    expect(responded).toBe(false);
    await expect(page.getByText("SUSTAINED", { exact: true })).toBeVisible({ timeout: 5000 });
    expect(responded).toBe(false);
    await expect(page.getByText("Objection sustained: your argument is struck. Make another argument.")).toBeVisible({ timeout: 8000 });
    await expect(log.getByText("Objection. Facts not in evidence. No exhibit shows that sum.")).toBeVisible();
    await expect(log.getByText(RULING)).toBeVisible();
    await expect(log.getByText("Struck from the record", { exact: true })).toBeVisible();
    // No counter: the floor is the user's again.
    await expect(box).toHaveValue("");
    await expect(box).toBeEditable();
  });

  test("AI counsel objects to a question and it is withdrawn", async ({ page, signIn }, info) => {
    const mobile = info.project.name !== "desktop";
    const h = hearing();
    h.push(
      ev("w1", "witness_called", "Raghav Menon called to the witness stand by plaintiff.", "plaintiff", {
        speaker_name: "Raghav Menon",
        witness_id: "p1",
      }),
    );
    h.s.witness = {
      has_witness: true,
      witness_id: "p1",
      witness_name: "Raghav Menon",
      witness_role: "applicant",
      called_by: "plaintiff",
      examination_history: [],
      is_ai_examining: false,
      phase: "chief",
      next_examiner: "plaintiff",
    };
    const RULING = "Sustained. The question asks what someone else said. It is withdrawn.";
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/witness/examine`]: async (route: Route) => {
        h.push(
          ev("w2", "witness_examined_q", "What did your brother tell you?", "plaintiff", { witness_id: "p1", struck: "withdrawn" }),
          ev("w3", "objection", "Objection. Hearsay.", "defendant", { objection: { target_id: "w2", grounds: "Hearsay", details: "" } }),
          ev("w4", "ruling", RULING, "judge", { sustained: true }),
        );
        await route.fulfill({
          json: {
            question: "What did your brother tell you?",
            answer: null,
            ai_objection: { grounds: "Hearsay", sustained: true, ruling: RULING },
          },
        });
      },
    });
    await open(page);

    if (mobile) await page.getByRole("button", { name: "On the stand", exact: true }).click();
    else await page.getByRole("button", { name: "Open the witness stand" }).click();
    const stand = page.getByRole("complementary", { name: "Witness stand" });
    await stand.getByLabel("Question for the witness").fill("What did your brother tell you?");
    await stand.getByRole("button", { name: "Ask question" }).click();

    // The same stamps as the user's own objection, then the record.
    await expect(page.getByText("Opposing counsel objects. The court is considering the objection.")).toBeVisible();
    await expect(page.getByText("SUSTAINED", { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Objection sustained: question withdrawn. Ask another.")).toBeVisible({ timeout: 6000 });
    await expect(stand.getByText("Question withdrawn", { exact: true })).toBeVisible();
    // No answer is coming, so the stand doesn't show the witness answering.
    await expect(stand.getByText("Raghav is answering")).toHaveCount(0);
  });

  test("call a witness, examine, the AI cross-examines, then dismiss", async ({ page, signIn }, info) => {
    const mobile = info.project.name !== "desktop";
    const h = hearing();
    const posted: string[] = [];
    const exam = (examiner: string, phase: string, q: string, a: string) => ({
      id: `x${q.length}`,
      examiner,
      question: q,
      answer: a,
      timestamp: "2026-10-02T10:10:00Z",
      phase,
    });
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/witness/call`]: async (route: Route) => {
        posted.push(`call ${route.request().postDataJSON().witness_id}`);
        h.push(
          ev("w1", "witness_called", "Raghav Menon called to the witness stand by plaintiff.", "plaintiff", {
            speaker_name: "Raghav Menon",
            witness_id: "p1",
          }),
        );
        h.s.witness = {
          has_witness: true,
          witness_id: "p1",
          witness_name: "Raghav Menon",
          witness_role: "applicant",
          called_by: "plaintiff",
          examination_history: [],
          is_ai_examining: false,
          phase: "chief",
          next_examiner: "plaintiff",
        };
        await route.fulfill({ json: { success: true } });
      },
      [`POST ${base}/witness/examine`]: async (route: Route) => {
        const asked = route.request().postDataJSON();
        posted.push(`ask ${asked.question} [${asked.exhibit_refs}]`);
        h.push(
          ev("w2", "witness_examined_q", "Did you ever see the sanction letter?", "plaintiff", {
            witness_id: "p1",
            exhibit_refs: ["EX-01"],
          }),
          ev("w3", "witness_examined_a", "Only after the buyers showed it to me.", "applicant", { witness_id: "p1" }),
        );
        h.s.witness = {
          ...h.s.witness,
          examination_history: [
            exam("plaintiff", "chief", "Did you ever see the sanction letter?", "Only after the buyers showed it to me."),
          ],
        };
        await route.fulfill({ json: { answer: "Only after the buyers showed it to me." } });
      },
      [`POST ${base}/witness/ai-cross-examine`]: async (route: Route) => {
        posted.push("finish");
        // The AI cross-examines in the background; a later poll sees it done.
        h.s.kase = { ...h.s.kase, is_ai_examining: true };
        h.s.witness = { ...h.s.witness, is_ai_examining: true, phase: "cross", next_examiner: "defendant" };
        setTimeout(
          () => h.push(ev("w4", "witness_examined_q", "You signed every receipt, didn't you?", "defendant", { witness_id: "p1" })),
          1500,
        );
        setTimeout(() => {
          h.push(
            ev("w5", "witness_examined_a", "Yes, as director.", "applicant", { witness_id: "p1" }),
            ev("w5b", "system_message", "Counsel for the Defence logs Raghav Menon's answer as EX-03"),
          );
          // The AI logs an answer as evidence, as the user can.
          const logged = {
            id: "x3",
            exhibit_ref: "EX-03",
            title: "Signed as director",
            evidence_type: "Testimony",
            description: "Signed every receipt.",
            origin_id: "w5",
            extracted_by: "defendant",
          };
          h.s.kase = { ...h.s.kase, is_ai_examining: false, evidence: [...((h.s.kase.evidence as unknown[]) ?? []), logged] };
          h.s.witness = { ...h.s.witness, is_ai_examining: false, phase: "re_exam", next_examiner: "plaintiff" };
        }, 6000);
        await route.fulfill({ json: { state: "ai_cross_examining" } });
      },
      [`POST ${base}/witness/conclude`]: async (route: Route) => {
        posted.push("dismiss");
        h.push(ev("w6", "witness_dismissed", "Raghav Menon dismissed from the stand.", "judge", { witness_id: "p1" }));
        h.s.witness = NO_WITNESS;
        await route.fulfill({ json: { success: true } });
      },
    });
    const log = await open(page);

    if (mobile) await page.getByRole("button", { name: "Witness stand", exact: true }).click();
    else await page.getByRole("button", { name: "Open the witness stand" }).click();
    const stand = page.getByRole("complementary", { name: "Witness stand" });
    await expect(stand.getByText("No one on the stand")).toBeVisible();
    await expect(stand.getByText("Applicant · your side")).toBeVisible();
    await stand.getByRole("button", { name: "Call Raghav Menon" }).click();

    await expect(stand.getByText("Applicant · Called by you")).toBeVisible();
    // Put an exhibit to the witness with the question.
    await stand.getByRole("button", { name: "Pin an exhibit" }).click();
    const picker = page.getByRole("dialog", { name: "Refer to an exhibit" });
    // The list fits inside the stand, below its top.
    const [list, panel] = await Promise.all([picker.boundingBox(), stand.boundingBox()]);
    expect(list!.y).toBeGreaterThanOrEqual(panel!.y);
    await picker.getByRole("button", { name: /EX-01.*Booking receipts/ }).click();
    await picker.getByRole("button", { name: "Done" }).click();
    await stand.getByLabel("Question for the witness").fill("Did you ever see the sanction letter?");
    await stand.getByRole("button", { name: "Ask question" }).click();
    await expect(stand.getByText("Only after the buyers showed it to me.")).toBeVisible();
    await expect(stand.getByRole("button", { name: "EX-01" })).toBeVisible();
    // The examination in the record stays folded until opened.
    await expect(log.getByRole("button", { name: /On the stand now.*Raghav Menon/ })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("textbox", { name: "Your argument" })).toHaveAttribute("placeholder", /witness (is )?on the stand/i);

    await stand.getByRole("button", { name: "No more questions" }).click();
    await expect(stand.getByText("Counsel for the Defence is cross-examining the witness")).toBeVisible();
    // While an objection is drawn up the witness waits: no answer is shown as coming.
    await expect(stand.getByText("Raghav is answering")).toBeVisible({ timeout: 8000 });
    await stand.getByRole("button", { name: "Object", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(stand.getByText("Raghav is answering")).toHaveCount(0);
    await page.getByRole("dialog").getByRole("button", { name: "Withdraw" }).click();
    await expect(stand.getByText("Raghav is answering")).toBeVisible();
    await expect(stand.getByText("Yes, as director.")).toBeVisible({ timeout: 10000 });
    await expect(stand.getByText(/You may re-examine the witness once/)).toBeVisible();
    await stand.getByRole("button", { name: "No re-examination · dismiss" }).click();

    if (mobile) await expect(stand).toBeHidden({ timeout: 6000 });
    else await expect(page.getByRole("button", { name: "Open the witness stand" })).toBeVisible({ timeout: 6000 });
    const group = log.getByRole("button", { name: /Witness examination.*Raghav Menon.*2 questions · called by the Plaintiff/ });
    await expect(group).toHaveAttribute("aria-expanded", "false");
    await group.click();
    await expect(log.getByText("Raghav Menon steps down")).toBeVisible();
    await expect(log.getByText("Logged by the Defence as EX-03")).toBeVisible();
    expect(posted).toEqual(["call p1", "ask Did you ever see the sanction letter? [EX-01]", "finish", "dismiss"]);
  });

  test("the other side asks leave to call a witness; object and the court refuses", async ({ page, signIn }) => {
    const h = hearing();
    h.push(
      ev("l1", "leave_request", "Your Honour, the Defence seeks leave to call Priya Khanna to the stand.", "defendant", {
        witness_id: "p2",
      }),
    );
    h.s.kase = { ...h.s.kase, pending_leave: { event_id: "l1", witness_id: "p2", witness_name: "Priya Khanna", called_by: "defendant" } };
    let body: unknown;
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/witness/leave/respond`]: async (route: Route) => {
        body = route.request().postDataJSON();
        h.push(
          ev("l2", "objection", "Objection. Unfair surprise.", "plaintiff", {
            objection: { target_id: "l1", grounds: "Unfair surprise", details: "" },
          }),
          ev("l3", "ruling", "Sustained. The other side had no fair notice of this witness. Leave is refused.", "judge", {
            sustained: true,
          }),
        );
        h.s.kase = { ...h.s.kase, pending_leave: null };
        await route.fulfill({ json: { granted: false, sustained: true, ruling: "Sustained." } });
      },
    });
    const log = await open(page);

    await expect(log.getByText("Seeks leave", { exact: true })).toBeVisible();
    await expect(log.getByText("The court awaits your response")).toBeVisible();
    await page.getByRole("textbox", { name: "Your argument" }).fill("Moving on.");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Respond to the request to call a witness first.")).toBeVisible();

    await log.getByRole("group").getByRole("button", { name: "Object", exact: true }).click();
    const dlg = page.getByRole("dialog", { name: "Objection, your honour." });
    await expect(dlg.getByText("Counsel for the Defence · request to call a witness")).toBeVisible();
    await expect(dlg.getByRole("radio")).toHaveText([
      "Irrelevant to the charge",
      "Not on the witness list",
      "Repetitive evidence",
      "Unfair surprise",
    ]);
    await dlg.getByRole("radio", { name: "Unfair surprise" }).click();
    await dlg.getByRole("button", { name: "Raise objection" }).click();
    await expect(page.getByText("SUSTAINED", { exact: true })).toBeVisible({ timeout: 5000 });
    expect(body).toEqual({ objection: { grounds: "Unfair surprise", details: "" } });
    await expect(log.getByText(/Leave is refused\./)).toBeVisible({ timeout: 6000 });
    await expect(log.getByText("The court awaits your response")).toBeHidden();
  });

  test("no objection: the other side's witness takes the stand", async ({ page, signIn }) => {
    const h = hearing();
    h.push(
      ev("l1", "leave_request", "Your Honour, the Defence seeks leave to call Priya Khanna to the stand.", "defendant", {
        witness_id: "p2",
      }),
    );
    h.s.kase = { ...h.s.kase, pending_leave: { event_id: "l1", witness_id: "p2", witness_name: "Priya Khanna", called_by: "defendant" } };
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/witness/leave/respond`]: async (route: Route) => {
        expect(route.request().postDataJSON()).toEqual({ objection: null });
        h.push(
          ev("l2", "system_message", "No objection · Leave granted"),
          ev("l3", "witness_called", "Priya Khanna called to the witness stand by defendant.", "defendant", {
            speaker_name: "Priya Khanna",
            witness_id: "p2",
          }),
        );
        h.s.kase = { ...h.s.kase, pending_leave: null, is_ai_examining: true, current_witness_id: "p2" };
        h.s.witness = {
          has_witness: true,
          witness_id: "p2",
          witness_name: "Priya Khanna",
          witness_role: "non_applicant",
          called_by: "defendant",
          examination_history: [],
          is_ai_examining: true,
          phase: "chief",
          next_examiner: "defendant",
        };
        await route.fulfill({ json: { granted: true, witness_name: "Priya Khanna" } });
      },
    });
    const log = await open(page);

    await log.getByRole("button", { name: "No objection" }).click();
    await expect(page.getByRole("alertdialog", { name: "Priya Khanna" })).toBeVisible();
    await expect(page.getByText("The Defence calls", { exact: true })).toBeVisible();
    const stand = page.getByRole("complementary", { name: "Witness stand" });
    await expect(stand.getByText("Counsel for the Defence is examining the witness")).toBeVisible({ timeout: 6000 });
    await expect(stand.getByText("Non-applicant · Called by the Defence")).toBeVisible();
    await expect(log.getByText("No objection · Leave granted")).toBeVisible();
    await expect(log.getByText("On the stand now")).toBeVisible();
  });

  test("adjourn after two arguments, then resume", async ({ page, signIn }) => {
    const h = hearing({ session_args_at_start: 1 });
    const statuses: unknown[] = [];
    await signIn(USERS.email, {
      ...h.routes,
      [`PUT ${base}/status`]: async (route: Route) => {
        const b = route.request().postDataJSON();
        statuses.push(b);
        h.s.kase = { ...h.s.kase, status: b.status };
        h.push(ev(`s${statuses.length}`, "system_message", b.status === "active" ? "Court is in session" : "Court adjourned by counsel"));
        await route.fulfill({ json: { new_status: b.status } });
      },
    });
    await open(page);

    // Nothing argued this session yet: the court won't adjourn.
    const adjourn = page.getByRole("button", { name: "Adjourn" });
    await expect(adjourn).toHaveAttribute("title", "Submit at least 2 more arguments this session before adjourning");
    await adjourn.click({ force: true }); // aria-disabled, but still explains why
    await expect(page.getByText("Submit at least 2 more arguments this session before adjourning.")).toBeVisible();
    expect(statuses).toEqual([]);

    h.push(
      ev("e4", "user_argument", "The letter came from the buyers.", "plaintiff"),
      ev("e5", "ai_argument", "The accused showed it to them.", "defendant"),
      ev("e6", "user_argument", "Showing is not forging.", "plaintiff"),
      ev("e7", "ai_argument", "He knew.", "defendant"),
    );
    await page.reload();
    await expect(page.getByText("COURT IS IN SESSION", { exact: true })).toBeHidden({ timeout: 6000 });
    await expect(page.getByRole("button", { name: "Adjourn" })).toHaveAttribute("title", "End this court session. You can resume later.");
    await page.getByRole("button", { name: "Adjourn" }).click();
    await expect(page.getByText("COURT ADJOURNED")).toBeVisible();
    await expect(page.getByText("adjourned", { exact: true })).toBeVisible({ timeout: 6000 });
    await expect(page.getByText("The hearing is paused. Resume when you’re ready to continue.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Your argument" })).toBeHidden();

    await page.getByRole("button", { name: "Resume hearing →" }).first().click();
    await expect(page.getByText("COURT IS IN SESSION", { exact: true })).toBeVisible();
    expect(statuses).toEqual([{ status: "adjourned" }, { status: "active" }]);
  });

  test("closing statement, the verdict and the analysis", async ({ page, signIn, checkA11y }, info) => {
    const mobile = info.project.name !== "desktop";
    const h = hearing();
    h.push(
      ev("a1", "user_argument", "One.", "plaintiff"),
      ev("a2", "ai_argument", "Reply one.", "defendant"),
      ev("a3", "user_argument", "Two.", "plaintiff"),
      ev("a4", "ai_argument", "Reply two.", "defendant"),
      ev("a5", "user_argument", "Three.", "plaintiff"),
      ev("a6", "ai_argument", "Reply three.", "defendant"),
    );
    let closing: unknown;
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/closing-statement`]: async (route: Route) => {
        closing = route.request().postDataJSON();
        h.push(
          ev("c1", "closing_statement", "The State has not proved intent.", "plaintiff"),
          ev("c2", "closing_statement", "The accused knew the letter was false.", "defendant"),
          ev("c3", "system_message", "Judgment delivered"),
        );
        h.s.kase = {
          ...h.s.kase,
          status: "resolved",
          outcome: "partial",
          verdict:
            "**CORAM: HON'BLE R. K. MEHTA, J.**\n\n**FACTS**\n\n1. The applicant seeks quashing of the FIR.\n2. The petition is partly allowed.\n\n**ORDER**\n\n3. The charge of cheating stands.\n\n**(R. K. Mehta, J.)**\nNew Delhi\n2 October 2026",
        };
        await route.fulfill({ json: { verdict: "…" } });
      },
      [`POST ${base}/analyze-case`]: {
        analysis:
          "### Outcome\nPartly won.\n\n### Mistakes\n**Arguments**\n- You never explained the letter.\n\n### Suggestions\n- Call the architect.",
        outcome: "partial",
      },
    });
    await open(page);

    await page.getByRole("tab", { name: "Closing statement" }).click();
    await expect(page.getByText(/Your closing statement ends the hearing/)).toBeVisible();
    // Evidence goes in arguments only: a closing can't cite exhibits.
    await expect(page.getByText("Sum up from the record: you can’t cite exhibits, bring new evidence or call a witness.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pin an exhibit" })).toBeHidden();
    await page.getByRole("tab", { name: "Argument" }).click();
    await expect(page.getByRole("button", { name: "Pin an exhibit" })).toBeVisible();
    await page.getByRole("tab", { name: "Closing statement" }).click();
    await page.getByLabel("Closing statement").fill("The State has not proved intent.");
    await page.getByRole("button", { name: "Deliver closing" }).click();

    await expect(page.getByText("THE COURT IS DELIBERATING")).toBeVisible({ timeout: 6000 });
    expect(closing).toEqual({ role: "plaintiff", statement: "The State has not proved intent." });
    // Judgment is delivered only once the court has deliberated.
    const log = page.getByRole("log", { name: "Record of proceedings" });
    await expect(log.getByText("Judgment delivered")).toHaveCount(0);
    await expect(page.getByText("THE COURT IS DELIBERATING")).toBeHidden({ timeout: 6000 });
    await expect(log.getByText("Judgment delivered")).toBeVisible();
    const verdict = page.getByRole("dialog", { name: "Verdict" });
    await expect(verdict).toBeVisible({ timeout: 8000 });
    await expect(verdict.getByText("PARTLY WON")).toBeVisible();
    await expect(verdict.getByText("Judgment · " + CNR)).toBeVisible();
    await expect(verdict.getByText("The petition is partly allowed.")).toBeVisible();
    // The judge signs at the foot; the typed signature lines become the signature block.
    await expect(verdict.getByRole("img", { name: "Signed: R. K. Mehta" }).locator("svg")).toBeAttached();
    await expect(verdict.getByText("R. K. Mehta, J.", { exact: true })).toBeVisible();
    await expect(verdict.getByText("2 October 2026")).toBeVisible();
    await expect(verdict.getByText("An AI-generated ruling for practice. It is not legal advice.")).toBeVisible();
    await checkA11y();

    await verdict.getByRole("button", { name: "Analyse my case →" }).click();
    const analysis = page.getByRole("dialog", { name: "How you argued" });
    await expect(analysis.getByText("You never explained the letter.")).toBeVisible();
    await expect(analysis.getByRole("heading", { name: "Mistakes" })).toBeVisible();
    await expect(analysis.getByText("Counsel for the Plaintiff · Raghav Menon v. State of NCT of Delhi and Another")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(analysis).toBeHidden();

    await expect(page.getByText("resolved", { exact: true })).toBeVisible();
    await expect(page.getByText("The court has delivered its verdict. The record is now closed.")).toBeVisible();
    // On a phone, View verdict lives only in the bottom bar.
    await expect(page.getByRole("button", { name: "View verdict" })).toHaveCount(mobile ? 1 : 2);
  });

  test("the opening statement can't cite exhibits", async ({ page, signIn }) => {
    const h = hearing({ courtroom_proceedings: [ev("e1", "system_message", "Court is in session")] });
    await signIn(USERS.email, h.routes);
    await open(page);

    await expect(page.getByRole("textbox", { name: "Your argument" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pin an exhibit" })).toBeHidden();
  });

  test("watching from another device, then taking over", async ({ page, signIn }) => {
    const h = hearing({ hearing_controlled_here: false });
    await signIn(USERS.email, {
      ...h.routes,
      [`POST ${base}/take-over`]: async (route: Route) => {
        h.s.kase = { ...h.s.kase, hearing_controlled_here: true };
        await route.fulfill({ json: { hearing_controlled_here: true } });
      },
    });
    await open(page);

    await expect(page.getByText("In session · watching")).toBeVisible();
    await expect(page.getByText("This hearing is being run from another device. You can follow the proceedings here.")).toBeVisible();
    await expect(page.getByText("Arguments are being submitted from another device.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Your argument" })).toBeHidden();
    await page.getByRole("button", { name: "Take over the hearing" }).click();
    await expect(page.getByText("You’re now running the hearing from this device.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Your argument" })).toBeVisible();
    await expect(page.getByText("in session", { exact: true })).toBeVisible();
  });

  test("the case file panel, in the light theme", async ({ page, signIn, checkA11y }) => {
    await page.addInitScript(() => localStorage.setItem("aiCourtroom-theme", "light"));
    const h = hearing();
    await signIn(USERS.email, h.routes);
    await open(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await checkA11y();

    const opener = page.getByRole("button", { name: "Case file" });
    await opener.click();
    const panel = page.getByRole("dialog", { name: "Raghav Menon v. State of NCT of Delhi and Another" });
    await expect(panel.getByText("Case file · " + CNR)).toBeVisible();
    await expect(panel.getByRole("heading", { name: "I. Case summary" })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "VI. Issues for the court" })).toBeVisible();
    await expect(panel.getByRole("link", { name: "Open the full case file →" })).toHaveAttribute("href", base);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("a case that doesn't exist, a failed load, and the redirect before the hearing opens", async ({ page, signIn }) => {
    let fail = true;
    await signIn(USERS.email, {
      [`GET ${base}`]: async (route: Route) =>
        fail
          ? route.fulfill({ status: 500, json: {} })
          : route.fulfill({ json: caseOf({ user_role: "plaintiff", status: "not started" }) }),
      [`GET ${base}/witness/current`]: NO_WITNESS,
      "GET /cases/NOPE000000000000": async (route: Route) => route.fulfill({ status: 404, json: { detail: "Not found" } }),
      "GET /cases/NOPE000000000000/witness/current": NO_WITNESS,
      [`GET ${base}/parties`]: { parties: PARTIES },
      [`GET ${base}/evidence`]: { evidence: [] },
    });
    await page.goto("/cases/NOPE000000000000/courtroom");
    await expect(page.getByText("Case Not Found")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to my cases" })).toHaveAttribute("href", "/cases");

    await page.goto(`${base}/courtroom`);
    await expect(page.getByText("Couldn’t open the courtroom")).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    // A hearing that hasn't opened goes back to Case Prep.
    await expect(page).toHaveURL(new RegExp(`${base}/case-prep$`));
  });
});
