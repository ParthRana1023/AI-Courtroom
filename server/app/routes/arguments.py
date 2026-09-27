# app/routes/arguments.py
from fastapi import APIRouter, Body, Depends, HTTPException

from app.config import settings
from app.dependencies import get_current_user, get_owned_case
from app.logging_config import get_logger
from app.models.case import (
    ArgumentItem,
    Case,
    CaseStatus,
    CourtroomProceedingsEvent,
    CourtroomProceedingsEventType,
    Roles,
)
from app.models.user import User
from app.services.evidence_service import format_evidence_context
from app.services.llm import judge, lawyer, witness_service
from app.services.rag import retrieve_case_context, upsert_memory_item
from app.utils.datetime import get_current_datetime
from app.utils.rate_limiter import argument_rate_limiter

logger = get_logger(__name__)

router = APIRouter()


AI_SPEAKER = {"plaintiff": "Plaintiff Lawyer", "defendant": "Defense Lawyer"}
ARGUMENT_EVENTS = {
    CourtroomProceedingsEventType.ARGUMENT,
    CourtroomProceedingsEventType.AI_ARGUMENT,
    CourtroomProceedingsEventType.OPENING_STATEMENT,
}
VERDICT_ARGUMENT_TYPES = {"user", "opening", "counter", "closing"}


def other_side(role: str) -> str:
    return "defendant" if role == "plaintiff" else "plaintiff"


def side_arguments(case: Case, role: str | None) -> list[ArgumentItem]:
    return case.plaintiff_arguments if role == "plaintiff" else case.defendant_arguments


def user_display_name(user: User) -> str:
    return f"{user.first_name} {user.last_name}"


def record_argument(
    case: Case,
    role: str,
    type_: str,
    content: str,
    event_type: CourtroomProceedingsEventType,
    speaker_name: str,
    user_id=None,
):
    """Add a statement to the side's argument list and to the courtroom timeline."""
    side_arguments(case, role).append(
        ArgumentItem(
            type=type_,
            content=content,
            user_id=user_id,
            role=Roles(role),
            timestamp=get_current_datetime(),
        )
    )
    case.courtroom_proceedings.append(
        CourtroomProceedingsEvent(
            type=event_type,
            content=content,
            speaker_role=role,
            speaker_name=speaker_name,
            timestamp=get_current_datetime(),
        )
    )


def argument_history(case: Case, first_role: str) -> str:
    """Both sides' arguments, the given side first, one 'Side: text' line each."""
    return "".join(
        f"{side.capitalize()}: {arg.content}\n"
        for side in (first_role, other_side(first_role))
        for arg in side_arguments(case, side)
        if arg.content
    )


def check_can_argue_as(case: Case, role: str, user: User):
    """The requested side must be valid, match the chosen role and never switch."""
    if role not in ("plaintiff", "defendant"):
        raise HTTPException(
            status_code=400,
            detail="Invalid role specified. Must be 'plaintiff' or 'defendant'",
        )
    if case.user_role != Roles.NOT_STARTED and case.user_role.value != role:
        raise HTTPException(
            status_code=403,
            detail=f"Cannot submit as {role}. Your assigned role in this case is {case.user_role.value}",
        )
    previous_sides = {
        side
        for side in ("plaintiff", "defendant")
        if any(
            arg.user_id is not None and str(arg.user_id) == str(user.id)
            for arg in side_arguments(case, side)
        )
    }
    if previous_sides and role not in previous_sides:
        raise HTTPException(
            status_code=403,
            detail=f"Cannot switch roles. Previously participated as {', '.join(sorted(previous_sides))}",
        )


async def save_with_memory(case: Case, memories: list[tuple], error_detail: str):
    """Save the case, then index (source_type, source_id, content, metadata) items."""
    try:
        await case.save()
        for source_type, source_id, content, metadata in memories:
            await upsert_memory_item(case, source_type, source_id, content, metadata)
    except Exception:
        logger.exception(f"Error saving case {case.cnr}")
        raise HTTPException(status_code=500, detail=error_detail)


