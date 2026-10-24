import type { Metadata } from "next";
import Link from "next/link";
import AboutCta from "@/components/docs/about-cta";
import DocPage from "@/components/docs/doc-page";
import { K, Sec } from "@/components/docs/kit";

// Copy generated verbatim from the handoff's About.dc.html.
// "About the maker" (section V) is placeholder copy for the owner to replace.

export const metadata: Metadata = {
  title: "About",
  description: "What AI Courtroom is, how a simulated Indian court hearing works, and who built it.",
};

export default function AboutPage() {
  return (
    <DocPage
      current="/about"
      kicker="The court · About"
      title="ABOUT AI COURTROOM"
      lede="Bridging the gap between legal theory and practice through advanced Artificial Intelligence simulation."
      form={["Form A-0", "Statement of purpose"]}
      label="About"
      index={[
        ["what", "What it is"],
        ["how", "How it works"],
        ["features", "Features"],
        ["advice", "Not legal advice"],
        ["maker", "About the maker"],
      ]}
    >
      <Sec id="what" n="I." title="What it is">
        <p className={K.p}>
          AI Courtroom is an educational platform that simulates legal proceedings with AI. You get a case, take a side, and argue it before
          an AI judge, with AI playing the parties.
        </p>
        <p className={K.p}>It is designed specifically to help law students and enthusiasts practise argumentation.</p>
      </Sec>

      <Sec id="how" n="II." title="How it works">
        <div className={K.grid3}>
          <div className={K.card}>
            <span className={K.cardN}>I</span>
            <span className={K.cardT}>File a case</span>
            <span className={K.note}>
              Pick the sections of the Bharatiya Nyaya Sanhita you want to practise. The AI uses them to decide the type of case and drafts
              the facts, parties and summary.
            </span>
          </div>
          <div className={K.card}>
            <span className={K.cardN}>II</span>
            <span className={K.cardT}>Argue your side</span>
            <span className={K.note}>
              Take the plaintiff or the defence. Present your opening statement, question the AI-played parties and build your arguments.
            </span>
          </div>
          <div className={K.card}>
            <span className={K.cardN}>III</span>
            <span className={K.cardT}>Hear the verdict, or settle</span>
            <span className={K.note}>
              The AI judge delivers a verdict with its legal reasoning and feedback on your performance. Or settle the case where the law
              allows it, and see the settlement through to its last payment. Results count toward the win rate on your profile.
            </span>
          </div>
        </div>
      </Sec>

      <Sec id="features" n="III." title="Features">
        <div className={K.grid2}>
          <div className={K.feature}>
            <span className={K.featureT}>AI-powered parties</span>
            <span className={K.note}>Interact with realistic AI characters who have unique backstories and personalities.</span>
          </div>
          <div className={K.feature}>
            <span className={K.featureT}>Verdicts without the wait</span>
            <span className={K.note}>
              No waiting for weeks. The AI judge analyses your arguments against legal principles straight away.
            </span>
          </div>
          <div className={K.feature}>
            <span className={K.featureT}>Real-time chat</span>
            <span className={K.note}>Conduct investigations by chatting naturally with involved parties to uncover evidence.</span>
          </div>
          <div className={K.feature}>
            <span className={K.featureT}>Case memory</span>
            <span className={K.note}>
              Every case keeps a searchable memory, so the court can draw on what was said earlier in the proceedings.
            </span>
          </div>
          <div className={K.feature}>
            <span className={K.featureT}>Witnesses and objections</span>
            <span className={K.note}>
              Call parties to the stand, cross-examine the other side’s witnesses and object to the opposing lawyer. The AI judge rules on
              each objection.
            </span>
          </div>
          <div className={K.feature}>
            <span className={K.featureT}>Voice and evidence</span>
            <span className={K.note}>Dictate your arguments with the microphone and pin exhibits to the points you make.</span>
          </div>
          <div className={K.feature}>
            <span className={K.featureT}>Settle out of court</span>
            <span className={K.note}>
              Negotiate a compromise with the opposing lawyer where the law allows it, sign the deed, and have the court hear it on the same
              record as the case.
            </span>
          </div>
          <div className={K.feature}>
            <span className={K.featureT}>Payments that play out</span>
            <span className={K.note}>
              After a settlement the accused pays the instalments, as reliably as their background suggests. A default goes where the law
              sends it: notice first, then contempt, recovery as a fine or a civil suit.
            </span>
          </div>
        </div>
      </Sec>

      <Sec id="advice" n="IV." title="Not legal advice">
        <div className={K.callout}>
          <strong className={K.calloutT}>AI COURTROOM IS NOT A LAW FIRM AND DOES NOT PROVIDE LEGAL ADVICE.</strong>
          <span className={K.calloutD}>
            Cases are generated for practice, and AI responses can be wrong. Always consult a qualified advocate for real legal matters.
          </span>
        </div>
        <p className={K.p}>
          Read the full{" "}
          <Link href="/terms" className={K.a}>
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className={K.a}>
            Privacy Policy
          </Link>
          .
        </p>
      </Sec>

      <Sec id="maker" n="V." title="About the maker">
        <div className={K.makerRow}>
          {" "}
          <span className={K.makerIni} aria-hidden="true">
            PR
          </span>{" "}
          <div className={K.makerBody}>
            {" "}
            <span className={K.makerName}>Parth Rana</span> <span className={K.makerRole}>Designer and developer</span>{" "}
            <p className={K.p}>
              AI Courtroom is designed and built by one person. Write a few lines here about who you are and why you made it.
            </p>{" "}
            <div className={K.makerLinks}>
              {" "}
              <a href="https://github.com/ParthRana1023" target="_blank" rel="noopener noreferrer" className={K.btnOutline}>
                GitHub ↗
              </a>{" "}
              <Link href="/contact" className={K.btnDark}>
                Send a message to the maker →
              </Link>{" "}
            </div>{" "}
          </div>{" "}
        </div>
      </Sec>
      <AboutCta />
    </DocPage>
  );
}
