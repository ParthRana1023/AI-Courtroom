import type { Metadata } from "next";
import DocPage from "@/components/docs/doc-page";
import { K, Sec } from "@/components/docs/kit";

// Copy generated verbatim from the handoff's Changelog.dc.html.

export const metadata: Metadata = {
  title: "Changelog",
  description: "Every update to AI Courtroom, newest first.",
};

export default function ChangelogPage() {
  return (
    <DocPage
      current="/changelog"
      kicker="The record · Changelog"
      title="CHANGELOG"
      lede="What’s new and what’s changed in AI Courtroom."
      updated="6 October 2026"
      form={["Form L-9", "Record of proceedings"]}
      label="Changelog"
      index={[
        ["v21", "2.1 · 6 October 2026"],
        ["v2", "2.0 · October 2026"],
        ["v1", "Before October 2026"],
      ]}
    >
      <Sec id="v21" n="I." title="2.1 · 6 October 2026">
        <p className={K.p}>More ways to sign in, and a way back if you delete your account.</p>
        <ul className={K.bullets}>
          {" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>Sign up and sign in with a mobile number. We text you a six-digit code, so there’s no password.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>
              Connect Google to an existing account in Settings → Account & security. Phone accounts get the Google email as their account email.
            </span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>Account recovery. Deleted accounts are kept for 30 days, and you can ask for yours back through the contact page.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>The contact page works without signing in.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagFix}>Changed</span>
            <span>
              Your profile shows your email, phone number and date of birth. The email or phone number you signed up with can’t be edited there.
            </span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagFix}>Changed</span>
            <span>
              The sign-in and enrol pages fit on one screen. Google and phone sit side by side under the main button, and password rules appear when
              you focus the password field.
            </span>
          </li>{" "}
        </ul>
      </Sec>

      <Sec id="v2" n="II." title="2.0 · October 2026">
        <p className={K.p}>A full redesign of the site in the courtroom theme.</p>
        <ul className={K.bullets}>
          {" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>
              Objections in the courtroom. Object to the opposing lawyer’s latest argument or question, give your grounds, and the judge sustains or
              overrules it.
            </span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>Dark and light themes, or match your device. Switch from the header, the menu or Settings.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>Install AI Courtroom as an app from the header, the menu or Settings.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>
              Account & security in Settings: change your password, see and sign out signed-in devices, download your data and delete your account.
            </span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>Email notification settings, and a forgotten-password flow on the sign-in page.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>A System status page, linked from every footer.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagFix}>Changed</span>
            <span>Profile: your record, stats and recent cases on one page, with a panel for editing your details and photo.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagFix}>Changed</span>
            <span>An AI disclaimer under every verdict and in the footer.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>Voice input for arguments, using your browser’s speech recognition.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>Pin exhibits to an argument. They appear under your entry in the record.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>An offline notice, and actions that pause instead of losing what you typed.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagFix}>Changed</span>
            <span>Case Prep: party background in the middle and the interview on the right, with an exhibit viewer.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagFix}>Changed</span>
            <span>Courtroom: the record reads as a numbered transcript, and each witness examination folds into one entry.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>A 3D courtroom on the home page, with a simpler version for devices without WebGL.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>Help & FAQ, Cookie Policy, Accessibility and this changelog.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagFix}>Changed</span>
            <span>Shorter sign-up: name, email, password and an 18+ confirmation. Where you practise is asked before your first case.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagFix}>Changed</span>
            <span>New case: pick from common BNS sections or type your own. The number of sections is worked out for you.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagFix}>Changed</span>
            <span>My Cases: search, status filters, sorting, and selecting several cases at once.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagFix}>Changed</span>
            <span>Archive: restore with undo, and empty the whole archive at once.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagFix}>Changed</span>
            <span>Settings: all options in one place with a single save button.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagRed}>Removed</span>
            <span>Phone number, gender and date of birth from sign-up.</span>
          </li>{" "}
        </ul>
      </Sec>

      <Sec id="v1" n="III." title="Before October 2026">
        <ul className={K.bullets}>
          {" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>Case generation from BNS sections, with a limit on how many cases you can generate.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>Courtroom with AI-played parties and an AI judge.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>Case memory setting for the courtroom AI.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>Win rate on your profile, with a setting for how partial wins count.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>Cookie consent with four categories.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.tagNew}>New</span>
            <span>Privacy Policy and Terms of Service, published January 2026.</span>
          </li>{" "}
        </ul>
      </Sec>
    </DocPage>
  );
}