def argument_memory(
    source_id: str, content: str, role: str, argument_type: str
) -> tuple:
    return (
        "argument",
        source_id,
        content,
        {"side": role, "argument_type": argument_type, "role": role},
    )


def build_argument_history_until(
    case: Case, event_index: int, replacement_event_id: str | None = None
) -> str:
    return "".join(
        f"{event.speaker_role or 'lawyer'}: {event.content or ''}\n"
        for event in case.courtroom_proceedings[:event_index]
        if event.id != replacement_event_id and event.type in ARGUMENT_EVENTS
    )


def update_matching_ai_argument(case: Case, event, old_content: str, new_content: str):
    ai_arguments = [
        arg
        for arg in reversed(side_arguments(case, event.speaker_role))
        if arg.user_id is None
    ]
    target = next((arg for arg in ai_arguments if arg.content == old_content), None)
    target = target or next(iter(ai_arguments), None)
    if target:
        target.content = new_content


def update_matching_witness_answer(
    case: Case,
    witness_id: str | None,
    question: str | None,
    old_answer: str,
    new_answer: str,
):
    for testimony in reversed(case.witness_testimonies):
        if witness_id and testimony.witness_id != witness_id:
            continue
        for item in reversed(testimony.examination):
            if item.question == question and item.answer == old_answer:
                item.answer = new_answer
                return item.id
    return None


def remove_proceedings_after(case: Case, event_index: int):
    """
    Removes all courtroom proceedings and associated data that occurred after the given event index.
    This effectively rolls back the case state to that point in time.
    """
    if event_index >= len(case.courtroom_proceedings) - 1:
        return

    events_to_remove = case.courtroom_proceedings[event_index + 1 :]
    logger.info(
        f"Rolling back case {case.cnr}: removing {len(events_to_remove)} events after index {event_index}"
    )

    # We process in reverse order to correctly restore state (like current_witness_id)
    for event in reversed(events_to_remove):
        if event.type in ARGUMENT_EVENTS:
            # Remove the most recent argument with the same content
            args = side_arguments(case, event.speaker_role)
            for i in range(len(args) - 1, -1, -1):
                if args[i].content == event.content:
                    args.pop(i)
                    break

        elif event.type == CourtroomProceedingsEventType.WITNESS_EXAMINED_A:
            # Witness answers are stored in witness_testimonies.examination
            for testimony in case.witness_testimonies:
                if testimony.witness_id == event.witness_id:
                    for i in range(len(testimony.examination) - 1, -1, -1):
                        if testimony.examination[i].answer == event.content:
                            testimony.examination.pop(i)
                            break

        elif event.type == CourtroomProceedingsEventType.WITNESS_CALLED:
            # If we remove a WITNESS_CALLED event, the witness is no longer on the stand
            case.current_witness_id = None
            case.is_ai_examining = False
            # Also remove the testimony session if it's empty
            for i in range(len(case.witness_testimonies) - 1, -1, -1):
                if (
                    case.witness_testimonies[i].witness_id == event.witness_id
                    and not case.witness_testimonies[i].examination
                ):
                    case.witness_testimonies.pop(i)
                    break

        elif event.type == CourtroomProceedingsEventType.WITNESS_DISMISSED:
            # If we remove a WITNESS_DISMISSED event, the witness is back on the stand
            case.current_witness_id = event.witness_id
            for testimony in reversed(case.witness_testimonies):
                if testimony.witness_id == event.witness_id:
                    testimony.ended_at = None
                    break

    # Truncate proceedings
    case.courtroom_proceedings = case.courtroom_proceedings[: event_index + 1]

    # If case was resolved, it might not be anymore since we removed subsequent events
    if case.status == CaseStatus.RESOLVED:
        case.status = CaseStatus.ACTIVE
        logger.info(f"Case {case.cnr} status reverted to ACTIVE")


