import type { Metadata } from "next";
import Link from "next/link";
import DocPage from "@/components/docs/doc-page";
import { K, Sec } from "@/components/docs/kit";

// Copy generated verbatim from the handoff's Cookie Policy.dc.html.

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "The cookies AI Courtroom uses, what each one does, and how to change your choice.",
};

export default function CookiePolicyPage() {
  return (
    <DocPage
      current="/cookies"
      kicker="Records · Cookies"
      title="COOKIE POLICY"
      lede="What cookies AI Courtroom uses, why, and how to change your choices."
      updated="24 October 2026"
      form={["Form R-8", "Schedule of cookies"]}
      label="Cookie Policy"
      index={[
        ["what", "What cookies are"],
        ["categories", "The cookies we use"],
        ["named", "Essential cookies in detail"],
        ["storage", "Settings stored in your browser"],
        ["choices", "Changing your choices"],
        ["updates", "Changes to this policy"],
        ["contact", "Contact us"],
      ]}
    >
      <Sec id="what" n="I." title="What cookies are">
        <p className={K.p}>
          Cookies are small text files a website stores in your browser. We also use your browser’s local storage for display settings. This
          policy covers both.
        </p>
      </Sec>

      <Sec id="categories" n="II." title="The cookies we use">
        <p className={K.p}>We group cookies into four categories. Only essential cookies are on by default.</p>
        <ul className={K.defs}>
          {" "}
          <li className={K.defRow}>
            <span className={K.term}>Essential · always on</span>
            <span className={K.note}>
              Necessary for the website to function properly. They enable core functionality such as authentication, security, and
              accessibility. These cookies cannot be disabled.
            </span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Functional</span>
            <span className={K.note}>
              Remember your preferences and provide enhanced functionality. Without these, some features may not work properly.
            </span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Analytics</span>
            <span className={K.note}>
              Help us understand how visitors interact with the website by collecting anonymous data, so we can improve the service.
            </span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>Marketing</span>
            <span className={K.note}>
              Used to measure the effectiveness of our marketing campaigns. They are only set if you allow them.
            </span>
          </li>{" "}
        </ul>
      </Sec>

      <Sec id="named" n="III." title="Essential cookies in detail">
        <ul className={K.defs}>
          {" "}
          <li className={K.defRow}>
            <span className={K.term}>token</span>
            <span className={K.note}>
              Keeps you signed in. Cleared after 1 day, or 7 days if you choose to keep yourself signed in, and at once when you sign out,
              which also ends that sign-in on our side.
            </span>
          </li>{" "}
          <li className={K.defRow}>
            <span className={K.term}>ai_courtroom_consent</span>
            <span className={K.note}>Remembers your cookie choices. Lasts 1 year.</span>
          </li>{" "}
        </ul>
        <p className={K.p}>
          Both are limited to this site (SameSite=Strict) and are only sent over secure connections when the site uses HTTPS.
        </p>
      </Sec>

      <Sec id="storage" n="IV." title="Settings stored in your browser">
        <p className={K.p}>
          Display and writing settings, such as text size, theme, Enter key behaviour and confirmation dialogs, are saved in your browser’s
          local storage so they apply on this device. Local storage also keeps a copy of your sign-in token for talking to our server
          (removed when you sign out), your choices on the home page and which sample cases it last showed, and which handwriting each
          signer uses on a case’s deed. Settings like case location, case memory and how partial wins count are saved to your account
          instead.
        </p>
        <p className={K.p}>
          Session storage, cleared when you close the tab, holds the details Google sends while you finish signing up with it, a check that
          the Google sign-in was started on this page, whether you’ve dismissed the app install prompt, and a random number that groups the
          error reports your browser sends us so we can tell one visit’s problems apart.
        </p>
        <p className={K.p}>
          When you write to us without signing in, the contact page loads Cloudflare Turnstile from challenges.cloudflare.com to check
          you’re not a robot. It runs in Cloudflare’s own frame and sets no cookies on our site.
        </p>
      </Sec>

      <Sec id="choices" n="V." title="Changing your choices">
        <p className={K.p}>
          You can accept all, reject all, or choose categories one by one in{" "}
          <Link href="/settings" className={K.a}>
            Settings → Privacy
          </Link>
          . When you turn a category off, we clear the cookies it set.
        </p>
        <p className={K.p}>
          You can also block or delete cookies in your browser settings. If you block essential cookies, you won’t be able to sign in.
        </p>
      </Sec>

      <Sec id="updates" n="VI." title="Changes to this policy">
        <p className={K.p}>When we change how we use cookies, we’ll update this page and ask for your consent again.</p>
      </Sec>

      <Sec id="contact" n="VII." title="Contact us">
        <p className={K.p}>
          Questions about cookies? Reach us through the{" "}
          <Link href="/contact" className={K.a}>
            contact page
          </Link>
          . See the{" "}
          <Link href="/privacy" className={K.a}>
            Privacy Policy
          </Link>{" "}
          for how we handle your data more broadly.
        </p>
      </Sec>
    </DocPage>
  );
}
