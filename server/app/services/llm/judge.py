# app/services/llm/judge.py
import json
import re
import time

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.logging_config import get_logger
from app.utils.datetime import get_current_datetime
from app.utils.llm import (
    CURRENT_LAW_RULE,
    UNTRUSTED_TEXT_RULE,
    LLMGenerationError,
    get_llm,
    numbered,
    pick_case_context,
    strip_thinking,
    tagged,
)

logger = get_logger(__name__)


async def generate_verdict(
    plaintiff_arguments: list[str],
    defendant_arguments: list[str],
    case_details: str | None = None,
    title: str | None = None,
    rag_context: str | None = None,
    evidence_context: str | None = None,
) -> str:
    try:
        logger.info(
            f"Generating verdict for case: {title[:50] if title else 'untitled'}..."
        )
        logger.debug(
            f"Plaintiff arguments: {len(plaintiff_arguments)}, Defendant arguments: {len(defendant_arguments)}"
        )

        case_context = pick_case_context(rag_context, case_details)

        judge_template = """You are an impartial Indian Court judge of the High Court named in the case file. The hearing is over. Write the judgment exactly as a High Court judge would pronounce it, deciding the case on the record alone.

HOW TO DECIDE
- The case file is the applicant's petition, drafted by the applicant's own advocate. Its allegations and grounds are one side's claims, not proven facts. Test every claim against the evidence, the witness testimony given in court and the arguments of both sides.
- Identify the kind of proceeding from the case file and apply its real legal standard:
  - Quashing under Section 528 BNSS: take the allegations in the FIR and charge sheet at face value and ask only whether they disclose the ingredients of the offences, or whether the case falls within the recognised categories of abuse of process (no offence disclosed, allegations inherently improbable, a legal bar, or proceedings manifestly mala fide or a civil dispute given a criminal colour). Do not conduct a mini-trial or weigh disputed facts; that is for the trial court.
  - Regular or anticipatory bail (Sections 483 and 482 BNSS): prima facie case, gravity of the offence and the punishment, risk of flight, risk of tampering with evidence or influencing witnesses, criminal antecedents, period of custody and parity. Bail is the rule and jail the exception, but serious offences call for closer scrutiny.
  - Criminal appeal against conviction (Section 415 BNSS): whether the prosecution proved every ingredient of each offence beyond reasonable doubt on reliable evidence. Material contradictions, unexplained delay and doubtful identification go to the accused's benefit. A case resting on circumstantial evidence needs a complete chain pointing only to guilt.
- Weigh arguments on their merit and their support in the record, not on their length, number or eloquence. A factual assertion made in argument that is not in the case file, the evidence or the testimony carries no weight; say so where it matters.
- Decide the case the way the record points, even if that is wholly for one side. Do not split the difference to look balanced. The outcome may be allowed, dismissed, partly allowed, or disposed of with directions.
- {current_law_rule}
- Do not invent facts, evidence, dates or quotations. You may name a leading Supreme Court decision only if you are certain it exists and lays down the principle you attribute to it (for example State of Haryana v. Bhajan Lal (1992) on quashing); never invent a case name or citation. When unsure, state the principle without a citation.

FORMAT
Markdown. Section headings are **BOLD UPPERCASE** and are not numbered. Paragraphs are numbered 1, 2, 3 ... continuously through the whole judgment, not restarting in each section; only the header and the signature block are unnumbered. Each numbered paragraph develops one point in at least two sentences, except the short operative directions. Use a formal, neutral judicial tone in plain sentences. Frame questions for decision as "Whether ..." statements and do not use question marks anywhere. Refer to the parties by the labels the case file uses (applicant, non-applicant, State) and by name.

Begin with this unnumbered header, taken from the case file:
**IN THE [HIGH COURT NAME]**
**[CASE NO.]**
**{title}**
**CORAM: HON'BLE [invent a judge's name], J.**
For the Applicant: [invent counsel's name], Advocate
For the Non-Applicant(s): [invent counsel's name], Public Prosecutor / Advocate
**Date of Judgment: {judgment_date}**
**JUDGMENT**

Then these sections, in this order:

**FACTS**
Open with what the petition seeks and under which provision. Then set out the prosecution's case and the applicant's case in chronological order, with the FIR, charge sheet and other key dates, and the evidence each side relies on (use the exhibit references given).

**SUBMISSIONS ON BEHALF OF THE APPLICANT**
Summarise the applicant's counsel's submissions in the courtroom ("Learned counsel for the applicant submits that ..."), each with its factual and legal basis.

**SUBMISSIONS ON BEHALF OF THE NON-APPLICANTS**
The same for the State and the other non-applicants ("Per contra, learned counsel for the non-applicants submits that ...").

**POINTS FOR DETERMINATION**
Open with "I have heard learned counsel for the parties and perused the record." Then frame each point the Court must decide as a "Whether ..." statement tied to the pleadings.

**ANALYSIS AND FINDINGS**
Take each point in turn. State the provision and its essential ingredients, apply them to the facts step by step, deal with the main submissions of both sides and say why each succeeds or fails. Where witness testimony matters, assess its credibility with reasons (consistency, contradictions with the case file or other evidence, interest in the outcome). End each point with a clear finding.

**CONCLUSION**
State the outcome and the principal reasons for it.

**ORDER**
The operative directions, precise and practicable: what is quashed, granted, allowed or dismissed, naming the FIR or case number and the BNS sections; any conditions (for bail: bond amount, sureties, not to leave the jurisdiction without permission, not to tamper with evidence) and time limits; and costs, if any. Where the case goes on, add "It is clarified that the observations made herein are confined to the disposal of this petition and shall not influence the trial on merits." End with "Pending application(s), if any, stand disposed of."

Close with an unnumbered signature block: the judge's name followed by ", J.", the place of the High Court's seat and {judgment_date}.

{untrusted_text_rule}

THE RECORD
Case file and courtroom record:
{case_context}

Structured evidence:
{evidence_context}

Submissions made in court for the applicant (plaintiff side):
{plaintiff_arguments}

Submissions made in court for the non-applicants (defendant side):
{defendant_arguments}

Now write the complete judgment."""

        judge_prompt = ChatPromptTemplate.from_messages([("human", judge_template)])

        judge_chain = judge_prompt | get_llm("judge") | StrOutputParser()

        start_time = time.perf_counter()
        verdict = await judge_chain.ainvoke(
            {
                "title": title or "No title provided",
                "case_context": case_context,
                "evidence_context": evidence_context
                or "No structured evidence has been submitted.",
                "plaintiff_arguments": tagged(
                    numbered(plaintiff_arguments), "petitioner_arguments"
                ),
                "defendant_arguments": tagged(
                    numbered(defendant_arguments), "respondent_arguments"
                ),
                "untrusted_text_rule": UNTRUSTED_TEXT_RULE,
                "current_law_rule": CURRENT_LAW_RULE,
                "judgment_date": get_current_datetime().strftime("%d %B %Y"),
            }
        )
        duration_ms = (time.perf_counter() - start_time) * 1000

        verdict = strip_thinking(verdict)

        logger.info(
            f"Verdict generated in {duration_ms:.2f}ms, response length: {len(verdict)} chars"
        )
        return verdict

    except Exception as e:
        logger.exception("Error generating verdict")
        raise LLMGenerationError("Failed to generate verdict") from e