@router.post("/{case_cnr}/arguments")
async def submit_argument(
    case_cnr: str,
    role: str = Body(...),
    argument: str = Body(...),
    is_closing: bool = Body(False),
    current_user: User = Depends(argument_rate_limiter.check_only),
):
    logger.info(
        f"Argument submission for case {case_cnr}, role={role}, length={len(argument)}"
    )
    case = await get_owned_case(case_cnr, current_user)
    check_can_argue_as(case, role, current_user)
    if case.status == CaseStatus.RESOLVED:
        raise HTTPException(
            status_code=400, detail="Cannot submit arguments to a resolved case"
        )

    ai_role = other_side(role)
    speaker = user_display_name(current_user)
    evidence_context = format_evidence_context(case.evidence)

    # First submission: both opening statements. LLMGenerationError from any AI
    # call below becomes a 503 (see main.py) before anything is saved.
    if not case.plaintiff_arguments and not case.defendant_arguments:
        if role == "defendant":
            # The plaintiff always opens, so the AI opens for the plaintiff first.
            opening_context = await retrieve_case_context(
                case,
                "plaintiff opening statement key case facts evidence parties",
                source_types=["case_details", "evidence", "party_bio", "party_chat"],
            )
            ai_opening = await lawyer.opening_statement(
                "plaintiff",
                case.details,
                "defendant",
                rag_context=opening_context,
                evidence_context=evidence_context,
            )
            record_argument(
                case,
                "plaintiff",
                "opening",
                ai_opening,
                CourtroomProceedingsEventType.OPENING_STATEMENT,
                AI_SPEAKER["plaintiff"],
            )
            record_argument(
                case,
                "defendant",
                "opening",
                argument,
                CourtroomProceedingsEventType.OPENING_STATEMENT,
                speaker,
                current_user.id,
            )
            counter_context = await retrieve_case_context(
                case,
                f"plaintiff counter argument responding to defendant: {argument}",
                source_types=[
                    "case_details",
                    "evidence",
                    "party_bio",
                    "party_chat",
                    "argument",
                    "proceeding",
                ],
            )
            ai_counter = await lawyer.generate_counter_argument(
                argument,
                "plaintiff",
                "defendant",
                case.details,
                rag_context=counter_context,
                history=(
                    argument_history(case, "defendant")
                    if not settings.rag_enabled
                    else None
                ),
                evidence_context=evidence_context,
            )
            record_argument(
                case,
                "plaintiff",
                "counter",
                ai_counter,
                CourtroomProceedingsEventType.AI_ARGUMENT,
                AI_SPEAKER["plaintiff"],
            )
            memories = [
                argument_memory(
                    "plaintiff_opening_auto", ai_opening, "plaintiff", "opening"
                ),
                argument_memory(
                    "defendant_opening_user", argument, "defendant", "opening"
                ),
                argument_memory(
                    "plaintiff_counter_auto_1", ai_counter, "plaintiff", "counter"
                ),
            ]
            response = {
                "ai_opening_statement": ai_opening,
                "ai_opening_role": "plaintiff",
                "ai_counter_argument": ai_counter,
                "ai_counter_role": "plaintiff",
            }
        else:
            record_argument(
                case,
                "plaintiff",
                "opening",
                argument,
                CourtroomProceedingsEventType.OPENING_STATEMENT,
                speaker,
                current_user.id,
            )
            opening_context = await retrieve_case_context(
                case,
                f"defendant opening statement responding to plaintiff opening: {argument}",
                source_types=["case_details", "evidence", "party_bio", "party_chat"],
            )
            ai_opening = await lawyer.opening_statement(
                "defendant",
                case.details,
                "plaintiff",
                rag_context=opening_context,
                evidence_context=evidence_context,
            )
            record_argument(
                case,
                "defendant",
                "opening",
                ai_opening,
                CourtroomProceedingsEventType.OPENING_STATEMENT,
                AI_SPEAKER["defendant"],
            )
            memories = [
                argument_memory(
                    "plaintiff_opening_user", argument, "plaintiff", "opening"
                ),
                argument_memory(
                    "defendant_opening_auto", ai_opening, "defendant", "opening"
                ),
            ]
            response = {
                "ai_opening_statement": ai_opening,
                "ai_opening_role": "defendant",
            }

        if case.status == CaseStatus.NOT_STARTED:
            case.status = CaseStatus.ACTIVE
        await save_with_memory(case, memories, "Failed to save case. Please try again.")
        await argument_rate_limiter.register_usage(str(current_user.id))
        return response

    if not case.plaintiff_arguments and role == "defendant":
        raise HTTPException(
            status_code=400, detail="The plaintiff must go first in the case."
        )

    argument_type = "closing" if is_closing else "user"
    record_argument(
        case,
        role,
        argument_type,
        argument,
        CourtroomProceedingsEventType.ARGUMENT,
        speaker,
        current_user.id,
    )
    history = argument_history(case, role) if not settings.rag_enabled else None

    if is_closing:
        closing_context = await retrieve_case_context(
            case,
            f"{ai_role} closing statement evidence arguments testimony",
            source_types=[
                "case_details",
                "evidence",
                "argument",
                "proceeding",
                "witness_testimony",
                "party_chat",
            ],
        )
        ai_reply = await lawyer.closing_statement(
            ai_role,
            role,
            case_details=case.details,
            rag_context=closing_context,
            history=history,
            evidence_context=evidence_context,
        )
        case.status = CaseStatus.RESOLVED
    else:
        counter_context = await retrieve_case_context(
            case,
            f"{ai_role} counter argument responding to: {argument}",
            source_types=[
                "case_details",
                "evidence",
                "party_bio",
                "party_chat",
                "argument",
                "proceeding",
                "witness_testimony",
            ],
        )
        ai_reply = await lawyer.generate_counter_argument(
            argument,
            ai_role,
            role,
            case.details,
            rag_context=counter_context,
            history=history,
            evidence_context=evidence_context,
        )
        if case.status == CaseStatus.NOT_STARTED:
            case.status = CaseStatus.ACTIVE

    record_argument(
        case,
        ai_role,
        "closing" if is_closing else "counter",
        ai_reply,
        CourtroomProceedingsEventType.AI_ARGUMENT,
        AI_SPEAKER[ai_role],
    )
    total = len(case.plaintiff_arguments) + len(case.defendant_arguments)
    await save_with_memory(
        case,
        [
            argument_memory(f"{role}_user_{total}", argument, role, "user"),
            argument_memory(f"{ai_role}_ai_{total}", ai_reply, ai_role, "counter"),
        ],
        "Failed to save case. Please try again.",
    )
    await argument_rate_limiter.register_usage(str(current_user.id))
    return {"ai_counter_argument": ai_reply, "ai_counter_role": ai_role}


