# app/routes/arguments.py
from fastapi import APIRouter, Body, Depends, HTTPException

from app import messages
from app.config import settings
from app.dependencies import courtroom_control, get_owned_case
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
from app.services.llm import judge, lawyer
from app.services.rag import retrieve_case_context, upsert_memory_item
from app.utils.datetime import get_current_datetime
from app.utils.rate_limiter import argument_rate_limiter, format_wait

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


def recent_history(case: Case, limit: int | None = None) -> str:
    """The last few arguments in order, so the AI always knows where the hearing
    stands (RAG adds older, relevant material on top)."""
    lines = [
        f"{(event.speaker_role or 'Unknown').capitalize()}: {event.content}"
        for event in case.courtroom_proceedings
        if event.type in ARGUMENT_EVENTS and event.content
    ]
    return "\n".join(lines[-(limit or settings.recent_history_limit) :])


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


async def adjournment_notice(user: User) -> dict:
    """Extra response fields when this argument used the last slot for the day.

    The client shows the AI's reply first and adjourns the court a few seconds
    later with ``adjournment_message``.
    """
    remaining, seconds = await argument_rate_limiter.get_remaining_attempts(
        str(user.id)
    )
    if remaining or seconds is None:
        return {}
    return {
        "court_adjourns": True,
        "adjournment_message": messages.COURT_ADJOURNED.format(
            wait=format_wait(seconds)
        ),
    }


@router.post("/{case_cnr}/arguments", dependencies=[Depends(courtroom_control)])
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
    if case.status == CaseStatus.ADJOURNED:
        raise HTTPException(status_code=409, detail=messages.COURT_NOT_IN_SESSION)
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
                source_types=["ai_party_chat", "case_details", "evidence", "party_bio"],
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
                    "ai_party_chat",
                    "case_details",
                    "evidence",
                    "party_bio",
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
                history=recent_history(case),
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
                source_types=["ai_party_chat", "case_details", "evidence", "party_bio"],
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
        return response | await adjournment_notice(current_user)

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
    history = recent_history(case)

    if is_closing:
        closing_context = await retrieve_case_context(
            case,
            f"{ai_role} closing statement evidence arguments testimony",
            source_types=[
                "ai_party_chat",
                "case_details",
                "evidence",
                "argument",
                "proceeding",
                "witness_testimony",
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
                "ai_party_chat",
                "case_details",
                "evidence",
                "party_bio",
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
    return {
        "ai_counter_argument": ai_reply,
        "ai_counter_role": ai_role,
    } | await adjournment_notice(current_user)


@router.post("/{case_cnr}/closing-statement", dependencies=[Depends(courtroom_control)])
async def submit_closing_statement(
    case_cnr: str,
    role: str = Body(...),
    statement: str = Body(...),
    current_user: User = Depends(argument_rate_limiter.check_only),
):
    logger.info(f"Closing statement submission for case {case_cnr}, role={role}")
    case = await get_owned_case(case_cnr, current_user)
    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(status_code=409, detail=messages.COURT_NOT_IN_SESSION)
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
                "ai_party_chat",
                "case_details",
                "evidence",
                "argument",
                "proceeding",
                "witness_testimony",
            ],
        )
        ai_closing = await lawyer.closing_statement(
            ai_role,
            role,
            case_details=case.details,
            rag_context=closing_context,
            history=recent_history(case),
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
