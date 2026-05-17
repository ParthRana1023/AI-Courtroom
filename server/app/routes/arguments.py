# app/routes/arguments.py
import time
from fastapi import APIRouter, Body, Depends, HTTPException
from app.models.case import Case, CaseStatus
from app.dependencies import get_current_user
from app.services.llm import lawyer
from app.services.llm import judge
from app.services.llm import witness_service
from app.models.user import User
from app.utils.rate_limiter import argument_rate_limiter
from app.utils.datetime import get_current_datetime
from app.config import settings
from app.services.rag import retrieve_case_context, upsert_memory_item
from app.services.evidence_service import format_evidence_context
from app.models.case import (
    ArgumentItem,
    Roles,
    CourtroomProceedingsEvent,
    CourtroomProceedingsEventType,
)
from app.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter()


def get_party_by_id(case: Case, party_id: str):
    for party in case.parties_involved:
        if party.id == party_id:
            return party
    return None


def argument_content(argument_item):
    return (
        argument_item.content
        if isinstance(argument_item, ArgumentItem)
        else argument_item.get("content")
    )


def argument_user_id(argument_item):
    return (
        argument_item.user_id
        if isinstance(argument_item, ArgumentItem)
        else argument_item.get("user_id")
    )


def set_argument_content(argument_item, content: str):
    if isinstance(argument_item, ArgumentItem):
        argument_item.content = content
    else:
        argument_item["content"] = content


def build_argument_history_until(
    case: Case, event_index: int, replacement_event_id: str | None = None
) -> str:
    history = ""
    for event in case.courtroom_proceedings[:event_index]:
        if event.id == replacement_event_id:
            continue
        if event.type in {
            CourtroomProceedingsEventType.ARGUMENT,
            CourtroomProceedingsEventType.AI_ARGUMENT,
            CourtroomProceedingsEventType.OPENING_STATEMENT,
        }:
            history += f"{event.speaker_role or 'lawyer'}: {event.content or ''}\n"
    return history


