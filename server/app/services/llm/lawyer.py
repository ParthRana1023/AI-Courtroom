# app/services/llm/lawyer.py
import json
import re
import time

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.logging_config import get_logger
from app.services.llm.judge import OBJECTION_GROUNDS_RULES
from app.utils.llm import (
    CURRENT_LAW_RULE,
    SIDES_RULE,
    UNTRUSTED_TEXT_RULE,
    LLMGenerationError,
    get_llm,
    invoke_complete,
    pick_case_context,
    strip_thinking,
    tagged,
)

logger = get_logger(__name__)
_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)


async def choose_testimony_to_log(
    ai_role: str, case_context: str, answers: list[str]
) -> int | None:
    """Which witness answer (index), if any, the AI lawyer logs as an exhibit.

    The user may log any answer as evidence; the AI may too, at most one per turn.
    Any failure means "none": logging is optional and never blocks the hearing.
    """
    numbered = "\n".join(f"{i + 1}. {a}" for i, a in enumerate(answers))
    template = """You are an Indian advocate for the {ai_role} in a High Court hearing.
Case context: {case_context}
{untrusted_text_rule}
A witness has given these answers in court:
<history>
{answers}
</history>
You may log one answer as an exhibit, so the court can rely on it later. Log one only if it is specific and clearly helps your client's case; otherwise log none.
Reply with ONLY this JSON object: {{"log": <the answer's number, or null>}}"""
    try:
        chain = (
            ChatPromptTemplate.from_messages([("human", template)])
            | get_llm("lawyer")
            | StrOutputParser()
        )
        reply = await chain.ainvoke(
            {
                "ai_role": ai_role,
                "case_context": case_context,
                "untrusted_text_rule": UNTRUSTED_TEXT_RULE,
                "answers": numbered,
            }
        )
        match = _JSON_OBJECT.search(strip_thinking(reply))
        pick = json.loads(match.group(0)).get("log") if match else None
        if type(pick) is int and 1 <= pick <= len(answers):  # not a bool
            return pick - 1
    except Exception:
        logger.exception("Error choosing testimony to log")
    return None


OBJECTABLE = {
    "argument": "the argument opposing counsel has just made",
    "question": "the question opposing counsel has just put to a witness",
}


async def consider_objection(
    kind: str,
    target_text: str,
    grounds: list[str],
    ai_role: str,
    case_context: str,
    record: str,
) -> tuple[str, str] | None:
    """(grounds, details) if the AI lawyer objects to the user's argument or question.

    Objecting is optional and never blocks the hearing: any failure, or grounds
    not on offer, means "no objection".
    """
    template = """OBJECTION DECISION
You are an experienced Indian advocate for the {ai_role} in a High Court hearing. Opposing counsel is the user. Decide whether to object to {kind_text}.

WHEN TO OBJECT
- Object only when one of the grounds below is clearly made out against the record. A good advocate objects rarely: most arguments and questions draw no objection. If in doubt, do not object.
- Never object just because the point hurts your client, or to argue your own case.
- Grounds you may use: {grounds}
{grounds_rules}

{untrusted_text_rule}

THE CASE
{case_context}

THE RECORD SO FAR
<history>
{record}
</history>

WHAT OPPOSING COUNSEL SAID
<user_argument>{target_text}</user_argument>

Reply with ONLY this JSON object and nothing else:
{{"object": false}}
or
{{"object": true, "grounds": "<one of the grounds above, exactly as written>", "details": "<one short sentence to the court, saying why>"}}"""
    try:
        chain = (
            ChatPromptTemplate.from_messages([("human", template)])
            | get_llm("lawyer")
            | StrOutputParser()
        )
        reply = await chain.ainvoke(
            {
                "ai_role": ai_role,
                "kind_text": OBJECTABLE[kind],
                "grounds": "; ".join(grounds),
                "grounds_rules": OBJECTION_GROUNDS_RULES,
                "untrusted_text_rule": UNTRUSTED_TEXT_RULE,
                "case_context": case_context,
                "record": record or "Nothing yet.",
                "target_text": target_text,
            }
        )
        match = _JSON_OBJECT.search(strip_thinking(reply))
        data = json.loads(match.group(0)) if match else {}
        if data.get("object") is True and data.get("grounds") in grounds:
            return data["grounds"], str(data.get("details") or "").strip()[:500]
    except Exception:
        logger.exception("Error deciding whether to object")
    return None


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
            Keep it between 50 and 150 words.
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
            Rely only on the case file. Never invent facts, witnesses, exhibits or case law. Evidence is presented later, during arguments: do not cite or present exhibits in the opening.
            Refer to the parties by name, not as "applicant" and "non-applicant" alone.
            Speak as you would in court: no headings, no labels such as "Counter Argument", and no questions to anyone at the end.
            Give a brief opening in under 200 words: what your client seeks, the heart of the case in a few sentences, and the two or three points you will make. Do not argue every point now.
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
            Rely only on the case file and what has been said in court. Never invent facts, witnesses, exhibits or case law. Do not cite or present exhibits in the closing: evidence was presented during arguments.
            Refer to the parties by name, not as "applicant" and "non-applicant" alone.
            Speak as you would in court: no headings, no labels such as "Counter Argument", and no questions to anyone at the end.
            In under 200 words: sum up your strongest points and the testimony that supports them, answer the best point opposing counsel made, and point out any claim of theirs the record does not support. End with the relief you pray for, in the form "With these submissions, I pray that ...".
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
