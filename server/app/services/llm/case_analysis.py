from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.logging_config import get_logger, log_execution_time
from app.utils.llm import (
    SIDES_RULE,
    UNTRUSTED_TEXT_RULE,
    LLMGenerationError,
    get_llm,
    numbered,
    pick_case_context,
    strip_thinking,
    tagged,
)

logger = get_logger(__name__)

OUTCOME_TEXT = {
    "won": "WON - the verdict favours the user's side.",
    "lost": "LOST - the verdict favours the opposing side.",
    "partial": "PARTLY SUCCEEDED - the verdict went partly each way.",
}
NO_OUTCOME_TEXT = (
    "NOT DECIDED - describe how the verdict's orders affect the user without "
    "calling it a win or a loss."
)


class CaseAnalysisService:
    @staticmethod
    @log_execution_time(logger, "case_analysis_llm")
    async def analyze_case(
        defendant_args: list[str],
        plaintiff_args: list[str] | None = None,
        case_details: str | None = None,
        title: str | None = None,
        judges_verdict: str | None = None,
        user_role: str | None = None,
        ai_role: str | None = None,
        rag_context: str | None = None,
        party_conferences: str | None = None,
        witness_examinations: str | None = None,
        outcome: str | None = None,
    ) -> str:
        """Uses LLM to analyze the user's arguments and provides suggestions for improvement.
        :param defendant_args: List of arguments presented by the user.
        :param plaintiff_args: List of arguments from the opponent.
        :param case_details: Details of the case.
        :param title: Title of the case.
        :param judges_verdict: The verdict given by the judge.
        :param outcome: "won", "lost" or "partial", already decided by the
            outcome classifier; None when it could not be decided.
        :return: Markdown with Outcome, Reasoning, Mistakes and Suggestions sections.
        """
        logger.debug(
            "Case analysis started",
            extra={
                "title": title,
                "defendant_args_count": len(defendant_args) if defendant_args else 0,
                "plaintiff_args_count": len(plaintiff_args) if plaintiff_args else 0,
            },
        )

        # Nothing the user did to review
        if not (
            defendant_args
            or plaintiff_args
            or party_conferences
            or witness_examinations
        ):
            logger.warning("No arguments provided for analysis")
            return "No analysis generated."

        case_context = pick_case_context(rag_context, case_details)

        prompt = """
            You are a senior Indian criminal-law advocate mentoring a junior who has just argued this case in a simulated High Court hearing. Review their work honestly and constructively. Address the junior directly as "you".

            CASE TITLE: {title}
            RELEVANT CASE CONTEXT: {case_context}

            USER'S ROLE: {user_role}
            AI'S ROLE: {ai_role}
            {sides_rule}
            
            {untrusted_text_rule}

            DEFENDANT'S ARGUMENTS:
            {defendant_args}

            PLAINTIFF'S ARGUMENTS:
            {plaintiff_args} 

            USER'S PRIVATE CONFERENCES WITH THE PARTIES (before and between hearings;
            the court and the opposing counsel never saw these):
            {party_conferences}

            WITNESS EXAMINATIONS (every question is labelled with who asked it):
            {witness_examinations}

            JUDGE'S VERDICT: {judges_verdict}

            OUTCOME FOR THE USER: {outcome}
            The outcome has already been decided from the verdict's operative
            orders. Do not decide it again or contradict it.

            Required sections for your analysis:

            Return your response as a well-structured Markdown document with the following sections:
            
            ### Outcome
            State the outcome given above in one line, naming the operative order it rests on.

            ### Reasoning
            Explain the outcome from the verdict's own reasoning. Say how far it was decided by the law and the record (the case file and evidence) and how far by the advocacy on each side, so the user knows whether better arguing could have changed it.

            Review EVERYTHING the user did, not only their arguments:
            - Arguments: each argument the user made in court.
            - Client conferences: the questions the user asked the parties in private.
              Note what they failed to ask, and facts they learned but never used in court.
            - Witness examinations: each question the user put to a witness, in
              examination-in-chief and cross-examination. Note leading or weak
              questions, missed openings and contradictions they did not press.
            Skip a group only if the user did nothing of that kind, and say so.

            ### Mistakes
            Use the sub-headings **Arguments**, **Client conferences** and **Witness examinations**.
            Under each, list the user's mistakes or weaknesses as bullets, quoting or
            naming the specific argument, message or question.

            ### Suggestions
            Use the same three sub-headings. Under each, give concrete, actionable
            improvements as bullets, including better questions or arguments the user
            could have used.
        """
        analysis_prompt = ChatPromptTemplate.from_messages([("human", prompt)])

        try:
            chain = analysis_prompt | get_llm("analyzer") | StrOutputParser()
            logger.debug("Invoking LLM for case analysis")
            response = await chain.ainvoke(
                {
                    "title": title,
                    "case_context": case_context,
                    "user_role": (user_role.upper() if user_role else "UNKNOWN"),
                    "ai_role": (ai_role.upper() if ai_role else "UNKNOWN"),
                    "defendant_args": tagged(
                        numbered(defendant_args or []), "respondent_arguments"
                    ),
                    "plaintiff_args": tagged(
                        numbered(plaintiff_args or []), "petitioner_arguments"
                    ),
                    "party_conferences": tagged(
                        party_conferences or "The user held no conferences.",
                        "party_conferences",
                    ),
                    "witness_examinations": tagged(
                        witness_examinations or "No witnesses were examined.",
                        "witness_examinations",
                    ),
                    "untrusted_text_rule": UNTRUSTED_TEXT_RULE,
                    "sides_rule": SIDES_RULE,
                    "judges_verdict": judges_verdict,
                    "outcome": OUTCOME_TEXT.get(outcome or "", NO_OUTCOME_TEXT),
                }
            )

            response = strip_thinking(response)

            logger.info(
                "Case analysis completed successfully",
                extra={"response_length": len(response)},
            )
            return response

        except Exception as e:
            logger.exception("Error during LLM analysis")
            raise LLMGenerationError(f"Internal error during analysis: {e}") from e
