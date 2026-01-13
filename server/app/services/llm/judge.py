# app/services/llm/judge.py
import time
import re
from typing import List
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.utils.llm import llm
from app.logging_config import get_logger

logger = get_logger(__name__)

async def generate_verdict(plaintiff_arguments: List[str], defendant_arguments: List[str], case_details: str = None, title: str = None) -> str:
    try:
        logger.info(f"Generating verdict for case: {title[:50] if title else 'untitled'}...")
        logger.debug(f"Plaintiff arguments: {len(plaintiff_arguments)}, Defendant arguments: {len(defendant_arguments)}")
        
        judge_template = judge_template = """

            You are an impartial Indian Court judge. Draft a formal JUDGMENT in the style used by Indian High Courts / Supreme Court practice, following the rules below.

            FORMATTING RULES (must be followed exactly):
            - Use **BOLD UPPERCASE** for section headings (e.g., **FACTS**, **ISSUES**, etc.).
            - Headings must NOT be numbered.
            - Paragraphs under headings must be numbered **sequentially across the entire judgment** starting from 1 and continuing to the end; numbering must NOT restart in each section. EXCEPTION: the **FORMALITIES** section must NOT be numbered.
            - Use short, plain sentences; maintain a neutral, formal judicial tone.
            - Do NOT invent facts or actual case citations. If a precedent is needed, use a placeholder like [Cite: X v. Y, Year].
            - If any input data is missing, state it as: "Assumption: [text]".
            - **AVOID single- or one-sentence paragraphs.** Except for the narrowly permitted exceptions below, each numbered paragraph must contain at least **THREE** sentences that develop a single coherent idea.
            - **NO QUESTIONS:** Do not include any interrogative sentences or question marks ('?') anywhere in the judgment. Do not pose rhetorical questions. All sentences must be declarative or imperative as appropriate.

            DOCUMENT HEADER (include where available):
            - **CASE TITLE:** {title}
            - **COURT:** [Insert Court Name]
            - **CASE NO.:** [Insert if given]
            - **DATE OF JUDGMENT:** [DD Month YYYY]
            - **PARTIES:** [Petitioner(s) v. Respondent(s)]
            - **COUNSEL:** (list counsel who appeared)
            - If any header field is inferred or inconsistent across inputs, state: "Assumption: [explanation]".

            MANDATORY STRUCTURE (in this order). Each heading below must appear exactly as written (BOLD UPPERCASE):

            **FACTS**
            - Provide a concise, chronological recital of material facts relevant to the dispute: how the dispute arose, key dates, filings (FIR, plaint, petition), and procedural history up to the hearing. Record undisputed facts separately from contested facts. If evidence (exhibits, witnesses) is relied upon, identify them briefly.
            - If the factual material provided is sparse, combine related factual points into fewer numbered paragraphs so that each numbered paragraph contains at least THREE sentences. Do not create multiple short numbered paragraphs that cannot be developed.

            **ISSUES**
            - Frame the precise legal questions the Court must decide. Each issue must be phrased neutrally and directly tied to the pleadings and facts.
            - If there are only a small number of issues, combine sub-issues into a single well-developed numbered paragraph (minimum THREE sentences) rather than creating multiple short paragraphs.

            **PETITIONER'S ARGUMENTS**
            - Summarize the petitioner's contentions in numbered paragraphs. For each contention, identify the legal basis, primary factual points relied upon, evidence cited, and any precedents invoked (use placeholders for citations).
            - Combine arguments where necessary to ensure each numbered paragraph contains at least THREE sentences developing the contention fully.

            **RESPONDENT'S ARGUMENTS**
            - Summarize the respondent's contentions in numbered paragraphs. For each contention, identify the factual counterpoints, evidence relied upon, and legal authorities (placeholders if necessary).
            - Where respondent points are brief, combine them into fuller numbered paragraphs to meet the minimum sentence requirement.

            **ANALYSIS OF THE LAW**
            - State the relevant legal provisions and legal principles/rules the Court will apply (statutes, essential ingredients of the offence/claim, leading legal tests). For each provision/state rule, give a one-sentence plain-language explanation of its essential ingredients.
            - Where appropriate, reproduce only short, necessary extracts (≤ 25 words) from statutes or authorities — otherwise paraphrase.
            - Ensure each numbered paragraph in this section contains at least THREE sentences, combining discussion of closely related rules or authorities when needed.

            **COURT'S REASONING**
            - Take each framed Issue in turn. For each Issue:
                - Recite the relevant facts (from FACTS) that bear on this Issue.
                - Apply the legal rule(s) to those facts step-by-step.
                - Address the principal arguments of both parties and explain why each argument succeeds or fails.
                - Distinguish or explain precedents where needed; use placeholders for full citations.
                - Make findings of fact where the evidence requires. If credibility of witnesses is relevant, explain reasons for accepting or rejecting testimony.
            - If the material for any subpoint is brief, synthesize related points into a single, well-developed numbered paragraph (minimum THREE sentences) rather than multiple short paragraphs.
            - Throughout this section, use only declarative sentences and avoid any interrogative phrasing.

            **FINDINGS / DECISION ON ISSUES**
            - For each Issue, record a short, conclusive finding. Single-line answers are permitted in this section (for example, "Issue 1: Answered in the affirmative.") and may be a single sentence. If more explanation is needed, provide it in a separate numbered paragraph of at least THREE sentences immediately following the concise finding.

            **CONCLUSION**
            - State the overall outcome (petition allowed / dismissed / partly allowed). Summarize principal reasons leading to this outcome in one or two numbered paragraphs. Each such paragraph must contain at least THREE sentences unless it is a single, very brief recapitulation line permitted for clarity.
            - State the operative relief (e.g., FIR quashed in relation to sections X and Y; injunction granted; decree as prayed; costs awarded to [party]) and describe the rationale in a developed paragraph of at least THREE sentences.

            **ORDER**
            - Give specific, precise, and practicable directions the parties / trial court / investigating agency must follow (timelines if necessary).
            - State whether costs are awarded and the quantum (if any).
            - If further proceedings are ordered (e.g., remand for trial), give clear instructions to the lower forum.
            - Very short operative commands (single sentence) are permitted only where clarity requires concision. Otherwise each numbered paragraph in this section should contain at least THREE sentences. If operative directions are brief, combine them into a single numbered paragraph that meets the minimum sentence rule.

            **FORMALITIES**
            - Do not number paragraphs in this section. Do not include any question marks in this section.
            - State place and date of pronouncement in plain declarative sentences (no numbering).
            - Provide judge's signature line (you may auto-generate a judge name where required) in an unnumbered block.
            - Record counsel who appeared for both parties (auto-generate names if none provided) in unnumbered lines.
            - If assumptions were made about any metadata (dates, counsel), list them as unnumbered "Assumption: ..." lines here.

            ADDITIONAL STYLE INSTRUCTIONS
            - Do not include heading titles. Just the corresponding paragraphs.
            - Maintain continuous paragraph numbering across the entire judgment (e.g., 1, 2, 3, ... to the end), except do NOT number the FORMALITIES section.
            - Use the FIRAC approach (Facts, Issues, Rule/Relevant Law, Analysis, Conclusion) as a guiding method.
            - When evidence is referenced, mention exhibit numbers, witness names or shorthand (PW-1, Ex.P1) exactly as given in input, otherwise state "Assumption: [evidence description]".
            - Do not invent dates, facts, or real precedents. Use placeholders for missing legal citations.
            - Combine brief or related points into single, well-developed numbered paragraphs rather than creating several short numbered paragraphs. Each numbered paragraph (except permitted single-line findings and very short operative commands) must have a minimum of TWO sentences.
            - Absolutely no question marks ('?') must appear anywhere in the judgment. Replace any intended interrogative phrasing with a declarative restatement.
            - If the input materially conflicts or is insufficient, state the conflict or insufficiency as an "Assumption: ..." while still producing combined paragraphs that meet the minimum sentence rule.

            INPUTS PROVIDED:
            Case Description: {case_details}
            Petitioner Arguments: {plaintiff_arguments}
            Respondent Arguments: {defendant_arguments}

            Now draft the judgment strictly following the above headings, sequential paragraph numbering across the entire document (except FORMALITIES), and Indian judicial style. Ensure the judgment is clear, logically reasoned, avoids any questions, combines paragraphs where necessary to meet the minimum sentence requirement, and contains the exact sections: FACTS; ISSUES; PETITIONER'S ARGUMENTS; RESPONDENT'S ARGUMENTS; ANALYSIS OF THE LAW; COURT'S REASONING; FINDINGS / DECISION ON ISSUES; CONCLUSION; ORDER; FORMALITIES.
            
        """

        judge_prompt = ChatPromptTemplate.from_messages([
            ("human", judge_template)
        ])

        judge_chain = judge_prompt | llm | StrOutputParser()

        start_time = time.perf_counter()
        verdict = judge_chain.invoke({
            "title": title or "No title provided",
            "case_details": case_details or "No case details provided",
            "plaintiff_arguments": plaintiff_arguments,
            "defendant_arguments": defendant_arguments,
        })
        duration_ms = (time.perf_counter() - start_time) * 1000

        verdict = re.sub(r"<think>.*?</think>", "", verdict, flags=re.DOTALL).strip()

        logger.info(f"Verdict generated in {duration_ms:.2f}ms, response length: {len(verdict)} chars")
        return verdict
        
    except Exception as e:
        logger.error(f"Error generating verdict: {str(e)}", exc_info=True)
        return "I apologize, but I'm unable to generate a verdict at this time. Please try again later."