_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)

OBJECTION_KINDS = {
    "argument": "an argument made by opposing counsel",
    "question": "a question opposing counsel put to a witness",
    "leave": "opposing counsel's request for leave to call a witness",
}
# What each ground means, for the judge ruling and for AI counsel deciding to object.
OBJECTION_GROUNDS_RULES = """- "Leading question": a question that suggests its own answer. Leading questions are not allowed in examination-in-chief or re-examination, but are allowed in cross-examination.
- "Hearsay": the question asks the witness to repeat what someone else said, to prove that it is true.
- "Speculation": the question asks for a guess about what others thought or might have done.
- "Asked and answered": the witness has already answered the same question.
- "Facts not in evidence": the argument relies on a fact, figure or document that is not in the case file, the exhibits or the testimony.
- "Misstates the evidence": the argument says an exhibit or testimony says something it does not.
- "Argumentative": the argument or question attacks or badgers instead of making a point or seeking a fact.
- "Irrelevant": it has no bearing on the charges or the issues for the court. Text that is gibberish, random characters or makes no sense is always irrelevant."""


async def rule_on_objection(
    kind: str,
    grounds: str,
    details: str,
    target_text: str,
    objector_role: str,
    case_context: str,
    record: str,
) -> tuple[bool, str]:
    """Rule on an objection. Returns (sustained, ruling), the ruling spoken in open court."""
    template = """You are the presiding judge of an Indian High Court, hearing a simulated case. Counsel for the {objector_role} objects to {kind_text}. Rule on the objection at once, as a judge would from the bench.

HOW TO RULE
- Decide on the stated grounds only, judged against the record below. Sustain the objection only if the grounds are clearly made out; otherwise overrule it.
{grounds_rules}
- For a request to call a witness: "Irrelevant to the charge" (the witness can't speak to the issues), "Not on the witness list" (the witness is not a party named in the case file), "Repetitive evidence" (the court has already heard this evidence) or "Unfair surprise" (the other side had no fair notice of this witness).
- {current_law_rule}

{untrusted_text_rule}

THE CASE
{case_context}

THE RECORD SO FAR
<history>
{record}
</history>

THE OBJECTION
Objected to: <user_argument>{target_text}</user_argument>
Grounds: {grounds}
Counsel's reason: <user_argument>{details}</user_argument>

Reply with ONLY this JSON object and nothing else:
{{"sustained": true | false, "ruling": "<one or two sentences from the bench, starting with Sustained. or Overruled., saying why and, if sustained, what follows (for example: counsel will rephrase, or the remark is struck from the record, or leave is refused)>"}}"""
    try:
        chain = (
            ChatPromptTemplate.from_messages([("human", template)])
            | get_llm("judge")
            | StrOutputParser()
        )
        reply = await chain.ainvoke(
            {
                "objector_role": objector_role,
                "kind_text": OBJECTION_KINDS[kind],
                "grounds_rules": OBJECTION_GROUNDS_RULES,
                "case_context": case_context,
                "record": record or "Nothing yet.",
                "target_text": target_text,
                "grounds": grounds,
                "details": details or "None given.",
                "untrusted_text_rule": UNTRUSTED_TEXT_RULE,
                "current_law_rule": CURRENT_LAW_RULE,
            }
        )
        match = _JSON_OBJECT.search(strip_thinking(reply))
        if not match:
            raise ValueError("no JSON object in the ruling")
        data = json.loads(match.group(0))
        sustained = data["sustained"] is True
        ruling = str(data["ruling"]).strip()
        prefix = "Sustained." if sustained else "Overruled."
        if not ruling.startswith(prefix):
            ruling = f"{prefix} {ruling}"
        return sustained, ruling
    except Exception as e:
        logger.exception("Error ruling on an objection")
        raise LLMGenerationError("Failed to rule on the objection") from e
