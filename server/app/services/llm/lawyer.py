# app/services/llm/lawyer.py
import time

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.logging_config import get_logger
from app.utils.llm import (
    CURRENT_LAW_RULE,
    SIDES_RULE,
    UNTRUSTED_TEXT_RULE,
    LLMGenerationError,
    get_llm,
    invoke_complete,
    pick_case_context,
    tagged,
)

logger = get_logger(__name__)


async def generate_counter_argument(
    user_input: str,
    ai_role: str | None = None,
    user_role: str | None = None,
    case_details: str | None = None,
    rag_context: str | None = None,
    history: str | None = None,
    evidence_context: str | None = None,
) -> str:
    try:
        logger.info(f"Generating counter argument for {ai_role}")

        case_context = pick_case_context(rag_context, case_details)

        # Use provided history or fallback to RAG context if history is not provided
        effective_history = tagged(history or "(No earlier arguments.)", "history")

        template = """
            You are an experienced, assertive Indian advocate appearing for the {ai_role} in a High Court hearing. Opposing counsel, for the {user_role}, is the user.
            Case context: {case_context}
            Structured evidence available in this case:
            {evidence_context}
            The most recent arguments in this hearing: {history}
            {untrusted_text_rule}
            Courtroom manners of Indian High Courts: address the judge as "My Lord" or "Your Lordship", refer to opposing counsel as "my learned friend", and speak in the first person as counsel ("I submit that ...").
            {sides_rule}
            {current_law_rule}
            Rely only on the case file, the listed evidence (cite exhibit references) and what has been said in court. Never invent facts, witnesses, exhibits or case law.
            Refer to the parties by name, not as "applicant" and "non-applicant" alone.
            Speak as you would in court: no headings, no labels such as "Counter Argument", and no questions to anyone at the end.
            Reply to opposing counsel's latest argument below. First meet their specific point: expose any gap, contradiction or unsupported claim, and if they state a fact that is not in the case file or evidence, point that out firmly. Then advance one or two fresh points for your client; keep other points in reserve for later rounds and do not repeat what you have already argued.
            Stay under 200 words.
        """

        prompt = ChatPromptTemplate.from_messages(
            [("human", template + "\n\nArgument to respond to:\n{user_input}")]
        )

        chain = prompt | get_llm("lawyer") | StrOutputParser()

        start_time = time.perf_counter()
        response = await invoke_complete(
            chain,
            {
                "ai_role": ai_role,
                "history": effective_history,
                "case_context": case_context,
                "evidence_context": evidence_context
                or "No structured evidence has been submitted.",
                "user_role": user_role,
                "sides_rule": SIDES_RULE,
                "current_law_rule": CURRENT_LAW_RULE,
                "user_input": tagged(user_input, "user_argument"),
                "untrusted_text_rule": UNTRUSTED_TEXT_RULE,
            },
            "counter argument",
        )
        duration_ms = (time.perf_counter() - start_time) * 1000

        logger.info(
            f"Counter argument generated in {duration_ms:.2f}ms, response length: {len(response)} chars"
        )
        return response
    except Exception as e:
        logger.exception("Error generating counter argument")
        raise LLMGenerationError("Failed to generate counter argument") from e


async def opening_statement(
    ai_role: str,
    case_details: str,
    user_role: str,
    rag_context: str | None = None,
    evidence_context: str | None = None,
) -> str:
    try:
        logger.info(f"Generating opening statement for {ai_role}")

        case_context = pick_case_context(rag_context, case_details)

        template = """
            You are an Indian advocate from the {ai_role}'s side, opening the hearing in a High Court. Opposing counsel, for the {user_role}, is the user.
            Case context: {case_context}
            Structured evidence available in this case:
            {evidence_context}
            Courtroom manners of Indian High Courts: address the judge as "My Lord" or "Your Lordship", refer to opposing counsel as "my learned friend", and speak in the first person as counsel ("I submit that ...").
            {sides_rule}
            {current_law_rule}
            Rely only on the case file, the listed evidence (cite exhibit references) and what has been said in court. Never invent facts, witnesses, exhibits or case law.
            Refer to the parties by name, not as "applicant" and "non-applicant" alone.
            Speak as you would in court: no headings, no labels such as "Counter Argument", and no questions to anyone at the end.
            Give a brief opening in under 250 words: what your client seeks, the heart of the case in a few sentences, and the two or three points and exhibits you will rely on. Do not argue every point now.
        """

        prompt = ChatPromptTemplate.from_messages([("human", template)])

        chain = prompt | get_llm("lawyer") | StrOutputParser()

        start_time = time.perf_counter()
        response = await invoke_complete(
            chain,
            {
                "ai_role": ai_role,
                "case_context": case_context,
                "evidence_context": evidence_context
                or "No structured evidence has been submitted.",
                "user_role": user_role,
                "sides_rule": SIDES_RULE,
                "current_law_rule": CURRENT_LAW_RULE,
            },
            "opening statement",
        )
        duration_ms = (time.perf_counter() - start_time) * 1000

        logger.info(
            f"Opening statement generated in {duration_ms:.2f}ms, response length: {len(response)} chars"
        )
        return response
    except Exception as e:
        logger.exception("Error generating opening statement")
        raise LLMGenerationError("Failed to generate opening statement") from e


async def closing_statement(
    ai_role: str,
    user_role: str,
    case_details: str | None = None,
    rag_context: str | None = None,
    history: str | None = None,
    evidence_context: str | None = None,
) -> str:
    try:
        logger.info(f"Generating closing statement for {ai_role}")

        closing_context = rag_context or (
            case_details[:6000]
            if case_details
            else history or "No closing context provided"
        )

        template = """
            You are an Indian advocate from the {ai_role}'s side, making your final submissions in a High Court. Opposing counsel, for the {user_role}, is the user.
            Case context and record: {closing_context}
            Structured evidence available in this case:
            {evidence_context}
            {untrusted_text_rule}
            Courtroom manners of Indian High Courts: address the judge as "My Lord" or "Your Lordship", refer to opposing counsel as "my learned friend", and speak in the first person as counsel ("I submit that ...").
            {sides_rule}
            {current_law_rule}
            Rely only on the case file, the listed evidence (cite exhibit references) and what has been said in court. Never invent facts, witnesses, exhibits or case law.
            Refer to the parties by name, not as "applicant" and "non-applicant" alone.
            Speak as you would in court: no headings, no labels such as "Counter Argument", and no questions to anyone at the end.
            In about 250 words: sum up your strongest points and the evidence and testimony that support them, answer the best point opposing counsel made, and point out any claim of theirs the record does not support. End with the relief you pray for, in the form "With these submissions, I pray that ...".
        """

        prompt = ChatPromptTemplate.from_messages([("human", template)])

        chain = prompt | get_llm("lawyer") | StrOutputParser()

        start_time = time.perf_counter()
        response = await invoke_complete(
            chain,
            {
                "ai_role": ai_role,
                "closing_context": closing_context,
                "untrusted_text_rule": UNTRUSTED_TEXT_RULE,
                "evidence_context": evidence_context
                or "No structured evidence has been submitted.",
                "user_role": user_role,
                "sides_rule": SIDES_RULE,
                "current_law_rule": CURRENT_LAW_RULE,
            },
            "closing statement",
        )
        duration_ms = (time.perf_counter() - start_time) * 1000

        logger.info(
            f"Closing statement generated in {duration_ms:.2f}ms, response length: {len(response)} chars"
        )
        return response
    except Exception as e:
        logger.exception("Error generating closing statement")
        raise LLMGenerationError("Failed to generate closing statement") from e