@router.post("/{case_cnr}/proceedings/{event_id}/regenerate")
async def regenerate_short_llm_response(
    case_cnr: str,
    event_id: str,
    current_user: User = Depends(get_current_user),
):
    logger.info(f"Regenerating LLM response for case {case_cnr}, event {event_id}")

    case = await get_owned_case(case_cnr, current_user)

    event_index = next(
        (
            index
            for index, event in enumerate(case.courtroom_proceedings)
            if event.id == event_id
        ),
        None,
    )
    if event_index is None:
        raise HTTPException(status_code=404, detail="Proceeding event not found")

    event = case.courtroom_proceedings[event_index]
    old_content = event.content or ""

    if event.type not in {
        CourtroomProceedingsEventType.AI_ARGUMENT,
        CourtroomProceedingsEventType.OPENING_STATEMENT,
        CourtroomProceedingsEventType.WITNESS_EXAMINED_A,
    }:
        raise HTTPException(
            status_code=400, detail="This proceeding event cannot be regenerated"
        )

    user_role = (
        case.user_role.value
        if case.user_role != Roles.NOT_STARTED
        else ("defendant" if event.speaker_role == "plaintiff" else "plaintiff")
    )
    ai_role = event.speaker_role or (
        "defendant" if user_role == "plaintiff" else "plaintiff"
    )

    # Delete all proceedings following this response as per requirement
    remove_proceedings_after(case, event_index)

    try:
        if event.type == CourtroomProceedingsEventType.WITNESS_EXAMINED_A:
            witness_party = case.get_party(event.witness_id)
            question_event = next(
                (
                    previous
                    for previous in reversed(case.courtroom_proceedings[:event_index])
                    if previous.type == CourtroomProceedingsEventType.WITNESS_EXAMINED_Q
                    and previous.witness_id == event.witness_id
                ),
                None,
            )
            question = event.question or (
                question_event.question if question_event else None
            )
            if not witness_party or not question:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot regenerate witness response without witness and question context",
                )

            examination_history = []
            for testimony in case.witness_testimonies:
                if testimony.witness_id == event.witness_id:
                    examination_history = [
                        {
                            "examiner": item.examiner,
                            "question": item.question,
                            "answer": item.answer,
                        }
                        for item in testimony.examination
                        if item.answer != old_content
                    ]
                    break

            rag_context = await retrieve_case_context(
                case,
                f"regenerate witness {witness_party.name} answer: {question}",
                source_types=[
                    "case_details",
                    "evidence",
                    "party_bio",
                    "party_chat",
                    "argument",
                    "proceeding",
                    "witness_testimony",
                ],
            )
            new_content = await witness_service.examine_witness(
                witness_name=witness_party.name,
                witness_role=witness_party.role.value,
                witness_bio=witness_party.bio or "",
                examiner_role=(
                    question_event.speaker_role
                    if (question_event and question_event.speaker_role)
                    else ai_role
                ),
                question=question,
                case_details=case.details,
                examination_history=(
                    examination_history if not settings.rag_enabled else None
                ),
                rag_context=rag_context,
            )

            testimony_item_id = update_matching_witness_answer(
                case, event.witness_id, question, old_content, new_content
            )
            event.answer = new_content
            await upsert_memory_item(
                case,
                "witness_testimony",
                testimony_item_id or event.id,
                f"Q: {question}\nA: {new_content}",
                {
                    "witness_id": event.witness_id,
                    "witness_name": witness_party.name,
                    "examiner": (
                        question_event.speaker_role if question_event else ai_role
                    ),
                },
            )
        elif event.type == CourtroomProceedingsEventType.OPENING_STATEMENT:
            rag_context = await retrieve_case_context(
                case,
                f"regenerate {ai_role} opening statement",
                source_types=["case_details", "evidence", "party_bio", "party_chat"],
            )
            new_content = await lawyer.opening_statement(
                ai_role,
                case.details,
                user_role,
                rag_context=rag_context,
                evidence_context=format_evidence_context(case.evidence),
            )
            update_matching_ai_argument(case, event, old_content, new_content)
        else:
            previous_user_event = next(
                (
                    previous
                    for previous in reversed(case.courtroom_proceedings[:event_index])
                    if previous.speaker_role == user_role
                    and previous.type
                    in {
                        CourtroomProceedingsEventType.ARGUMENT,
                        CourtroomProceedingsEventType.OPENING_STATEMENT,
                    }
                ),
                None,
            )
            if not previous_user_event:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot regenerate AI response without a previous user argument",
                )

            history = build_argument_history_until(case, event_index, event.id)
            rag_context = await retrieve_case_context(
                case,
                f"regenerate {ai_role} counter argument responding to: {previous_user_event.content}",
                source_types=[
                    "case_details",
                    "evidence",
                    "party_bio",
                    "party_chat",
                    "argument",
                    "proceeding",
                    "witness_testimony",
                ],
            )
            new_content = await lawyer.generate_counter_argument(
                previous_user_event.content or "",
                ai_role,
                user_role,
                case.details,
                rag_context=rag_context,
                history=history if not settings.rag_enabled else None,
                evidence_context=format_evidence_context(case.evidence),
            )
            update_matching_ai_argument(case, event, old_content, new_content)

        event.content = new_content
        case.courtroom_proceedings[event_index] = event
        await case.save()
        await upsert_memory_item(
            case,
            "proceeding",
            event.id,
            new_content,
            {
                "event_type": event.type.value,
                "speaker_role": event.speaker_role,
                "witness_id": event.witness_id,
                "regenerated": True,
            },
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to regenerate response")
        raise HTTPException(status_code=500, detail="Failed to regenerate response")

    return {
        "success": True,
        "event_id": event.id,
        "content": new_content,
    }


@router.post("/{case_cnr}/closing-statement")
async def submit_closing_statement(
    case_cnr: str,
    role: str = Body(...),
    statement: str = Body(...),
    current_user: User = Depends(argument_rate_limiter.check_only),
):
    logger.info(f"Closing statement submission for case {case_cnr}, role={role}")
    case = await get_owned_case(case_cnr, current_user)
    check_can_argue_as(case, role, current_user)

    side_arguments(case, role).append(
        ArgumentItem(
            type="closing",
            content=statement,
            user_id=current_user.id,
            role=Roles(role),
            timestamp=get_current_datetime(),
        )
    )
    total = len(case.plaintiff_arguments) + len(case.defendant_arguments)
    await save_with_memory(
        case,
        [argument_memory(f"{role}_closing_user_{total}", statement, role, "closing")],
        "Failed to save closing statement. Please try again.",
    )

    ai_role = other_side(role)
    try:
        closing_context = await retrieve_case_context(
            case,
            f"{ai_role} closing statement evidence arguments testimony",
            source_types=[
                "case_details",
                "evidence",
                "argument",
                "proceeding",
                "witness_testimony",
                "party_chat",
            ],
        )
        ai_closing = await lawyer.closing_statement(
            ai_role,
            role,
            case_details=case.details,
            rag_context=closing_context,
            history=argument_history(case, role) if not settings.rag_enabled else None,
            evidence_context=format_evidence_context(case.evidence),
        )
    except Exception:
        logger.exception(f"AI closing statement failed for case {case_cnr}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate AI closing statement. Please try again.",
        )

    side_arguments(case, ai_role).append(
        ArgumentItem(
            type="closing",
            content=ai_closing,
            user_id=None,
            role=Roles(ai_role),
            timestamp=get_current_datetime(),
        )
    )

    all_arguments = case.plaintiff_arguments + case.defendant_arguments
    arguments_for = {
        side: [
            arg.content
            for arg in all_arguments
            if arg.type in VERDICT_ARGUMENT_TYPES and arg.role == Roles(side)
        ]
        for side in ("plaintiff", "defendant")
    }
    try:
        verdict_context = await retrieve_case_context(
            case,
            "formal verdict facts issues arguments evidence witness testimony",
            source_types=[
                "case_details",
                "evidence",
                "argument",
                "proceeding",
                "witness_testimony",
                "party_chat",
            ],
        )
        case.verdict = await judge.generate_verdict(
            plaintiff_arguments=arguments_for["plaintiff"],
            defendant_arguments=arguments_for["defendant"],
            case_details=case.details,
            title=case.title,
            rag_context=verdict_context,
            evidence_context=format_evidence_context(case.evidence),
        )
    except Exception:
        logger.exception(f"Verdict generation failed for case {case_cnr}")
        raise HTTPException(
            status_code=500, detail="Failed to generate verdict. Please try again."
        )

    case.status = CaseStatus.RESOLVED
    await save_with_memory(
        case,
        [
            argument_memory(
                f"{ai_role}_closing_auto_{total + 1}", ai_closing, ai_role, "closing"
            ),
            ("verdict", "verdict", case.verdict or "", {"title": case.title}),
        ],
        "Failed to save verdict. Please try again.",
    )
    await argument_rate_limiter.register_usage(str(current_user.id))
    logger.info(f"Case {case_cnr} resolved with verdict")

    return {
        "verdict": case.verdict,
        "ai_closing_statement": ai_closing,
        "ai_closing_role": ai_role,
    }
