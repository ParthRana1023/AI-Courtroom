import type { Metadata } from "next";
import DocPage from "@/components/docs/doc-page";
import { K, Sec } from "@/components/docs/kit";
import { roman } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Every update to AI Courtroom, newest first.",
};

type Tag = "New" | "Changed" | "Fixed" | "Removed";
type Release = { id: string; title: string; lede: string; items: [Tag, string][] };

const TAG_CLASS: Record<Tag, string> = { New: K.tagNew, Changed: K.tagFix, Fixed: K.tagFix, Removed: K.tagRed };

// Versions follow client/package.json. Each entry groups a run of releases by what users noticed,
// not every version bump in the git history.
const RELEASES: Release[] = [
  {
    id: "v5-4",
    title: "5.4.1–5.4.6 · 24 October 2026",
    lede: "Settlement payments play out, and a default goes where the law sends it.",
    items: [
      [
        "New",
        "After a settlement, the accused pays the instalments on their own, one a day. How reliably they pay comes from their background, so read it before you settle.",
      ],
      [
        "New",
        "A missed instalment gets notice under the deed. Paid within it, nothing more comes of it; left unpaid, the complainants act on the default.",
      ],
      [
        "New",
        "On a quashing, a default brings a contempt petition back to the same court; on a plea bargain, an application to recover the compensation as a fine. You address the court on the day it is listed, and it gives time, a last chance to pay, or a warrant.",
      ],
      ["New", "On compounding, the acquittal stands: a default goes to a suit on the deed in a civil court, not back to this case."],
      [
        "New",
        "The payments, day by day, in the courtroom, and where they stand in My Cases and on the case file. Emails tell you what happened.",
      ],
      [
        "Fixed",
        "A missed payment after quashing no longer offers to recall the order and revive the FIR, which the law doesn’t allow. The remedy is a contempt petition.",
      ],
    ],
  },
  {
    id: "v5-3",
    title: "5.2–5.4 · 21–24 October 2026",
    lede: "Settle a case out of court.",
    items: [
      [
        "New",
        "The settlement desk, from Case Prep. It shows how your case can be settled (quashing, compounding or plea bargaining, or why none is open) and lets you trade up to three offers with the opposing lawyer.",
      ],
      ["New", "Agreed terms become a compromise deed. Every party signs it by hand, then you file it with the court."],
      [
        "New",
        "The court hears a filed compromise in the courtroom, on the same record as the case. It questions the complainants, checks the deed, then grants, adjourns or refuses it. A granted compromise ends the case as settled, and its instalments are tracked, with remedies when one is missed.",
      ],
      ["New", "Ask the judge for time to settle, from the courtroom."],
      [
        "New",
        "A negotiation analysis: your score out of 100, the best deal the other side would likely have taken, and whether settling was the right call.",
      ],
      ["New", "Your negotiator rating on your profile."],
      ["New", "Settled cases in My Cases, with how each one ended, and a banner on the case file."],
      ["New", "Choose how settled cases count toward your win rate, in Settings → Courtroom AI."],
      ["New", "Counsel signs the petition when you choose a side, and the judge signs the verdict."],
      ["Changed", "The case analysis has In court and Negotiation tabs."],
      ["Changed", "The courtroom’s buttons sit beside the case title, leaving more room for the record."],
    ],
  },
  {
    id: "v5-1",
    title: "5.1 · 20 October 2026",
    lede: "The opposing lawyer can object too.",
    items: [
      [
        "New",
        "The opposing lawyer objects to your arguments and to your questions to a witness when there are grounds, and the judge rules at once. A sustained objection strikes your argument, so make another, or withdraws your question, so ask another.",
      ],
      ["Changed", "Objections and rulings, yours or the other side’s, appear the moment they happen."],
      ["Changed", "“Judgment delivered” appears in the record once the court has finished deliberating."],
      ["Changed", "The witness stand keeps the newest question and answer in view."],
      [
        "Fixed",
        "You can scroll back through the record while the opposing lawyer replies. It follows new text again once you scroll to the end.",
      ],
      ["Fixed", "A withdrawn question no longer shows the witness as still answering."],
    ],
  },
  {
    id: "v5-0",
    title: "5.0 · 18–19 October 2026",
    lede: "Reminders, an Android app, and a fuller case file.",
    items: [
      ["New", "Hearing reminders. When an adjourned case has waited 7 days for your next argument, we email you once."],
      ["New", "Product updates by email, about once a month. Off unless you turn it on in Settings → Notifications."],
      ["New", "Every optional email has a one-click unsubscribe link."],
      [
        "New",
        "The case file has a Prayer section with the relief sought and the verification, and annexures the petition mentions appear under Evidence.",
      ],
      ["New", "An Android app, downloaded straight from the Install button on the website."],
      [
        "Changed",
        "Deleted accounts are erased automatically 30 days after deletion, with a reminder email three days before. Deleting a case for good also removes its evidence images.",
      ],
      ["Changed", "Writing to us without signing in includes a quick robot check by Cloudflare Turnstile."],
      ["Changed", "Parties in Case Prep and witnesses on the stand answer with their own AI models."],
      ["Changed", "A new app icon."],
      ["Fixed", "A sustained objection no longer fails with an error."],
    ],
  },
  {
    id: "v4-10",
    title: "4.10 · 7–17 October 2026",
    lede: "A full redesign of the site in the courtroom theme.",
    items: [
      [
        "New",
        "Objections in the courtroom. Object to the opposing lawyer’s latest argument or question, give your grounds, and the judge sustains or overrules it.",
      ],
      ["New", "A 3D courtroom on the home page, with a simpler version for devices without WebGL."],
      ["New", "Pin exhibits to an argument. They appear under your entry in the record."],
      ["New", "Voice input for arguments, using your browser’s speech recognition."],
      ["New", "Dark and light themes, or match your device. Switch from the header, the menu or Settings."],
      [
        "New",
        "Account & security in Settings: change your password, see and sign out signed-in devices, connect Google, download your data and delete your account.",
      ],
      ["New", "Account recovery. Deleted accounts are kept for 30 days, and you can ask for yours back through the contact page."],
      ["New", "Email notification settings, and a forgotten-password flow on the sign-in page."],
      ["New", "The contact page works without signing in."],
      ["New", "A System status page, Help & FAQ, Cookie Policy, Accessibility and this changelog, linked from every footer."],
      ["New", "An offline notice, and actions that pause instead of losing what you typed."],
      ["Changed", "The case file reads as an indexed document, with the parties, facts, charges, evidence and issues for the court."],
      ["Changed", "Case Prep: party background in the middle and the interview on the right, with an exhibit viewer."],
      ["Changed", "Courtroom: the record reads as a numbered transcript, and each witness examination folds into one entry."],
      [
        "Changed",
        "My Cases: search, status filters, sorting and selecting several cases at once. Archive: restore with undo, and empty the whole archive at once.",
      ],
      ["Changed", "New case: pick from common BNS sections or type your own. The number of sections is worked out for you."],
      [
        "Changed",
        "Profile: your record, stats and recent cases on one page, with a panel for editing your details and photo. Settings: all options in one place with a single save button.",
      ],
      ["Changed", "Shorter sign-up: name, email, password and an 18+ confirmation. The sign-in and sign-up pages fit on one screen."],
      ["Changed", "An AI disclaimer under every verdict and in the footer."],
      ["Fixed", "Signing in with Google takes a second or two, and the other sign-in buttons wait while it runs."],
      ["Removed", "Phone number, gender and date of birth from sign-up."],
    ],
  },
  {
    id: "v4-9",
    title: "4.9 · 30 September – 4 October 2026",
    lede: "Your record, and steadier evidence images.",
    items: [
      ["New", "Win rate on your profile, with a setting for how partial wins count."],
      ["Changed", "Evidence images use newer image models."],
      ["Changed", "A faster, more reliable connection to the database."],
      ["Fixed", "Problems during witness examination."],
    ],
  },
  {
    id: "v4-8",
    title: "4.8 · 27–30 September 2026",
    lede: "A smarter opposing lawyer and a sturdier service.",
    items: [
      ["New", "The AI lawyer confers privately with its own clients before the hearing and during adjournments."],
      ["New", "Case numbers (CNR) in the eCourts format."],
      ["New", "Use the courtroom from more than one device, with one device running the hearing at a time."],
      ["Changed", "Every AI prompt rewritten, and the case memory finds the right details more often."],
      ["Changed", "A clear message when the AI can’t answer, and the site stays responsive while it works."],
      ["Changed", "Email addresses are matched without regard to capital letters."],
      ["Changed", "Safer sign-in codes, password rules and limits on repeated attempts."],
      ["Fixed", "Security hardening across the site and the server."],
    ],
  },
  {
    id: "v4-7",
    title: "4.7 · May – July 2026",
    lede: "Case memory and pictures of the evidence.",
    items: [
      [
        "New",
        "Case memory: the AI recalls the facts, chats and record of your case when it argues and rules, with a setting to turn it off.",
      ],
      ["New", "Evidence images, generated for visual exhibits such as scenes and objects."],
      ["New", "The AI lawyer decides for itself when to call a witness."],
      ["New", "A profile photo editor with cropping and zoom."],
      ["Changed", "Each AI role (drafting, lawyer, judge) runs on a model chosen for it."],
    ],
  },
  {
    id: "v4-3",
    title: "4.3–4.6 · April 2026",
    lede: "AI Courtroom on your phone.",
    items: [
      ["New", "Install AI Courtroom as an app from your browser, with offline support."],
      ["New", "An Android app download."],
      ["New", "Sign in with Google on the web and in the app."],
      ["New", "Case Prep, with the evidence alongside the parties."],
      ["Changed", "Layouts reworked for phones and tablets."],
    ],
  },
  {
    id: "v4-0",
    title: "4.0–4.2 · February – April 2026",
    lede: "Witnesses take the stand.",
    items: [
      ["New", "Call witnesses and examine them in the courtroom."],
      ["New", "Case numbers that look like real CNR numbers."],
      ["Changed", "A redesigned site with smoother scrolling."],
      ["Fixed", "Calling witnesses, and sending messages from the contact page."],
    ],
  },
  {
    id: "v3",
    title: "3.0–3.7 · December 2025 – January 2026",
    lede: "Parties, profiles and policies.",
    items: [
      ["New", "Parties involved: meet and talk to the people in your case before the hearing."],
      ["New", "Profile photos and a redesigned profile page."],
      ["New", "Your location on your profile."],
      ["New", "Cookie consent with four categories."],
      ["New", "About page, Privacy Policy and Terms of Service, published January 2026."],
      ["Changed", "Loading screens on every page, and faster page loads."],
      ["Changed", "Better search-engine listings."],
      ["Fixed", "Form accessibility warnings."],
    ],
  },
  {
    id: "v2",
    title: "2.0–2.3 · August – December 2025",
    lede: "AI Courtroom goes live on the web.",
    items: [
      ["New", "The website went live on 9 August 2025."],
      ["New", "A limit on how many cases you can generate."],
      ["New", "Sign in with Google."],
      ["Changed", "Registration confirms your email with a one-time code."],
      ["Changed", "Better case-generation prompts, and a refreshed look."],
      ["Fixed", "Choosing to argue for the plaintiff or the defendant."],
    ],
  },
  {
    id: "v1",
    title: "1.0 and earlier · January – August 2025",
    lede: "The first courtroom.",
    items: [
      ["New", "Accounts with email and password (January 2025)."],
      ["New", "Case generation from BNS sections, and an AI lawyer to argue against (May 2025)."],
      ["New", "Version 1.0, the first complete courtroom, with dark mode (28 May 2025)."],
      ["New", "Case analysis after the verdict (July 2025)."],
    ],
  },
];

export default function ChangelogPage() {
  return (
    <DocPage
      current="/changelog"
      kicker="The record · Changelog"
      title="CHANGELOG"
      lede="What’s new and what’s changed in AI Courtroom."
      updated="24 October 2026"
      form={["Form L-9", "Record of proceedings"]}
      label="Changelog"
      index={RELEASES.map((r) => [r.id, r.title])}
    >
      {RELEASES.map((r, i) => (
        <Sec key={r.id} id={r.id} n={`${roman(i + 1)}.`} title={r.title}>
          <p className={K.p}>{r.lede}</p>
          <ul className={K.bullets}>
            {r.items.map(([tag, text]) => (
              <li key={text} className={K.bulletRow}>
                <span className={TAG_CLASS[tag]}>{tag}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </Sec>
      ))}
    </DocPage>
  );
}
