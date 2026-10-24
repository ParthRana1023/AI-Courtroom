import type { Metadata } from "next";
import Link from "next/link";
import DocPage from "@/components/docs/doc-page";
import { K, Sec } from "@/components/docs/kit";

// Copy generated verbatim from the handoff's Privacy Policy.dc.html.

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal data AI Courtroom collects, how AI processes your cases, and your rights.",
};

export default function PrivacyPage() {
  return (
    <DocPage
      current="/privacy"
      kicker="Records · Privacy"
      title="PRIVACY POLICY"
      lede="We are committed to protecting your privacy and keeping your data safe. Here’s everything you need to know."
      updated="24 October 2026"
      form={["Form R-7", "Record of data held"]}
      label="Privacy Policy"
      index={[
        ["commit", "Our commitment to privacy"],
        ["collect", "Information we collect"],
        ["use", "How we use your information"],
        ["ai", "How AI processes your cases"],
        ["cookies", "Cookies"],
        ["keep", "Keeping and deleting your data"],
        ["security", "Data security"],
        ["contact", "Contact us"],
      ]}
    >
      <Sec id="commit" n="I." title="Our commitment to privacy">
        <p className={K.p}>
          At AI Courtroom, we are committed to protecting your privacy. This policy explains how we collect, use, and safeguard your
          personal information when you use our AI-powered legal simulation platform.
        </p>
      </Sec>

      <Sec id="collect" n="II." title="Information we collect">
        <p className={K.p}>We collect information that you provide directly to us, and some that is created as you use the platform:</p>
        <ul className={K.defs}>
          {" "}
          <li className={K.defRow}>
            <span className={K.term}>Account</span>
            <span className={K.note}>
              Your name, and either your email address and password or your mobile number. If you sign up with Google or connect Google
              later, we receive your name and email address from Google. If you signed up with a phone number, connecting Google makes that
              email your account email.
            </span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Age confirmation</span>
            <span className={K.note}>That you have confirmed you are 18 or older. We do not ask for your date of birth at sign-up.</span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Optional profile details</span>
            <span className={K.note}>
              A nickname, gender, date of birth, phone number and photo, if you add them in your profile. Your date of birth and phone
              number are never shown to anyone.
            </span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Seat of practice</span>
            <span className={K.note}>The country, state and city where you practise, used to set your cases in the right courts.</span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Messages to us</span>
            <span className={K.note}>
              What you send through the contact page, with the category you choose. If you aren’t signed in, also the name and email you
              give us for a reply. Account recovery requests include the email or phone number on the deleted account.
            </span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Case data</span>
            <span className={K.note}>
              The sections you choose, the cases generated for you, your arguments, your conversations with AI parties, the verdicts, and
              any settlement: the offers you trade, the deed, the hearing, and the simulated payments and proceedings that follow it.
            </span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Preferences</span>
            <span className={K.note}>
              Settings saved to your account, such as case location, case memory, how partial wins count and which emails you receive.
              Display settings such as text size and theme are stored in your browser.
            </span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Usage and device</span>
            <span className={K.note}>
              How you use the service, your browser type, operating system and IP address. We use these to list your signed-in devices in
              Settings, so you can sign out any you don’t recognise, and your IP address to limit sign-in attempts and codes.
            </span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Voice input</span>
            <span className={K.note}>
              If you use the microphone in the courtroom, your browser’s speech service turns your speech into text. We receive only the
              text you submit, not the audio. Some browsers process the audio on their provider’s servers, under that provider’s privacy
              policy.
            </span>
          </li>{" "}
        </ul>
      </Sec>

      <Sec id="use" n="III." title="How we use your information">
        <ul className={K.defs}>
          {" "}
          <li className={K.defRow}>
            <span className={K.term}>Running the courtroom</span>
            <span className={K.note}>Generating your cases, playing the parties and the judge, and delivering verdicts.</span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Your record</span>
            <span className={K.note}>Calculating your results and the win rate on your profile.</span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Personalisation</span>
            <span className={K.note}>Setting cases in the courts where you practise and remembering your preferences.</span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Communication</span>
            <span className={K.note}>
              Sending sign-in codes by email or text message, security alerts about new sign-ins and password changes, the email
              notifications you turn on (case ready, hearing reminders, which include what happens to a settlement’s payments, product
              updates), and replies to your messages. Every optional email has a one-click unsubscribe link; security alerts can’t be turned
              off.
            </span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Improvement and analytics</span>
            <span className={K.note}>Analysing usage patterns to improve our features.</span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Security</span>
            <span className={K.note}>
              Keeping the platform secure and preventing fraud and abuse. We count sign-in attempts and the codes we send by email address
              and by IP address, and the AI requests each account makes, to stop guessing and flooding. When you write to us without signing
              in, Cloudflare Turnstile checks that you’re not a robot; Cloudflare sees your IP address and browser signals for that check
              only.
            </span>
          </li>{" "}
        </ul>
      </Sec>

      <Sec id="ai" n="IV." title="How AI processes your cases">
        <p className={K.p}>
          To run the courtroom, the content of your cases, including your arguments, is sent to third-party AI model providers that generate
          the judge’s and the parties’ responses.
        </p>
        <p className={K.p}>
          Depending on your case memory setting in{" "}
          <Link href="/settings" className={K.a}>
            Settings
          </Link>
          , the AI receives either the most relevant parts of the case or the full case record.
        </p>
        <p className={K.p}>
          Objections you raise, the court’s rulings, witness testimony and any exhibits you pin to an argument are part of the case record
          and are processed the same way.
        </p>
        <p className={K.p}>
          Settlement offers are sent to the AI that plays opposing counsel, and to the analysis of your negotiation, but never to the judge
          deciding the case on its merits: as in a real court, talks are without prejudice. A filed deed and its hearing go on the record
          like any other proceeding. Each party’s background includes an AI-generated estimate of how reliably they would pay; it is kept on
          our servers to run the simulation and is left out of what we send to your device and of your data export.
        </p>
        <div className={K.callout}>
          <strong className={K.calloutT}>Keep real people out of your arguments.</strong>
          <span className={K.calloutD}>
            Cases are fictional. Please don’t include real personal details about yourself or anyone else in your arguments or messages.
          </span>
        </div>
      </Sec>

      <Sec id="cookies" n="V." title="Cookies">
        <p className={K.p}>We use cookies and similar technologies in four categories:</p>
        <ul className={K.defs}>
          {" "}
          <li className={K.defRow}>
            <span className={K.term}>Essential</span>
            <span className={K.note}>Required for the platform to work, such as keeping you signed in. Always on.</span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Functional</span>
            <span className={K.note}>Remember your settings and preferences.</span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Analytics</span>
            <span className={K.note}>Help us understand how you use the service.</span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Marketing</span>
            <span className={K.note}>Used only if you allow them.</span>
          </li>{" "}
        </ul>
        <p className={K.p}>
          Read the{" "}
          <Link href="/cookies" className={K.a}>
            Cookie Policy
          </Link>{" "}
          for the full list. You can change your choices at any time in{" "}
          <Link href="/settings" className={K.a}>
            Settings → Privacy
          </Link>
          .
        </p>
      </Sec>

      <Sec id="keep" n="VI." title="Keeping and deleting your data">
        <ul className={K.bullets}>
          {" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>Cases stay in My Cases until you archive them.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>Archived cases stay in the archive until you restore or delete them.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>Deleting a case permanently removes it and all of its data. This can’t be undone.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>
              Sign-in codes expire after 10 minutes and are deleted once used. The counts we keep to limit attempts and codes expire on
              their own, within a day at most. A device’s sign-in record lasts until it expires or you sign out.
            </span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>
              You can download a copy of your data, or delete your account and everything in it, in{" "}
              <Link href="/settings" className={K.a}>
                Settings → Account & security
              </Link>
              . Deleting your account signs you out on every device and removes your profile and every case, including archived ones, from
              the service. We keep the deleted account for 30 days so it can be recovered if you{" "}
              <Link href="/contact?cat=account_recovery" className={K.a}>
                contact us
              </Link>
              . Three days before the 30 days are up we email you a last reminder. After 30 days it’s erased for good: your profile, photos,
              cases and their AI memory. Messages you sent us are kept for our support records with your name and contact details removed.
            </span>
          </li>{" "}
        </ul>
      </Sec>

      <Sec id="security" n="VII." title="Data security">
        <p className={K.p}>
          Data travels to and from the service over encrypted connections. Passwords are stored only as Argon2 hashes, never as text. Each
          sign-in is recorded per device and ends when you sign out, sign other devices out or change your password, and links in our emails
          can’t be used to sign in. Our server logs mask email addresses and keep no phone numbers or passwords. Every change to the code is
          scanned for security issues with GitHub CodeQL. Your case data and personal information are accessed only by authorised personnel.
        </p>
      </Sec>

      <Sec id="contact" n="VIII." title="Contact us">
        <p className={K.p}>
          If you have questions about this privacy policy or how we handle your data, please contact us through our{" "}
          <Link href="/contact" className={K.a}>
            contact page
          </Link>
          .
        </p>
      </Sec>
    </DocPage>
  );
}
