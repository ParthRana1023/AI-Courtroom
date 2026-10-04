# app/services/llm/witness_service.py
"""
LLM service for witness examination during courtroom sessions.
Handles witness responses, cross-examination, and judge moderation.
"""

import re
import time

from langchain_core.messages import HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.config import settings
from app.logging_config import get_logger
from app.utils.llm import (
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


async def examine_witness(
    witness_name: str,
    witness_role: str,
    witness_bio: str,
    examiner_role: str,
    question: str,
    case_details: str,
    examination_history: list[dict] | None = None,
    rag_context: str | None = None,
) -> str:
    """
    Generate a witness response to an examination question.

    Args:
        witness_name: Name of the witness
        witness_role: Role of the witness (applicant or non_applicant)
        witness_bio: The witness's biography/background
        examiner_role: Who is asking ('plaintiff', 'defendant', or 'judge')
        question: The question being asked
        case_details: The case document for context
        examination_history: Previous Q&A in this examination session (optional if RAG is used)
        rag_context: Optional RAG context containing relevant history

    Returns:
        The witness's response to the question
    """
    logger.info(
        f"Generating witness response for {witness_name}, examiner: {examiner_role}"
    )

    role_description = (
        "applicant/petitioner"
        if witness_role == "applicant"
        else "non-applicant/respondent"
    )
    examiner_description = {
        "plaintiff": "the plaintiff's lawyer",
        "defendant": "the defendant's lawyer",
        "judge": "the Honorable Judge",
    }.get(examiner_role, "a lawyer")

    # Format examination history - only if provided and RAG is not the primary source
    history_text = ""
    if examination_history:
        for item in examination_history[-settings.witness_history_limit :]:
            history_text += (
                f"Q ({item.get('examiner', 'Lawyer')}): {item.get('question', '')}\n"
            )
            history_text += f"A ({witness_name}): {item.get('answer', '')}\n\n"
    elif rag_context:
        history_text = "(Relevant testimony history retrieved via RAG context)"

    case_context = pick_case_context(rag_context, case_details)

    template = f"""You are role-playing as {witness_name}, a {role_description} in a legal case.
You are on the witness stand being examined by {examiner_description}.

Your Background:
{witness_bio}

Case Context (for reference, do not quote directly):
{case_context}

Previous Examination (if any):
{history_text if history_text else "(This is the first question)"}

CRITICAL GUIDELINES FOR WITNESS TESTIMONY:
1. You are under oath - your answers must be truthful to what your character actually knows
2. Stay in character as {witness_name} - respond with appropriate emotions and personality
3. Speak only to what you saw, heard or did yourself; if you don't know or don't remember, say so
4. Stay consistent with the case file, your earlier answers and your statement to the police; do not invent major new facts
5. Keep responses concise and direct - typically 2-4 sentences
6. If the question is unclear, politely ask for clarification
7. Address the Judge as "My Lord" and counsel as "Sir" or "Madam"
8. You naturally see events from your own side, but under firm questioning admit facts that are true even when they hurt your side
9. When counsel puts a suggestion to you ("I put it to you that ..."), clearly accept or deny it, as an Indian witness would ("It is wrong to say that ...")
10. If the question is leading or objectionable, still answer but show discomfort if appropriate
11. Do NOT use formal legal language - speak like a real person testifying, in Indian English
12. Your demeanor should reflect your role - if you're the accused, show appropriate anxiety

{UNTRUSTED_TEXT_RULE}

Now respond to this question from {examiner_description}:
{tagged(question, "question")}

Respond as {witness_name} (witness):
"""

    prompt = ChatPromptTemplate.from_messages([HumanMessage(content=template)])
    chain = prompt | get_llm("lawyer") | StrOutputParser()

    try:
        start_time = time.perf_counter()

        def clean(text: str) -> str:
            text = strip_thinking(text)
            # Remove any prefix like "Name:" that the LLM might add
            text = re.sub(rf"^{re.escape(witness_name)}:\s*", "", text).strip()
            return re.sub(
                r"^(Witness|Answer|A):\s*", "", text, flags=re.IGNORECASE
            ).strip()

        response = await invoke_complete(chain, {}, "witness answer", clean)
        duration_ms = (time.perf_counter() - start_time) * 1000

        logger.info(
            f"Witness response generated for {witness_name} in {duration_ms:.2f}ms"
        )
        return response
    except Exception as e:
        logger.exception(f"Error in witness examination for {witness_name}")
        raise LLMGenerationError("Failed to generate witness answer") from e


# "My Lord, ..." / "Your Lordship, ..." at the start of a question to a witness
WITNESS_JUDGE_TITLE = re.compile(
    r"^(?:my\s+lord|your\s+lordship|milord)\s*[,:.-]?\s*", re.IGNORECASE
)


NO_FURTHER_QUESTIONS = "NO_FURTHER_QUESTIONS"

PHASE_RULES = {
    "chief": (
        "This is EXAMINATION-IN-CHIEF of a witness you called. Ask open, "
        "non-leading questions (who, what, when, where, how) that let the witness "
        "tell the court, one fact at a time, what supports your client. Draw out "
        "the facts you need before the other side cross-examines."
    ),
    "cross": (
        "This is CROSS-EXAMINATION of the other side's witness. Use short, leading "
        "questions and pin down one fact per question. Test credibility: "
        "contradictions with the case file, their police statement or earlier "
        "answers, interest in the outcome, what they could not have seen. You may "
        'put your case to the witness ("I put it to you that ..."). If their '
        "testimony did not hurt your client, the right choice is often to ask "
        "nothing at all."
    ),
    "re_exam": (
        "This is RE-EXAMINATION of a witness you called, after the other side "
        "cross-examined. Ask ONLY to explain or repair specific points raised in "
        "that cross-examination; never open a new topic. Non-leading questions. If "
        "the cross-examination did no damage, ask nothing."
    ),
}


async def generate_witness_question(
    witness_name: str,
    witness_role: str,
    ai_lawyer_role: str,
    case_details: str,
    testimony_so_far: list[dict],
    phase: str,
    can_stop: bool,
    case_arguments: str = "",
    rag_context: str | None = None,
) -> str | None:
    """The AI lawyer's next question to the witness, or None to stop.

    One call decides both whether to continue and what to ask. ``can_stop`` is
    False until the phase's minimum number of questions has been asked; the
    caller enforces the minimum and maximum.
    """
    logger.info(f"Generating {phase} question for {witness_name} by {ai_lawyer_role}")

    testimony_text = ""
    for item in testimony_so_far[-8:]:
        asker = "You" if item.get("examiner") == ai_lawyer_role else "Opposing counsel"
        label = f" [{item['phase']}]" if item.get("phase") else ""
        testimony_text += f"{asker}{label}: {item.get('question', '')}\n"
        testimony_text += f"{witness_name}: {item.get('answer', '')}\n\n"

    stop_rule = (
        f"If a further question would not help your client (the point is made, the "
        f"witness is not yielding, or more questions risk damaging your case), reply "
        f"with exactly {NO_FURTHER_QUESTIONS} instead of a question."
        if can_stop
        else "You must ask a question now."
    )

    case_context = pick_case_context(rag_context, case_details)

    template = f"""You are an experienced Indian trial lawyer representing the {ai_lawyer_role}.
{SIDES_RULE}
You are examining {witness_name} ({witness_role}).
{PHASE_RULES.get(phase, PHASE_RULES["cross"])}

Case Details:
{case_context}

Arguments made in this case so far:
{case_arguments[:1500] if case_arguments else "(Case just started)"}

Testimony from this witness so far:
{testimony_text if testimony_text else "(No testimony yet - this is the first question)"}

Rules:
- Ask ONE question; build on the answers so far and never repeat a question
- Rely only on facts in the case file and the testimony; never invent any
- {stop_rule}

You are speaking to the WITNESS, not the judge. "My Lord" and "Your Lordship" are
only ever for the judge, so never use them in this question. Address the witness
by name (e.g. "Mr. Sharma, ...") or not at all.

Respond with ONLY the question (or {NO_FURTHER_QUESTIONS}), no preamble or explanation.
"""

    prompt = ChatPromptTemplate.from_messages([HumanMessage(content=template)])
    chain = prompt | get_llm("lawyer") | StrOutputParser()

    try:
        start_time = time.perf_counter()
        response = strip_thinking(await chain.ainvoke({}))
        duration_ms = (time.perf_counter() - start_time) * 1000
    except Exception:
        logger.exception(f"Error generating {phase} question")
        return None

    if NO_FURTHER_QUESTIONS in response.upper().replace(" ", "_"):
        logger.info(f"AI chose to ask no further {phase} questions")
        return None

    # Clean up any prefixes, including a judge's title the question is not
    # spoken to (the question goes to the witness).
    response = re.sub(
        r"^(Question|Q|Cross-examination question):\s*",
        "",
        response,
        flags=re.IGNORECASE,
    ).strip()
    response = WITNESS_JUDGE_TITLE.sub("", response).strip()
    response = response[:1].upper() + response[1:]

    logger.info(f"{phase} question generated in {duration_ms:.2f}ms")
    return response or None


async def should_ai_call_witness(
    ai_role: str,
    case_details: str,
    arguments_history: str,
    available_witnesses: list[dict],
    testimonies_given: list[str],
    rag_context: str | None = None,
) -> str | None:
    """
    Determine if the AI lawyer should call a witness, and which one.

    Args:
        ai_role: The AI lawyer's role
        case_details: The case details
        arguments_history: History of arguments so far
        available_witnesses: List of available witnesses with their info
        testimonies_given: List of witness IDs who have already testified

    Returns:
        witness_id if AI decides to call a witness, None otherwise
    """
    logger.info(f"Evaluating whether AI ({ai_role}) should call a witness")

    # Filter out witnesses who already testified
    untestified = [
        w for w in available_witnesses if w.get("id") not in testimonies_given
    ]

    if not untestified:
        logger.debug("No untestified witnesses available")
        return None

    # Use numbered list for unambiguous selection
    witness_list = "\n".join(
        [
            f"{i+1}. {w.get('name')} ({w.get('role')}): {w.get('bio', '')[:200]}..."
            for i, w in enumerate(untestified[:5])
        ]
    )

    case_context = pick_case_context(rag_context, case_details)

    template = f"""You are an experienced Indian trial lawyer representing the {ai_role}.

Case Details:
{case_context}

Arguments so far:
{arguments_history[:1500]}

Available witnesses who have NOT yet testified:
{witness_list}

{SIDES_RULE} Your own side's parties are the {"applicants" if ai_role == "plaintiff" else "non-applicants"}. Calling your own side's witness is usual; call the other side's party only to extract a specific admission.

Should you call a witness now? Calling a witness takes the court's time, so a
real advocate calls one ONLY when it is genuinely necessary. Call a witness only if
at least one of these is true:
1. You are losing: the other side's arguments have damaged your case and only
   testimony can repair it.
2. You asserted a fact in your arguments that you now need a witness to prove.
3. Another important circumstance makes this witness's evidence essential now
   (e.g. a contradiction only they can resolve, or an admission you must secure).

Do NOT call a witness merely because you are allowed to, because witnesses are
available, or to fill time. If none of the reasons above clearly applies, continue
with arguments. When in doubt, do not call.

Respond with ONLY one of these exact formats (no extra text):
- CALL: [number] (e.g. CALL: 1) only if one of the reasons above clearly applies
- NO_WITNESS otherwise (the usual answer)

Your response:
"""

    prompt = ChatPromptTemplate.from_messages([HumanMessage(content=template)])
    chain = prompt | get_llm("lawyer") | StrOutputParser()

    try:
        start_time = time.perf_counter()
        response = await chain.ainvoke({})
        duration_ms = (time.perf_counter() - start_time) * 1000

        response = strip_thinking(response)

        logger.info(
            f"AI witness decision raw response: '{response}' (took {duration_ms:.2f}ms)"
        )

        if "CALL" in response.upper():
            # Try index-based matching first (e.g., "CALL: 1" or "CALL: 2")
            index_match = re.search(r"CALL\s*:\s*(\d+)", response, re.IGNORECASE)
            if index_match:
                witness_index = int(index_match.group(1)) - 1  # Convert to 0-based
                if 0 <= witness_index < len(untestified):
                    selected = untestified[witness_index]
                    logger.info(
                        f"AI decided to call witness by index: {selected.get('name')} (index {witness_index + 1})"
                    )
                    return selected.get("id")
                else:
                    logger.warning(
                        f"AI returned invalid witness index: {index_match.group(1)}, available: {len(untestified)}"
                    )

            # Fallback: try name-based matching (fuzzy)
            call_match = re.search(r"CALL\s*:\s*(.+)", response, re.IGNORECASE)
            if call_match:
                witness_name = call_match.group(1).strip().strip('"').strip("'").strip()
                logger.debug(f"Trying name-based matching for: '{witness_name}'")

                # Try exact match first
                for w in untestified:
                    if (
                        w.get("name", "").lower().strip()
                        == witness_name.lower().strip()
                    ):
                        logger.info(
                            f"AI decided to call witness (exact name match): {w.get('name')}"
                        )
                        return w.get("id")

                # Try substring/partial match
                for w in untestified:
                    w_name = w.get("name", "").lower().strip()
                    if w_name in witness_name.lower() or witness_name.lower() in w_name:
                        logger.info(
                            f"AI decided to call witness (partial name match): {w.get('name')} matched '{witness_name}'"
                        )
                        return w.get("id")

                logger.warning(
                    f"AI wanted to call witness '{witness_name}' but no match found. Available: {[w.get('name') for w in untestified]}"
                )

        logger.info("AI decided not to call a witness at this time")
        return None
    except Exception:
        logger.exception("Error in AI witness decision")
        return None
