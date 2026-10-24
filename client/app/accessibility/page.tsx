import type { Metadata } from "next";
import Link from "next/link";
import DocPage from "@/components/docs/doc-page";
import { K, Sec } from "@/components/docs/kit";

// Copy generated verbatim from the handoff's Accessibility.dc.html.

export const metadata: Metadata = {
  title: "Accessibility",
  description: "How AI Courtroom supports keyboard, screen reader and text-size needs, and how to report a barrier.",
};

export default function AccessibilityPage() {
  return (
    <DocPage
      current="/accessibility"
      kicker="Access to the court · Statement"
      title="ACCESSIBILITY"
      lede="We want everyone to be able to practise in AI Courtroom, whatever device or assistive technology they use."
      updated="24 October 2026"
      form={["Form X-3", "Statement on access"]}
      label="Accessibility"
      index={[
        ["goal", "Our goal"],
        ["done", "What we’ve done"],
        ["limits", "Known limitations"],
        ["feedback", "Feedback"],
      ]}
    >
      <Sec id="goal" n="I." title="Our goal">
        <p className={K.p}>
          We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. We haven’t had the site independently audited yet,
          so some parts may fall short.
        </p>
      </Sec>

      <Sec id="done" n="II." title="What we’ve done">
        <ul className={K.bullets}>
          {" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>
              Text size can be set to small, medium or large in{" "}
              <Link href="/settings" className={K.a}>
                Settings → Accessibility
              </Link>
              .
            </span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>
              Choose a dark or light theme, or match your device’s setting, from the header or{" "}
              <Link href="/settings" className={K.a}>
                Settings → Accessibility
              </Link>
              .
            </span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>Every page can be used with a keyboard, with a visible focus outline.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>Form fields have labels, and errors are announced and shown next to the field they relate to.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>Buttons and controls are at least 44 pixels tall on touch screens.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>Text is checked against its background for contrast.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>
              Animations across the site, including panel slides and the courtroom stamps, become simple fades or stop when your device is
              set to reduce motion.
            </span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>
              Dialogs and pop-ups, including exhibits and objections, close with Escape. The exhibit viewer in Case Prep also responds to
              the arrow keys.
            </span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>
              Arguments can be dictated with the microphone button instead of typed, where the browser supports speech recognition.
            </span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>New entries in the courtroom record and the interview transcript are announced to screen readers as they arrive.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>
              Signing a settlement deed takes a button, not drawing. Each signature is read out as “Signed” with the signer’s name, and
              appears at once when your device is set to reduce motion.
            </span>
          </li>{" "}
        </ul>
      </Sec>

      <Sec id="limits" n="III." title="Known limitations">
        <ul className={K.bullets}>
          {" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>
              The 3D courtroom on the home page needs WebGL. If your device can’t show it, we show a simpler page with the same content.
            </span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>AI-generated cases and verdicts can be long and are not always written in plain language.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>Some decorative typography uses a typewriter-style font, which some readers may find harder to read at small sizes.</span>
          </li>{" "}
          <li className={K.bulletRow}>
            <span className={K.bullet} aria-hidden="true">
              —
            </span>
            <span>
              Voice input is not available in browsers without speech recognition, including Firefox. You can still type your arguments.
            </span>
          </li>{" "}
        </ul>
      </Sec>

      <Sec id="feedback" n="IV." title="Feedback">
        <p className={K.p}>
          If something gets in your way, tell us through the{" "}
          <Link href="/contact" className={K.a}>
            contact page
          </Link>{" "}
          and choose User Interface. Include the page and what you were trying to do.
        </p>
      </Sec>
    </DocPage>
  );
}