def update_matching_ai_argument(case: Case, event, old_content: str, new_content: str):
    argument_list = (
        case.plaintiff_arguments
        if event.speaker_role == Roles.PLAINTIFF.value
        else case.defendant_arguments
    )

    for argument_item in reversed(argument_list):
        if argument_user_id(argument_item) is not None:
            continue
        if argument_content(argument_item) == old_content:
            set_argument_content(argument_item, new_content)
            return

    for argument_item in reversed(argument_list):
        if argument_user_id(argument_item) is None:
            set_argument_content(argument_item, new_content)
            return


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
        if event.type in {
            CourtroomProceedingsEventType.ARGUMENT,
            CourtroomProceedingsEventType.AI_ARGUMENT,
            CourtroomProceedingsEventType.OPENING_STATEMENT,
        }:
            # Remove from plaintiff_arguments or defendant_arguments
            args = (
                case.plaintiff_arguments
                if event.speaker_role == Roles.PLAINTIFF.value
                else case.defendant_arguments
            )
            # Match by content. Using reversed to get the most recent one.
            for i in range(len(args) - 1, -1, -1):
                arg_content = (
                    args[i].content
                    if isinstance(args[i], ArgumentItem)
                    else args[i]["content"]
                )
                if arg_content == event.content:
                    args.pop(i)
                    logger.debug(f"Removed argument matching event {event.id}")
                    break

        elif event.type == CourtroomProceedingsEventType.WITNESS_EXAMINED_A:
            # Witness answers are stored in witness_testimonies.examination
            for testimony in case.witness_testimonies:
                if testimony.witness_id == event.witness_id:
                    for i in range(len(testimony.examination) - 1, -1, -1):
                        if testimony.examination[i].answer == event.content:
                            testimony.examination.pop(i)
                            logger.debug(
                                f"Removed witness answer matching event {event.id}"
                            )
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
                    logger.debug(
                        f"Removed empty testimony session for {event.witness_id}"
                    )
                    break

        elif event.type == CourtroomProceedingsEventType.WITNESS_DISMISSED:
            # If we remove a WITNESS_DISMISSED event, the witness is back on the stand
            case.current_witness_id = event.witness_id
            # Also reset ended_at for the most recent testimony of this witness
            for testimony in reversed(case.witness_testimonies):
                if testimony.witness_id == event.witness_id:
                    testimony.ended_at = None
                    logger.debug(f"Restored witness {event.witness_id} to the stand")
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
    current_user: User = Depends(get_current_user),
):
    logger.info(
        f"Argument submission for case {case_cnr}, role={role}, length={len(argument)}"
    )

    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        logger.warning(f"Case not found: {case_cnr}")
        raise HTTPException(status_code=404, detail="Case not found")

    if str(case.user_id) != str(current_user.id):
        logger.warning(
            f"Unauthorized argument submission for case {case_cnr} by user: {current_user.email}"
        )
        raise HTTPException(
            status_code=403, detail="You don't have permission to access this case"
        )

    # Validate the role
    try:
        role_enum = Roles(role)
    except ValueError:
        logger.warning(f"Invalid role specified: {role}")
        raise HTTPException(
            status_code=400,
            detail="Invalid role specified. Must be 'plaintiff' or 'defendant'",
        )

    # Check if the user's role in the case matches the requested role
    if (
        case.user_role
        and case.user_role != Roles.NOT_STARTED
        and case.user_role.value != role
    ):
        logger.warning(
            f"Role mismatch for case {case_cnr}: user_role={case.user_role.value}, requested={role}"
        )
        raise HTTPException(
            status_code=403,
            detail=f"Cannot submit as {role}. Your assigned role in this case is {case.user_role.value}",
        )

    # Check if case is resolved
    if case.status == CaseStatus.RESOLVED:
        logger.warning(f"Attempt to submit argument to resolved case {case_cnr}")
        raise HTTPException(
            status_code=400, detail="Cannot submit arguments to a resolved case"
        )

    logger.debug(
        f"Current arguments: Plaintiff={len(case.plaintiff_arguments)}, Defendant={len(case.defendant_arguments)}"
    )

    # Check if this is the first argument submission
    if not case.plaintiff_arguments and not case.defendant_arguments:
        logger.info(f"First argument for case {case_cnr}")
        # First argument must be from plaintiff (either user or AI)
        if role != "plaintiff":
            logger.info(
                f"User is defendant - generating AI plaintiff opening for case {case_cnr}"
            )
            start_time = time.perf_counter()
            rag_context = await retrieve_case_context(
                case,
                "plaintiff opening statement key case facts evidence parties",
                source_types=["case_details", "evidence", "party_bio", "party_chat"],
            )

            plaintiff_opening_statement = await lawyer.opening_statement(
                "plaintiff",
                case.details,
                "defendant",
                rag_context=rag_context,
                evidence_context=format_evidence_context(case.evidence),
            )
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info(f"Plaintiff opening statement generated in {duration_ms:.2f}ms")

            case.plaintiff_arguments.append(
                ArgumentItem(
                    type="opening",
                    content=plaintiff_opening_statement,
                    user_id=None,
                    role=Roles.PLAINTIFF,
                    timestamp=get_current_datetime(),
                )
            )

            case.courtroom_proceedings.append(
                CourtroomProceedingsEvent(
                    type=CourtroomProceedingsEventType.OPENING_STATEMENT,
                    content=plaintiff_opening_statement,
                    speaker_role="plaintiff",
                    speaker_name="Plaintiff Lawyer",
                    timestamp=get_current_datetime(),
                )
            )

            # User's submitted argument is recorded as the defendant's opening statement
            case.defendant_arguments.append(
                ArgumentItem(
                    type="opening",
                    content=argument,
                    user_id=current_user.id,
                    role=Roles.DEFENDANT,
                    timestamp=get_current_datetime(),
                )
            )

            case.courtroom_proceedings.append(
                CourtroomProceedingsEvent(
                    type=CourtroomProceedingsEventType.OPENING_STATEMENT,
                    content=argument,
                    speaker_role="defendant",
                    speaker_name=f"{current_user.first_name} {current_user.last_name}",
                    timestamp=get_current_datetime(),
                )
            )

            # Prepare history for counter-argument
            history = f"Defendant: {argument}\n"

            # AI (as plaintiff) generates a counter-argument
            start_time = time.perf_counter()
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
            ai_plaintiff_counter = await lawyer.generate_counter_argument(
                argument,
                "plaintiff",
                case.user_role.value,
                case.details,
                rag_context=counter_context,
                history=history if not settings.rag_enabled else None,
                evidence_context=format_evidence_context(case.evidence),
            )
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info(f"Plaintiff counter-argument generated in {duration_ms:.2f}ms")

            case.plaintiff_arguments.append(
                ArgumentItem(
                    type="counter",
                    content=ai_plaintiff_counter,
                    user_id=None,
                    role=Roles.PLAINTIFF,
                    timestamp=get_current_datetime(),
                )
            )

            case.courtroom_proceedings.append(
                CourtroomProceedingsEvent(
                    type=CourtroomProceedingsEventType.AI_ARGUMENT,
                    content=ai_plaintiff_counter,
                    speaker_role="plaintiff",
                    speaker_name="Plaintiff Lawyer",
                    timestamp=get_current_datetime(),
                )
            )

            # Update case status
            if case.status == CaseStatus.NOT_STARTED:
                case.status = CaseStatus.ACTIVE
                logger.debug(f"Case {case_cnr} status updated to ACTIVE")

            try:
                await case.save()
                await upsert_memory_item(
                    case,
                    "argument",
                    "plaintiff_opening_auto",
                    plaintiff_opening_statement,
                    {
                        "side": "plaintiff",
                        "argument_type": "opening",
                        "role": "plaintiff",
                    },
                )
                await upsert_memory_item(
                    case,
                    "argument",
                    "defendant_opening_user",
                    argument,
                    {
                        "side": "defendant",
                        "argument_type": "opening",
                        "role": "defendant",
                    },
                )
                await upsert_memory_item(
                    case,
                    "argument",
                    "plaintiff_counter_auto_1",
                    ai_plaintiff_counter,
                    {
                        "side": "plaintiff",
                        "argument_type": "counter",
                        "role": "plaintiff",
                    },
                )
                logger.debug(f"Case {case_cnr} saved successfully")
            except Exception as e:
                logger.error(f"Error saving case {case_cnr}: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=500, detail="Failed to save case. Please try again."
                )

            await argument_rate_limiter.register_usage(str(current_user.id))

            return {
                "ai_opening_statement": plaintiff_opening_statement,
                "ai_opening_role": "plaintiff",
                "ai_counter_argument": ai_plaintiff_counter,
                "ai_counter_role": "plaintiff",
            }
        else:
            logger.info(
                f"User is plaintiff - submitting first argument for case {case_cnr}"
            )
            case.plaintiff_arguments.append(
                ArgumentItem(
                    type="opening",
                    content=argument,
                    user_id=current_user.id,
                    role=role_enum,
                    timestamp=get_current_datetime(),
                )
            )

            case.courtroom_proceedings.append(
                CourtroomProceedingsEvent(
                    type=CourtroomProceedingsEventType.OPENING_STATEMENT,
                    content=argument,
                    speaker_role="plaintiff",
                    speaker_name=f"{current_user.first_name} {current_user.last_name}",
                    timestamp=get_current_datetime(),
                )
            )

            # Generate defendant's opening statement
            start_time = time.perf_counter()
            rag_context = await retrieve_case_context(
                case,
                f"defendant opening statement responding to plaintiff opening: {argument}",
                source_types=["case_details", "evidence", "party_bio", "party_chat"],
            )
            defendant_opening_statement = await lawyer.opening_statement(
                "defendant",
                case.details,
                "plaintiff",
                rag_context=rag_context,
                evidence_context=format_evidence_context(case.evidence),
            )
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info(f"Defendant opening statement generated in {duration_ms:.2f}ms")

            case.defendant_arguments.append(
                ArgumentItem(
                    type="opening",
                    content=defendant_opening_statement,
                    user_id=None,
                    role=Roles.DEFENDANT,
                    timestamp=get_current_datetime(),
                )
            )

            case.courtroom_proceedings.append(
                CourtroomProceedingsEvent(
                    type=CourtroomProceedingsEventType.OPENING_STATEMENT,
                    content=defendant_opening_statement,
                    speaker_role="defendant",
                    speaker_name="Defense Lawyer",
                    timestamp=get_current_datetime(),
                )
            )

            # Update case status
            if case.status == CaseStatus.NOT_STARTED:
                case.status = CaseStatus.ACTIVE
                logger.debug(f"Case {case_cnr} status updated to ACTIVE")

            try:
                await case.save()
                await upsert_memory_item(
                    case,
                    "argument",
                    "plaintiff_opening_user",
                    argument,
                    {
                        "side": "plaintiff",
                        "argument_type": "opening",
                        "role": "plaintiff",
                    },
                )
                await upsert_memory_item(
                    case,
                    "argument",
                    "defendant_opening_auto",
                    defendant_opening_statement,
                    {
                        "side": "defendant",
                        "argument_type": "opening",
                        "role": "defendant",
                    },
                )
            except Exception as e:
                logger.error(f"Error saving case {case_cnr}: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=500, detail="Failed to save case. Please try again."
                )

            await argument_rate_limiter.register_usage(str(current_user.id))

            return {
                "ai_opening_statement": defendant_opening_statement,
                "ai_opening_role": "defendant",
            }
    elif not case.plaintiff_arguments and role == "defendant":
        logger.warning(
            f"Defendant trying to submit before plaintiff for case {case_cnr}"
        )
        raise HTTPException(
            status_code=400, detail="The plaintiff must go first in the case."
        )
    else:
        logger.debug(
            f"Case {case_cnr} already has arguments - processing regular submission"
        )

    # For backward compatibility, check previous participation
    existing_roles = set()
    for arg in case.plaintiff_arguments:
        if arg.user_id is not None and str(arg.user_id) == str(current_user.id):
            existing_roles.add("plaintiff")
    for arg in case.defendant_arguments:
        if arg.user_id is not None and str(arg.user_id) == str(current_user.id):
            existing_roles.add("defendant")

    if existing_roles and role not in existing_roles:
        logger.warning(
            f"Role switch attempt in case {case_cnr}: previous={existing_roles}, requested={role}"
        )
        raise HTTPException(
            status_code=403,
            detail=f"Cannot switch roles. Previously participated as {', '.join(existing_roles)}",
        )
    else:
        user_id = current_user.id

        if role == "plaintiff":
            case.plaintiff_arguments.append(
                ArgumentItem(
                    type="user",
                    content=argument,
                    user_id=user_id,
                    role=Roles.PLAINTIFF,
                    timestamp=get_current_datetime(),
                )
            )

            case.courtroom_proceedings.append(
                CourtroomProceedingsEvent(
                    type=CourtroomProceedingsEventType.ARGUMENT,
                    content=argument,
                    speaker_role="plaintiff",
                    speaker_name=f"{current_user.first_name} {current_user.last_name}",
                    timestamp=get_current_datetime(),
                )
            )
        else:
            case.defendant_arguments.append(
                ArgumentItem(
                    type="user",
                    content=argument,
                    user_id=user_id,
                    role=Roles.DEFENDANT,
                    timestamp=get_current_datetime(),
                )
            )

            case.courtroom_proceedings.append(
                CourtroomProceedingsEvent(
                    type=CourtroomProceedingsEventType.ARGUMENT,
                    content=argument,
                    speaker_role="defendant",
                    speaker_name=f"{current_user.first_name} {current_user.last_name}",
                    timestamp=get_current_datetime(),
                )
            )

    # Prepare history for counter-argument generation
    history = ""
    if role == "plaintiff":
        for arg in case.plaintiff_arguments:
            content = (
                arg.content if isinstance(arg, ArgumentItem) else arg["content"]
            )
            if content:
                history += f"Plaintiff: {content}\n"
        for arg in case.defendant_arguments:
            content = (
                arg.content if isinstance(arg, ArgumentItem) else arg["content"]
            )
            if content:
                history += f"Defendant: {content}\n"
    else:
        for arg in case.defendant_arguments:
            content = (
                arg.content if isinstance(arg, ArgumentItem) else arg["content"]
            )
            if content:
                history += f"Defendant: {content}\n"
        for arg in case.plaintiff_arguments:
            content = (
                arg.content if isinstance(arg, ArgumentItem) else arg["content"]
            )
            if content:
                history += f"Plaintiff: {content}\n"

    # Determine AI role based on user's role
    ai_role = "defendant" if role == "plaintiff" else "plaintiff"

    # Check if this is a closing statement
    if is_closing:
        logger.info(f"Processing closing statement for case {case_cnr}")
        if role == "plaintiff":
            case.plaintiff_arguments.append(
                ArgumentItem(
                    type="closing",
                    content=argument,
                    user_id=current_user.id,
                    role=Roles.PLAINTIFF,
                    timestamp=get_current_datetime(),
                )
            )

            case.courtroom_proceedings.append(
                CourtroomProceedingsEvent(
                    type=CourtroomProceedingsEventType.ARGUMENT,
                    content=argument,
                    speaker_role="plaintiff",
                    speaker_name=f"{current_user.first_name} {current_user.last_name}",
                    timestamp=get_current_datetime(),
                )
            )
        else:
            case.defendant_arguments.append(
                ArgumentItem(
                    type="closing",
                    content=argument,
                    user_id=current_user.id,
                    role=Roles.DEFENDANT,
                    timestamp=get_current_datetime(),
                )
            )

            case.courtroom_proceedings.append(
                CourtroomProceedingsEvent(
                    type=CourtroomProceedingsEventType.ARGUMENT,
                    content=argument,
                    speaker_role="defendant",
                    speaker_name=f"{current_user.first_name} {current_user.last_name}",
                    timestamp=get_current_datetime(),
                )
            )

        # Generate AI's closing statement
        start_time = time.perf_counter()
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
        counter = await lawyer.closing_statement(
            ai_role, 
            case.user_role.value, 
            case_details=case.details,
            rag_context=closing_context,
            history=history if not settings.rag_enabled else None,
            evidence_context=format_evidence_context(case.evidence),
        )
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"AI closing statement generated in {duration_ms:.2f}ms")

        if role == "plaintiff":
            case.defendant_arguments.append(
                ArgumentItem(
                    type="closing",
                    content=counter,
                    user_id=None,
                    role=Roles.DEFENDANT,
                    timestamp=get_current_datetime(),
                )
            )
        else:
            case.plaintiff_arguments.append(
                ArgumentItem(
                    type="closing",
                    content=counter,
                    user_id=None,
                    role=Roles.PLAINTIFF,
                    timestamp=get_current_datetime(),
                )
            )

        case.status = CaseStatus.RESOLVED
    else:
        # Generate counter-argument
        start_time = time.perf_counter()
        try:
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
            counter = await lawyer.generate_counter_argument(
                argument,
                ai_role,
                case.user_role.value,
                case.details,
                rag_context=counter_context,
                history=history if not settings.rag_enabled else None,
                evidence_context=format_evidence_context(case.evidence),
            )
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info(
                f"Counter-argument generated for case {case_cnr} in {duration_ms:.2f}ms"
            )

            if counter.startswith(
                "I apologize, but I'm unable to generate a counter argument"
            ):
                logger.warning(f"LLM returned error response for case {case_cnr}")
                return {"error": counter}
        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.error(
                f"Counter-argument generation failed for case {case_cnr} after {duration_ms:.2f}ms: {str(e)}",
                exc_info=True,
            )
            return {
                "error": "I apologize, but I'm unable to generate a counter argument at this time. Please try again later."
            }

    if case.status == CaseStatus.NOT_STARTED:
        case.status = CaseStatus.ACTIVE

    # Add counter argument to appropriate side
    if (
        len(case.plaintiff_arguments) == 1
        and len(case.defendant_arguments) == 0
        and role == "plaintiff"
    ):
        case.defendant_arguments.append(
            ArgumentItem(
                type="opening",
                content=counter,
                user_id=None,
                role=Roles.DEFENDANT,
                timestamp=get_current_datetime(),
            )
        )

        case.courtroom_proceedings.append(
            CourtroomProceedingsEvent(
                type=CourtroomProceedingsEventType.OPENING_STATEMENT,
                content=counter,
                speaker_role="defendant",
                speaker_name="Defense Lawyer",
                timestamp=get_current_datetime(),
            )
        )
    else:
        if role == "plaintiff":
            case.defendant_arguments.append(
                ArgumentItem(
                    type="counter",
                    content=counter,
                    user_id=None,
                    role=Roles.DEFENDANT,
                    timestamp=get_current_datetime(),
                )
            )

            case.courtroom_proceedings.append(
                CourtroomProceedingsEvent(
                    type=CourtroomProceedingsEventType.AI_ARGUMENT,
                    content=counter,
                    speaker_role="defendant",
                    speaker_name="Defense Lawyer",
                    timestamp=get_current_datetime(),
                )
            )
        else:
            case.plaintiff_arguments.append(
                ArgumentItem(
                    type="counter",
                    content=counter,
                    user_id=None,
                    role=Roles.PLAINTIFF,
                    timestamp=get_current_datetime(),
                )
            )

            case.courtroom_proceedings.append(
                CourtroomProceedingsEvent(
                    type=CourtroomProceedingsEventType.AI_ARGUMENT,
                    content=counter,
                    speaker_role="plaintiff",
                    speaker_name="Plaintiff Lawyer",
                    timestamp=get_current_datetime(),
                )
            )

    await argument_rate_limiter.register_usage(str(current_user.id))

    try:
        await case.save()
        await upsert_memory_item(
            case,
            "argument",
            f"{role}_user_{len(case.plaintiff_arguments) + len(case.defendant_arguments)}",
            argument,
            {"side": role, "argument_type": "user", "role": role},
        )
        await upsert_memory_item(
            case,
            "argument",
            f"{ai_role}_ai_{len(case.plaintiff_arguments) + len(case.defendant_arguments)}",
            counter,
            {"side": ai_role, "argument_type": "counter", "role": ai_role},
        )
        logger.debug(f"Case {case_cnr} saved after argument submission")
    except Exception as e:
        logger.error(f"Error saving case {case_cnr}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500, detail="Failed to save case. Please try again."
        )

    # Prepare response
    response_data = {}

    if (
        len(case.plaintiff_arguments) == 1
        and len(case.defendant_arguments) == 1
        and role == "plaintiff"
        and case.defendant_arguments[0].type == "opening"
        and case.defendant_arguments[0].user_id is None
    ):
        response_data["ai_opening_statement"] = (
            case.defendant_arguments[0].content
            if isinstance(case.defendant_arguments[0], ArgumentItem)
            else case.defendant_arguments[0]["content"]
        )
        response_data["ai_opening_role"] = "defendant"
    elif (
        len(case.plaintiff_arguments) == 1
        and len(case.defendant_arguments) == 1
        and role == "defendant"
        and case.plaintiff_arguments[0].type == "opening"
        and case.plaintiff_arguments[0].user_id is None
    ):
        response_data["ai_opening_statement"] = (
            case.plaintiff_arguments[0].content
            if isinstance(case.plaintiff_arguments[0], ArgumentItem)
            else case.plaintiff_arguments[0]["content"]
        )
        response_data["ai_opening_role"] = "plaintiff"
        response_data["ai_counter_argument"] = counter
        response_data["ai_counter_role"] = ai_role
    else:
        response_data["ai_counter_argument"] = counter
        response_data["ai_counter_role"] = ai_role

    if role == "defendant" and len(case.defendant_arguments) > 1:
        response_data["ai_counter_argument"] = counter
        response_data["ai_counter_role"] = "plaintiff"

    logger.debug(f"Argument submission completed for case {case_cnr}")
    return response_data


