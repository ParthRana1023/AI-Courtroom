import type { Metadata } from "next";
import Link from "next/link";
import DocPage from "@/components/docs/doc-page";
import { K, Sec } from "@/components/docs/kit";

// Copy generated verbatim from the handoff's Help and FAQ.dc.html.

export const metadata: Metadata = {
  title: "Help and FAQ",
  description: "Answers to common questions about cases, the courtroom, accounts and settings.",
};

export default function HelpPage() {
  return (
    <DocPage
      current="/help"
      kicker="Clerk’s desk · Help"
      title="HELP & FAQ"
      lede="How cases, verdicts and your win rate work, and answers to common questions."
      updated="6 October 2026"
      form={["Form H-1", "Questions put to the clerk"]}
      label="Help and FAQ"
      index={[
        ["start", "Getting started"],
        ["cases", "Cases"],
        ["court", "In the courtroom"],
        ["verdicts", "Verdicts and win rate"],
        ["account", "Account and privacy"],
        ["more", "Still stuck?"],
      ]}
    >
      <Sec id="start" n="I." title="Getting started">
        <div className={K.stack}>
          {" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>Do I need an account?</h3>
            <div className={K.faqA}>
              <span>Yes, to create and argue cases. You can read the About, Help and legal pages without one.</span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>Who can sign up?</h3>
            <div className={K.faqA}>
              <span>
                Anyone aged 18 or older. You can sign up with an email address, a mobile number or Google. With a mobile number there’s no password:
                we text you a six-digit code each time you sign in.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>Is this legal advice?</h3>
            <div className={K.faqA}>
              <span>
                No. AI Courtroom is a practice tool. Cases are fictional and AI responses can be wrong. For a real legal matter, consult a qualified
                advocate.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>Can I use a dark or light theme?</h3>
            <div className={K.faqA}>
              <span>
                Yes. Use the theme button in the header, or choose dark, light or match your device in{" "}
                <Link href="/settings" className={K.a}>
                  Settings → Accessibility
                </Link>
                . Case papers stay on paper either way.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>Can I install AI Courtroom as an app?</h3>
            <div className={K.faqA}>
              <span>
                Yes. Choose Install in the header, or Install the app in{" "}
                <Link href="/settings" className={K.a}>
                  Settings
                </Link>
                . The app opens from your home screen and loads faster.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>Is the service down?</h3>
            <div className={K.faqA}>
              <span>
                Check the{" "}
                <Link href="/status" className={K.a}>
                  System status
                </Link>{" "}
                page. If you lose your connection, the site tells you and keeps what you’ve typed until you’re back online.
              </span>
            </div>
          </div>{" "}
        </div>
      </Sec>

      <Sec id="cases" n="II." title="Cases">
        <div className={K.stack}>
          {" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>How is a case created?</h3>
            <div className={K.faqA}>
              <span>
                On{" "}
                <Link href="/cases/new" className={K.a}>
                  New case
                </Link>
                , add the sections of the Bharatiya Nyaya Sanhita you want to practise, such as 103 or 318. The AI uses them to decide the type of
                case and drafts the facts, the parties and a summary.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>How many cases can I generate?</h3>
            <div className={K.faqA}>
              <span>
                Case generation is limited to a set number of cases in each period. The New case page shows how many you have left, and when the next
                one is available if you’ve reached the limit.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>Can I choose where my cases are set?</h3>
            <div className={K.faqA}>
              <span>
                Yes. In{" "}
                <Link href="/settings" className={K.a}>
                  Settings → Case management
                </Link>
                , choose a random High Court, your own location, or a specific state.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>What do the case statuses mean?</h3>
            <div className={K.faqA}>
              <ul className={K.defs}>
                {" "}
                <li className={K.defRow}>
                  <span className={K.term}>Not started</span>
                  <span className={K.note}>The case has been generated but you haven’t begun.</span>
                </li>{" "}
                <li className={K.defRow}>
                  <span className={K.term}>Active</span>
                  <span className={K.note}>Proceedings are under way.</span>
                </li>{" "}
                <li className={K.defRow}>
                  <span className={K.term}>Adjourned</span>
                  <span className={K.note}>Proceedings are paused. Pick up where you left off.</span>
                </li>{" "}
                <li className={K.defRow}>
                  <span className={K.term}>Resolved</span>
                  <span className={K.note}>The judge has delivered a verdict.</span>
                </li>{" "}
              </ul>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>What’s the difference between archiving and deleting?</h3>
            <div className={K.faqA}>
              <span>
                Archiving moves a case out of My Cases into{" "}
                <Link href="/cases/archived" className={K.a}>
                  Archived
                </Link>
                , where you can restore it later. Deleting removes a case and all its data permanently.
              </span>
            </div>
          </div>{" "}
        </div>
      </Sec>

      <Sec id="court" n="III." title="In the courtroom">
        <div className={K.stack}>
          {" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>Which side do I argue?</h3>
            <div className={K.faqA}>
              <span>You take the plaintiff or the defence. The AI plays the other parties and the judge.</span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>What is case memory?</h3>
            <div className={K.faqA}>
              <span>
                Every case keeps a searchable memory. With “Use RAG for courtroom AI” on, the AI reads the most relevant parts of it. With it off, the
                AI reads the full case details and proceedings. Change this in{" "}
                <Link href="/settings" className={K.a}>
                  Settings → Courtroom AI
                </Link>
                .
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>How do I submit an argument?</h3>
            <div className={K.faqA}>
              <span>
                By default, Enter submits and Shift+Enter adds a new line. You can switch this in Settings so Enter adds a new line and Ctrl+Enter
                submits.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>How do witnesses work?</h3>
            <div className={K.faqA}>
              <span>
                Open the witness stand on the right of the courtroom and call any party. You question them first, then choose “No more questions” and
                the other side cross-examines. The AI can call witnesses of its own, and you can then cross-examine or dismiss them. Each examination
                folds into a single entry in the record.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>How do objections work?</h3>
            <div className={K.faqA}>
              <span>
                When the opposing lawyer makes an argument or asks a witness a question, an Object button appears on that latest entry. Choose the
                grounds, explain your reason, and the judge rules. A sustained objection strikes the statement from the record or withdraws the
                question. An overruled one leaves it standing.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>Can I dictate instead of typing?</h3>
            <div className={K.faqA}>
              <span>
                Yes. Tap the microphone next to the argument box and speak. Your browser turns your speech into text in the box, so you can check it
                before you submit. Voice input needs microphone permission and a browser that supports speech recognition, such as Chrome or Edge.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>How do I refer to evidence?</h3>
            <div className={K.faqA}>
              <span>
                Use the paperclip next to the argument box to pin one or more exhibits to your argument. They appear under your entry in the record
                and open when clicked. You can also turn a witness’s answer into a new exhibit with “Extract as evidence”.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>When can I adjourn or give my closing statement?</h3>
            <div className={K.faqA}>
              <span>
                You can adjourn after two arguments in a session and resume later. After three arguments you can deliver a closing statement, which
                ends the hearing and leads to the verdict.
              </span>
            </div>
          </div>{" "}
        </div>
      </Sec>

      <Sec id="verdicts" n="IV." title="Verdicts and win rate">
        <div className={K.stack}>
          {" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>How is the verdict decided?</h3>
            <div className={K.faqA}>
              <span>
                When proceedings end, the AI judge weighs the arguments from both sides against the relevant law. It gives a verdict with its
                reasoning and feedback on your performance.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>What outcomes are there?</h3>
            <div className={K.faqA}>
              <span>A case can be won, lost or partly won, for example a petition allowed only in part.</span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>How is my win rate calculated?</h3>
            <div className={K.faqA}>
              <p className={K.p}>
                Your win rate is your wins divided by your resolved cases. You choose how partly won cases count in{" "}
                <Link href="/settings" className={K.a}>
                  Settings → Courtroom AI
                </Link>
                . For example, with 6 wins, 3 losses and 2 partial wins:
              </p>
              <ul className={K.defs}>
                {" "}
                <li className={K.defRow}>
                  <span className={K.term}>As a loss</span>
                  <span className={K.note}>6 ÷ 11 cases = 55%</span>
                </li>{" "}
                <li className={K.defRow}>
                  <span className={K.term}>As half a win</span>
                  <span className={K.note}>(6 + 2 × 0.5) ÷ 11 cases = 64%</span>
                </li>{" "}
                <li className={K.defRow}>
                  <span className={K.term}>Left out</span>
                  <span className={K.note}>6 ÷ 9 cases = 67%</span>
                </li>{" "}
              </ul>
            </div>
          </div>{" "}
        </div>
      </Sec>

      <Sec id="account" n="V." title="Account and privacy">
        <div className={K.stack}>
          {" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>What does the AI see?</h3>
            <div className={K.faqA}>
              <span>
                The content of your cases, including your arguments, is sent to AI model providers to generate responses. See the{" "}
                <Link href="/privacy" className={K.a}>
                  Privacy Policy
                </Link>
                .
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>How do I change cookie settings?</h3>
            <div className={K.faqA}>
              <span>
                In{" "}
                <Link href="/settings" className={K.a}>
                  Settings → Privacy
                </Link>
                , or read the{" "}
                <Link href="/cookies" className={K.a}>
                  Cookie Policy
                </Link>
                .
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>How do I delete my account?</h3>
            <div className={K.faqA}>
              <span>
                In{" "}
                <Link href="/settings" className={K.a}>
                  Settings → Account & security
                </Link>
                , choose Delete account and type DELETE to confirm. Your profile and every case, including archived ones, are removed and you’re
                signed out on every device. Download your data first if you want a copy.
              </span>
              <span>
                Changed your mind? We keep deleted accounts for 30 days.{" "}
                <Link href="/contact?cat=account_recovery" className={K.a}>
                  Contact us
                </Link>{" "}
                and choose Account Recovery within that time and we’ll restore it with all your cases.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>Can I connect Google to my account?</h3>
            <div className={K.faqA}>
              <span>
                Yes. In{" "}
                <Link href="/settings" className={K.a}>
                  Settings → Account & security
                </Link>
                , choose Connect Google. If you signed up with a phone number, the Google email becomes your account email. If the Google email is
                different from the one on your account, we ask which one to keep for sign-in codes and replies.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>Can I change my email or phone number?</h3>
            <div className={K.faqA}>
              <span>
                The email or phone number you signed up with can’t be changed in your profile. If you signed up with a phone number, you can add an
                email in{" "}
                <Link href="/profile" className={K.a}>
                  your profile
                </Link>
                . If you signed up with email or Google, you can add a phone number there.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>I forgot my password. What now?</h3>
            <div className={K.faqA}>
              <span>
                On the{" "}
                <Link href="/login" className={K.a}>
                  sign-in page
                </Link>
                , choose “Forgot password?” and we’ll email you a code to set a new one. If you’re signed in, you can change it in{" "}
                <Link href="/settings" className={K.a}>
                  Settings → Account & security
                </Link>
                .
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>I don’t recognise a signed-in device.</h3>
            <div className={K.faqA}>
              <span>
                Go to{" "}
                <Link href="/settings" className={K.a}>
                  Settings → Account & security
                </Link>
                , sign out other devices, then change your password.
              </span>
            </div>
          </div>{" "}
          <div className={K.faq}>
            <h3 className={K.faqQ}>Which emails will I get?</h3>
            <div className={K.faqA}>
              <span>
                Security alerts about new sign-ins, password changes and account deletion are always sent. Other email notifications can be turned on
                or off in{" "}
                <Link href="/settings" className={K.a}>
                  Settings → Notifications
                </Link>
                . Every email has an unsubscribe link.
              </span>
            </div>
          </div>{" "}
        </div>
      </Sec>

      <Sec id="more" n="VI." title="Still stuck?">
        <p className={K.p}>
          Send a message through the{" "}
          <Link href="/contact" className={K.a}>
            contact page
          </Link>
          . You don’t need to be signed in. Choose the closest category so it reaches the right place.
        </p>
      </Sec>
    </DocPage>
  );
}