@router.post("/{case_cnr}/proceedings/{event_id}/regenerate")
async def regenerate_short_llm_response(
    case_cnr: str,
    event_id: str,
    current_user: User = Depends(get_current_user),
):
    logger.info(f"Regenerating LLM response for case {case_cnr}, event {event_id}")

    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if str(case.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=403, detail="You don't have permission to access this case"
        )

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
            witness_party = get_party_by_id(case, event.witness_id or "")
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
                    question_event.speaker_role if (question_event and question_event.speaker_role) else ai_role
                ),
                question=question,
                case_details=case.details,
                examination_history=examination_history if not settings.rag_enabled else None,
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
    except Exception as e:
        logger.error(f"Failed to regenerate response: {str(e)}", exc_info=True)
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
    current_user: User = Depends(get_current_user),
):
    logger.info(f"Closing statement submission for case {case_cnr}, role={role}")

    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        logger.warning(f"Case not found: {case_cnr}")
        raise HTTPException(status_code=404, detail="Case not found")

    if str(case.user_id) != str(current_user.id):
        logger.warning(
            f"Unauthorized closing statement for case {case_cnr} by user: {current_user.email}"
        )
        raise HTTPException(
            status_code=403, detail="You don't have permission to access this case"
        )

    if role not in ["plaintiff", "defendant"]:
        raise HTTPException(status_code=400, detail="Invalid role specified")

    if (
        case.user_role
        and case.user_role != Roles.NOT_STARTED
        and case.user_role.value != role
    ):
        logger.warning(
            f"Role mismatch for closing statement: user_role={case.user_role.value}, requested={role}"
        )
        raise HTTPException(
            status_code=403,
            detail=f"Cannot submit as {role}. Your assigned role in this case is {case.user_role.value}",
        )

    # Check previous participation
    existing_roles = set()
    for arg in case.plaintiff_arguments:
        arg_user_id = (
            arg.user_id
            if isinstance(arg, ArgumentItem)
            else arg.get("user_id")
        )
        if arg_user_id is not None and str(arg_user_id) == str(current_user.id):
            existing_roles.add("plaintiff")
    for arg in case.defendant_arguments:
        arg_user_id = (
            arg.user_id
            if isinstance(arg, ArgumentItem)
            else arg.get("user_id")
        )
        if arg_user_id is not None and str(arg_user_id) == str(current_user.id):
            existing_roles.add("defendant")

    if existing_roles and role not in existing_roles:
        raise HTTPException(
            status_code=403,
            detail=f"Cannot switch roles. Previously participated as {', '.join(existing_roles)}",
        )

    user_id = current_user.id if current_user.id is not None else ""

    if role == "plaintiff":
        case.plaintiff_arguments.append(
            ArgumentItem(
                type="closing",
                content=statement,
                user_id=user_id,
                role=Roles.PLAINTIFF,
                timestamp=get_current_datetime(),
            )
        )
    else:
        case.defendant_arguments.append(
            ArgumentItem(
                type="closing",
                content=statement,
                user_id=user_id,
                role=Roles.DEFENDANT,
                timestamp=get_current_datetime(),
            )
        )

    try:
        await case.save()
        await upsert_memory_item(
            case,
            "argument",
            f"{role}_closing_user_{len(case.plaintiff_arguments) + len(case.defendant_arguments)}",
            statement,
            {"side": role, "argument_type": "closing", "role": role},
        )
    except Exception as e:
        logger.error(
            f"Error saving closing statement for case {case_cnr}: {str(e)}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to save closing statement. Please try again.",
        )

    # Prepare history for AI closing statement
    history = ""
    for arg in case.plaintiff_arguments:
        content = arg.content if isinstance(arg, ArgumentItem) else arg.get("content")
        arg_type = arg.type if isinstance(arg, ArgumentItem) else arg.get("type")
        if content:
            if arg_type == "plaintiff":
                history += f"Plaintiff: {content}\n"
            elif arg_type == "defendant":
                history += f"Defendant: {content}\n"
    for arg in case.defendant_arguments:
        content = arg.content if isinstance(arg, ArgumentItem) else arg.get("content")
        arg_type = arg.type if isinstance(arg, ArgumentItem) else arg.get("type")
        if content:
            if arg_type == "plaintiff":
                history += f"Plaintiff: {content}\n"
            elif arg_type == "defendant":
                history += f"Defendant: {content}\n"

    ai_role = "defendant" if role == "plaintiff" else "plaintiff"

    # Generate AI's closing statement
    start_time = time.perf_counter()
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
            case.user_role.value,
            case_details=case.details,
            rag_context=closing_context,
            history=history if not settings.rag_enabled else None,
            evidence_context=format_evidence_context(case.evidence),
        )
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(
            f"AI closing statement generated for case {case_cnr} in {duration_ms:.2f}ms"
        )
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(
            f"AI closing statement generation failed for case {case_cnr} after {duration_ms:.2f}ms: {str(e)}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to generate AI closing statement. Please try again.",
        )

    if role == "plaintiff":
        case.defendant_arguments.append(
            ArgumentItem(
                type="closing",
                content=ai_closing,
                user_id=None,
                role=Roles.DEFENDANT,
                timestamp=get_current_datetime(),
            )
        )
    else:
        case.plaintiff_arguments.append(
            ArgumentItem(
                type="closing",
                content=ai_closing,
                user_id=None,
                role=Roles.PLAINTIFF,
                timestamp=get_current_datetime(),
            )
        )

    # Collect arguments for verdict generation
    plaintiff_side_args = []
    defendant_side_args = []

    for arg in case.plaintiff_arguments:
        if isinstance(arg, ArgumentItem):
            if arg.type in ["user", "opening", "counter", "closing"]:
                if arg.role == Roles.PLAINTIFF:
                    plaintiff_side_args.append(str(arg.content))
                elif arg.role == Roles.DEFENDANT:
                    defendant_side_args.append(str(arg.content))
        elif isinstance(arg, dict):
            if arg.get("type") in ["user", "opening", "counter", "closing"]:
                if arg.get("role") == Roles.PLAINTIFF.value:
                    plaintiff_side_args.append(str(arg["content"]))
                elif arg.get("role") == Roles.DEFENDANT.value:
                    defendant_side_args.append(str(arg["content"]))

    for arg in case.defendant_arguments:
        if isinstance(arg, ArgumentItem):
            if arg.type in ["user", "opening", "counter", "closing"]:
                if arg.role == Roles.PLAINTIFF:
                    plaintiff_side_args.append(str(arg.content))
                elif arg.role == Roles.DEFENDANT:
                    defendant_side_args.append(str(arg.content))
        elif isinstance(arg, dict):
            if arg.get("type") in ["user", "opening", "counter", "closing"]:
                if arg.get("role") == Roles.PLAINTIFF.value:
                    plaintiff_side_args.append(str(arg["content"]))
                elif arg.get("role") == Roles.DEFENDANT.value:
                    defendant_side_args.append(str(arg["content"]))

    # Generate verdict
    start_time = time.perf_counter()
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
            plaintiff_arguments=plaintiff_side_args,
            defendant_arguments=defendant_side_args,
            case_details=case.details,
            title=case.title,
            rag_context=verdict_context,
            evidence_context=format_evidence_context(case.evidence),
        )
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"Verdict generated for case {case_cnr} in {duration_ms:.2f}ms")
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(
            f"Verdict generation failed for case {case_cnr} after {duration_ms:.2f}ms: {str(e)}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail="Failed to generate verdict. Please try again."
        )

    await argument_rate_limiter.register_usage(str(current_user.id))

    case.status = CaseStatus.RESOLVED
    try:
        await case.save()
        await upsert_memory_item(
            case,
            "argument",
            f"{ai_role}_closing_auto_{len(case.plaintiff_arguments) + len(case.defendant_arguments)}",
            ai_closing,
            {"side": ai_role, "argument_type": "closing", "role": ai_role},
        )
        await upsert_memory_item(
            case,
            "verdict",
            "verdict",
            case.verdict or "",
            {"title": case.title},
        )
        logger.info(f"Case {case_cnr} resolved with verdict")
    except Exception as e:
        logger.error(
            f"Error saving verdict for case {case_cnr}: {str(e)}", exc_info=True
        )
        raise HTTPException(
            status_code=500, detail="Failed to save verdict. Please try again."
        )

    return {
        "verdict": case.verdict,
        "ai_closing_statement": ai_closing,
        "ai_closing_role": ai_role,
    }
