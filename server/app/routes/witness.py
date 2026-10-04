# app/routes/witness.py
"""
API routes for witness examination during courtroom sessions.
"""

import asyncio
import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pymongo.results import UpdateResult

from app import messages
from app.config import settings
from app.dependencies import courtroom_control, get_current_user, get_owned_case
from app.logging_config import get_logger
from app.models.case import (
    Case,
    CaseStatus,
    CourtroomProceedingsEvent,
    CourtroomProceedingsEventType,
    ExaminationItem,
    Roles,
    WitnessPhase,
    WitnessTestimony,
)
from app.models.user import User
from app.schemas.witness import (
    AICrossExaminationResponse,
    AllTestimoniesResponse,
    AvailableWitnessesResponse,
    CallWitnessRequest,
    CallWitnessResponse,
    ConcludeWitnessResponse,
    CurrentWitnessResponse,
    ExaminationItemResponse,
    ExamineWitnessRequest,
    WitnessExaminationResponse,
    WitnessInfo,
    WitnessTestimonyResponse,
)
from app.services.llm import witness_service
from app.services.rag import retrieve_case_context, upsert_memory_item
from app.utils.datetime import get_current_datetime
from app.utils.llm import LLMGenerationError
from app.utils.rate_limiter import witness_question_limiter_for

logger = get_logger(__name__)
MIN_ARGUMENTS_BETWEEN_AI_WITNESS_CHECKS = 2

router = APIRouter()


def get_current_testimony(case: Case) -> WitnessTestimony | None:
    """Get the current active testimony session"""
    if not case.current_witness_id:
        return None
    for testimony in case.witness_testimonies:
        if (
            testimony.witness_id == case.current_witness_id
            and testimony.ended_at is None
        ):
            return testimony
    return None


def count_arguments_since_last_witness_activity(case: Case) -> int:
    """Count user courtroom statements since the latest witness activity."""
    count = 0
    user_role = case.user_role.value if case.user_role != Roles.NOT_STARTED else None

    for event in reversed(case.courtroom_proceedings):
        if event.type in {
            CourtroomProceedingsEventType.WITNESS_CALLED,
            CourtroomProceedingsEventType.WITNESS_DISMISSED,
        }:
            break

        if event.type == CourtroomProceedingsEventType.ARGUMENT or (
            event.type == CourtroomProceedingsEventType.OPENING_STATEMENT
            and event.speaker_role == user_role
        ):
            count += 1

    return count


@router.get("/{case_cnr}/witness/available")
async def get_available_witnesses(
    case_cnr: str, current_user: User = Depends(get_current_user)
) -> AvailableWitnessesResponse:
    """Get list of available witnesses (parties) for the case"""
    logger.info(f"Getting available witnesses for case {case_cnr}")

    case = await get_owned_case(case_cnr, current_user)

    # Get IDs of witnesses who have already testified
    testified_ids = {t.witness_id for t in case.witness_testimonies}

    witnesses = []
    for party in case.parties_involved:
        witnesses.append(
            WitnessInfo(
                id=party.id,
                name=party.name,
                role=party.role.value,
                has_testified=party.id in testified_ids,
            )
        )

    return AvailableWitnessesResponse(
        witnesses=witnesses, current_witness_id=case.current_witness_id
    )


@router.post("/{case_cnr}/witness/call", dependencies=[Depends(courtroom_control)])
async def call_witness(
    case_cnr: str,
    request: CallWitnessRequest,
    current_user: User = Depends(get_current_user),
) -> CallWitnessResponse:
    """Call a witness to the stand"""
    logger.info(f"Calling witness {request.witness_id} for case {case_cnr}")

    case = await get_owned_case(case_cnr, current_user)

    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(
            status_code=400,
            detail="Can only call witnesses during an active courtroom session",
        )

    if case.current_witness_id:
        raise HTTPException(
            status_code=400,
            detail="A witness is already on the stand. Dismiss them first.",
        )

    # Find the party
    party = case.get_party(request.witness_id)
    if not party:
        raise HTTPException(status_code=404, detail=messages.PARTY_NOT_FOUND)

    # Determine who is calling (user's role)
    caller_role = (
        case.user_role.value if case.user_role != Roles.NOT_STARTED else "plaintiff"
    )

    # Create new testimony session
    testimony = WitnessTestimony(
        witness_id=party.id, witness_name=party.name, called_by=caller_role
    )

    case.witness_testimonies.append(testimony)
    case.current_witness_id = party.id

    case.courtroom_proceedings.append(
        CourtroomProceedingsEvent(
            type=CourtroomProceedingsEventType.WITNESS_CALLED,
            content=f"{party.name} called to the witness stand by {caller_role}.",
            speaker_role=caller_role,
            speaker_name=party.name,
            witness_id=party.id,
            timestamp=get_current_datetime(),
        )
    )

    try:
        await case.save()
        logger.info(f"Witness {party.name} called to the stand by {caller_role}")
    except Exception:
        logger.exception("Error calling witness")
        raise HTTPException(status_code=500, detail="Failed to call witness")

    return CallWitnessResponse(
        success=True,
        witness_id=party.id,
        witness_name=party.name,
        witness_role=party.role.value,
        message=f"{party.name} has been called to the witness stand.",
    )


@router.post("/{case_cnr}/witness/examine", dependencies=[Depends(courtroom_control)])
async def examine_witness(
    case_cnr: str,
    request: ExamineWitnessRequest,
    current_user: User = Depends(get_current_user),
) -> WitnessExaminationResponse:
    """Examine the current witness with a question"""
    logger.info(f"Examining witness for case {case_cnr}")

    case = await get_owned_case(case_cnr, current_user)

    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(
            status_code=400,
            detail="Can only examine witnesses during an active courtroom session",
        )

    if not case.current_witness_id:
        raise HTTPException(
            status_code=400, detail="No witness is currently on the stand"
        )

    # Get current testimony
    testimony = get_current_testimony(case)
    if not testimony:
        raise HTTPException(status_code=400, detail="No active testimony session found")

    # Get the witness (party)
    party = case.get_party(case.current_witness_id)
    if not party:
        raise HTTPException(status_code=404, detail="Witness not found")

    # Determine examiner role
    examiner_role = (
        case.user_role.value if case.user_role != Roles.NOT_STARTED else "plaintiff"
    )
    if case.is_ai_examining or testimony.examining_side() != examiner_role:
        raise HTTPException(
            status_code=409, detail="It is not your turn to examine the witness."
        )

    # Each question is an AI call, so users get a daily allowance.
    limiter = witness_question_limiter_for(current_user)
    await limiter.check_only(current_user)

    # Build examination history for context
    exam_history = [
        {"examiner": e.examiner, "question": e.question, "answer": e.answer}
        for e in testimony.examination
    ]

    # Generate witness response
    start_time = time.perf_counter()
    try:
        rag_context = await retrieve_case_context(
            case,
            f"witness {party.name} answer question: {request.question}",
            source_types=[
                "ai_party_chat",
                "case_details",
                "evidence",
                "party_bio",
                "party_chat",
                "argument",
                "proceeding",
                "witness_testimony",
            ],
            party_id=party.id,  # a witness knows only its own conversations
        )
        answer = await witness_service.examine_witness(
            witness_name=party.name,
            witness_role=party.role.value,
            witness_bio=party.bio or "",
            examiner_role=examiner_role,
            question=request.question,
            case_details=case.details,
            examination_history=exam_history[-settings.witness_history_limit :],
            rag_context=rag_context,
        )
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"Witness response generated in {duration_ms:.2f}ms")
    except LLMGenerationError:
        raise
    except Exception:
        logger.exception("Error generating witness response")
        raise HTTPException(
            status_code=500, detail="Failed to generate witness response"
        )

    # Create examination item
    exam_item = ExaminationItem(
        examiner=examiner_role,
        question=request.question,
        answer=answer,
        phase=testimony.phase,
    )

    # Add to testimony - find the right testimony in the list
    for i, t in enumerate(case.witness_testimonies):
        if t.id == testimony.id:
            case.witness_testimonies[i].examination.append(exam_item)
            break

    # Add events to proceedings
    case.courtroom_proceedings.append(
        CourtroomProceedingsEvent(
            type=CourtroomProceedingsEventType.WITNESS_EXAMINED_Q,
            content=request.question,
            speaker_role=examiner_role,
            speaker_name=f"{current_user.first_name} {current_user.last_name}",
            witness_id=party.id,
            question=request.question,
            timestamp=get_current_datetime(),
        )
    )

    case.courtroom_proceedings.append(
        CourtroomProceedingsEvent(
            type=CourtroomProceedingsEventType.WITNESS_EXAMINED_A,
            content=answer,
            speaker_role=party.role.value,
            speaker_name=party.name,
            witness_id=party.id,
            answer=answer,
            timestamp=get_current_datetime(),
        )
    )

    try:
        await case.save()
        await upsert_memory_item(
            case,
            "witness_testimony",
            exam_item.id,
            f"Q: {request.question}\nA: {answer}",
            {
                "witness_id": party.id,
                "witness_name": party.name,
                "examiner": examiner_role,
            },
        )
        await upsert_memory_item(
            case,
            "proceeding",
            case.courtroom_proceedings[-2].id,
            request.question,
            {
                "event_type": "witness_examined_q",
                "speaker_role": examiner_role,
                "witness_id": party.id,
            },
        )
        await upsert_memory_item(
            case,
            "proceeding",
            case.courtroom_proceedings[-1].id,
            answer,
            {
                "event_type": "witness_examined_a",
                "speaker_role": party.role.value,
                "witness_id": party.id,
            },
        )
    except Exception:
        logger.exception("Error saving examination")
        raise HTTPException(status_code=500, detail="Failed to save examination")

    await limiter.register_usage(str(current_user.id))

    return WitnessExaminationResponse(
        witness_id=party.id,
        witness_name=party.name,
        question=request.question,
        answer=answer,
        examination_id=exam_item.id,
        timestamp=exam_item.timestamp,
    )


# (min, max) questions the AI asks in each phase; within these it decides itself.
AI_QUESTION_BOUNDS = {
    WitnessPhase.CHIEF: (3, 5),
    WitnessPhase.CROSS: (0, 4),
    WitnessPhase.RE_EXAM: (0, 4),
}
PHASE_NAMES = {
    WitnessPhase.CHIEF: "Examination-in-chief",
    WitnessPhase.CROSS: "Cross-examination",
    WitnessPhase.RE_EXAM: "Re-examination",
}


def dismissal_event(
    witness_id: str, name: str, reason: str
) -> CourtroomProceedingsEvent:
    return CourtroomProceedingsEvent(
        type=CourtroomProceedingsEventType.WITNESS_DISMISSED,
        content=f"{name} dismissed from the stand{reason}.",
        speaker_role="judge",
        speaker_name="Judge",
        witness_id=witness_id,
        timestamp=get_current_datetime(),
    )


async def finish_ai_turn(case_cnr: str, witness_id: str, testimony_id: str) -> None:
    """After the AI's turn: hand the witness to the user, or discharge them.

    One atomic update guarded by "same witness, AI still examining", so it never
    undoes a dismissal the user made meanwhile. (The background task can't take
    case_lock: the request that started it still holds it.)
    """
    guard = {
        "cnr": case_cnr,
        "current_witness_id": witness_id,
        "is_ai_examining": True,
    }
    case = await Case.find_one(Case.cnr == case_cnr)
    found = next(
        (
            (i, t)
            for i, t in enumerate(case.witness_testimonies if case else [])
            if t.id == testimony_id
        ),
        None,
    )
    if found is None:
        await Case.find_one(guard).update_one({"$set": {"is_ai_examining": False}})
        return
    index, testimony = found

    done = CourtroomProceedingsEvent(
        type=CourtroomProceedingsEventType.SYSTEM_MESSAGE,
        timestamp=get_current_datetime(),
        content=f"{PHASE_NAMES[testimony.phase]} completed.",
    )
    next_phase = testimony.phase_after_this_turn()
    if next_phase is None:
        dismissed = dismissal_event(
            witness_id, testimony.witness_name, " as the examination is complete"
        )
        await Case.find_one(guard).update_one(
            {
                "$set": {
                    "is_ai_examining": False,
                    "current_witness_id": None,
                    f"witness_testimonies.{index}.ended_at": get_current_datetime(),
                },
                "$push": {"courtroom_proceedings": {"$each": [done, dismissed]}},
            }
        )
        return
    await Case.find_one(guard).update_one(
        {
            "$set": {
                "is_ai_examining": False,
                f"witness_testimonies.{index}.phase": next_phase,
            },
            "$push": {"courtroom_proceedings": done},
        }
    )


async def process_ai_examination(case_cnr: str):
    """Background task: the AI examines the witness for the current phase.

    The AI asks between the phase's minimum and maximum questions, deciding itself
    when to stop, then finish_ai_turn hands over or discharges the witness.
    """
    logger.info(f"Starting background AI examination for case {case_cnr}")

    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        logger.error(f"Case {case_cnr} not found during background task")
        return

    party = case.get_party(case.current_witness_id)
    testimony = get_current_testimony(case)
    if not case.current_witness_id or not party or not testimony:
        logger.info("No witness or testimony on the stand, stopping AI examination")
        await Case.find_one(Case.cnr == case_cnr).update_one(
            {"$set": {"is_ai_examining": False}}
        )
        return

    ai_role = case.ai_role.value if case.ai_role != Roles.NOT_STARTED else "defendant"
    phase = testimony.phase
    testimony_id = testimony.id
    min_questions, max_questions = AI_QUESTION_BOUNDS[phase]

    arguments_summary = ""
    for arg in case.plaintiff_arguments[-3:]:
        arguments_summary += f"Plaintiff: {arg.content[:200]}...\n"
    for arg in case.defendant_arguments[-3:]:
        arguments_summary += f"Defendant: {arg.content[:200]}...\n"

    initial_witness_id = case.current_witness_id
    # Writes below are atomic appends that only apply while this witness is
    # still on the stand and the AI flag is still set. Saving the whole
    # (stale) case would undo anything the user did meanwhile, e.g. a
    # dismissal would put the witness back on the stand.
    still_examining = {
        "cnr": case_cnr,
        "current_witness_id": initial_witness_id,
        "is_ai_examining": True,
    }

    try:
        for asked in range(max_questions):
            case = await Case.find_one(Case.cnr == case_cnr)
            if not case or case.current_witness_id != initial_witness_id:
                logger.info("Witness changed or dismissed, stopping AI examination")
                break
            if not case.is_ai_examining:
                logger.info("AI examination flag cleared, stopping")
                break
            testimony = get_current_testimony(case)
            if not testimony:
                logger.error("No active testimony found during AI examination")
                break

            exam_history = [
                {
                    "examiner": e.examiner,
                    "question": e.question,
                    "answer": e.answer,
                    "phase": e.phase.value if e.phase else None,
                }
                for e in testimony.examination
            ]

            question_context = await retrieve_case_context(
                case,
                f"{ai_role} {phase.value} question for {party.name}",
                source_types=[
                    "ai_party_chat",
                    "case_details",
                    "evidence",
                    "party_bio",
                    "argument",
                    "witness_testimony",
                    "proceeding",
                ],
            )
            question = await witness_service.generate_witness_question(
                witness_name=party.name,
                witness_role=party.role.value,
                ai_lawyer_role=ai_role,
                case_details=case.details,
                testimony_so_far=exam_history,
                phase=phase.value,
                can_stop=asked >= min_questions,
                case_arguments=arguments_summary,
                rag_context=question_context,
            )
            if not question:
                logger.info(f"AI ended {phase.value} after {asked} question(s)")
                break

            q_event = CourtroomProceedingsEvent(
                type=CourtroomProceedingsEventType.WITNESS_EXAMINED_Q,
                timestamp=get_current_datetime(),
                content=question,
                speaker_role=ai_role,
                speaker_name="AI Lawyer",
                witness_id=party.id,
                question=question,
            )
            result = await Case.find_one(still_examining).update_one(
                {"$push": {"courtroom_proceedings": q_event}}
            )
            if not isinstance(result, UpdateResult) or not result.modified_count:
                logger.info("AI examination was stopped meanwhile, discarding question")
                break
            await upsert_memory_item(
                case,
                "proceeding",
                q_event.id,
                question,
                {
                    "event_type": q_event.type.value,
                    "speaker_role": ai_role,
                    "witness_id": party.id,
                },
            )

            try:
                answer_context = await retrieve_case_context(
                    case,
                    f"witness {party.name} answer {phase.value} question: {question}",
                    source_types=[
                        "ai_party_chat",
                        "case_details",
                        "evidence",
                        "party_bio",
                        "party_chat",
                        "argument",
                        "witness_testimony",
                        "proceeding",
                    ],
                    party_id=party.id,  # a witness knows only its own conversations
                )
                answer = await witness_service.examine_witness(
                    witness_name=party.name,
                    witness_role=party.role.value,
                    witness_bio=party.bio or "",
                    examiner_role=ai_role,
                    question=question,
                    case_details=case.details,
                    examination_history=(
                        exam_history[-settings.witness_history_limit :]
                        + [{"examiner": ai_role, "question": question, "answer": ""}]
                    ),
                    rag_context=answer_context,
                )
            except Exception:
                logger.exception("Error generating answer")
                break

            # The answer is generated immediately, but only becomes visible after
            # a court-style pause.
            await asyncio.sleep(3)

            exam_item = ExaminationItem(
                examiner=ai_role, question=question, answer=answer, phase=phase
            )
            a_event = CourtroomProceedingsEvent(
                type=CourtroomProceedingsEventType.WITNESS_EXAMINED_A,
                timestamp=get_current_datetime(),
                content=answer,
                speaker_role=party.role.value,
                speaker_name=party.name,
                witness_id=party.id,
                answer=answer,
            )
            # Address the testimony by index, guarded by its id (works on MongoDB
            # and mongomock, which lacks the "$" positional operator).
            index = next(
                i
                for i, t in enumerate(case.witness_testimonies)
                if t.id == testimony.id
            )
            result = await Case.find_one(
                {**still_examining, f"witness_testimonies.{index}.id": testimony.id}
            ).update_one(
                {
                    "$push": {
                        "courtroom_proceedings": a_event,
                        f"witness_testimonies.{index}.examination": exam_item,
                    }
                }
            )
            if not isinstance(result, UpdateResult) or not result.modified_count:
                logger.info("AI examination was stopped meanwhile, discarding answer")
                break
            await upsert_memory_item(
                case,
                "witness_testimony",
                exam_item.id,
                f"Q: {question}\nA: {answer}",
                {
                    "witness_id": party.id,
                    "witness_name": party.name,
                    "examiner": ai_role,
                },
            )
            await upsert_memory_item(
                case,
                "proceeding",
                a_event.id,
                answer,
                {
                    "event_type": a_event.type.value,
                    "speaker_role": party.role.value,
                    "witness_id": party.id,
                },
            )
    except Exception:
        logger.exception("Error in background examination")
    finally:
        await finish_ai_turn(case_cnr, initial_witness_id, testimony_id)
        logger.info("Background examination finished")


@router.post(
    "/{case_cnr}/witness/ai-cross-examine", dependencies=[Depends(courtroom_control)]
)
async def ai_cross_examine_witness(
    case_cnr: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """The user has finished their turn with the witness.

    Moves to the next phase (chief -> cross -> re-examination). If it is the AI's
    turn, the AI examines in the background; if nothing is left (the user's
    re-examination ended, or the AI's witness was not cross-examined), the
    witness is discharged.
    """
    logger.info(f"User finished their turn with the witness in case {case_cnr}")

    case = await get_owned_case(case_cnr, current_user)

    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(
            status_code=400,
            detail="Can only examine witnesses during an active courtroom session",
        )

    if not case.current_witness_id:
        raise HTTPException(
            status_code=400, detail="No witness is currently on the stand"
        )

    if case.is_ai_examining:
        raise HTTPException(
            status_code=400, detail="AI is already examining the witness"
        )

    party = case.get_party(case.current_witness_id)
    testimony = get_current_testimony(case)
    if not party or not testimony:
        raise HTTPException(status_code=404, detail="Current witness not found")

    user_role = (
        case.user_role.value if case.user_role != Roles.NOT_STARTED else "plaintiff"
    )
    if testimony.examining_side() != user_role:
        raise HTTPException(
            status_code=409, detail="It is not your turn to examine the witness."
        )

    next_phase = testimony.phase_after_this_turn()
    if next_phase is None:
        case.dismiss_current_witness(" as the examination is complete")
        await case.save()
        return AICrossExaminationResponse(
            witness_id=party.id,
            witness_name=party.name,
            examinations=[],
            total_questions=0,
            state="concluded",
        )

    testimony.phase = next_phase
    case.is_ai_examining = True
    await case.save()
    background_tasks.add_task(process_ai_examination, case_cnr)

    # The frontend sees state="ai_cross_examining" and polls the witness state.
    return AICrossExaminationResponse(
        witness_id=party.id,
        witness_name=party.name,
        examinations=[],
        total_questions=0,
        state="ai_cross_examining",
    )


@router.post("/{case_cnr}/witness/conclude", dependencies=[Depends(courtroom_control)])
async def conclude_witness(
    case_cnr: str, current_user: User = Depends(get_current_user)
):
    """User concludes their examination - witness is dismissed by the judge"""
    logger.info(f"Concluding witness examination for case {case_cnr}")

    case = await get_owned_case(case_cnr, current_user)

    witness_id = case.current_witness_id
    if not witness_id:
        raise HTTPException(
            status_code=400, detail="No witness is currently on the stand"
        )

    _, witness_name, total_questions = case.dismiss_current_witness()

    try:
        await case.save()
        logger.info(
            f"Witness {witness_name} examination concluded with {total_questions} questions"
        )
    except Exception:
        logger.exception("Error concluding witness")
        raise HTTPException(
            status_code=500, detail="Failed to conclude witness examination"
        )

    return ConcludeWitnessResponse(
        success=True,
        witness_id=witness_id,
        witness_name=witness_name,
        total_questions_asked=total_questions,
        message=f"The court thanks {witness_name} for their testimony. The witness is dismissed.",
    )


@router.post("/{case_cnr}/witness/dismiss", dependencies=[Depends(courtroom_control)])
async def dismiss_witness(
    case_cnr: str, current_user: User = Depends(get_current_user)
):
    """Dismiss the current witness from the stand"""
    logger.info(f"Dismissing witness for case {case_cnr}")

    case = await get_owned_case(case_cnr, current_user)

    if not case.current_witness_id:
        raise HTTPException(
            status_code=400, detail="No witness is currently on the stand"
        )

    _, witness_name, _ = case.dismiss_current_witness()

    try:
        await case.save()
        logger.info(f"Witness {witness_name} dismissed from the stand")
    except Exception:
        logger.exception("Error dismissing witness")
        raise HTTPException(status_code=500, detail="Failed to dismiss witness")

    return {
        "success": True,
        "message": f"{witness_name} has been dismissed from the stand.",
    }


@router.get("/{case_cnr}/witness/current")
async def get_current_witness(
    case_cnr: str, current_user: User = Depends(get_current_user)
) -> CurrentWitnessResponse:
    """Get the current witness examination state"""
    logger.debug(f"Getting current witness for case {case_cnr}")

    case = await get_owned_case(case_cnr, current_user)

    if not case.current_witness_id:
        return CurrentWitnessResponse(
            has_witness=False, is_ai_examining=case.is_ai_examining
        )

    party = case.get_party(case.current_witness_id)
    testimony = get_current_testimony(case)

    if not party or not testimony:
        return CurrentWitnessResponse(
            has_witness=False, is_ai_examining=case.is_ai_examining
        )

    examination_history = [
        ExaminationItemResponse(
            id=e.id,
            examiner=e.examiner,
            question=e.question,
            answer=e.answer,
            objection=e.objection,
            objection_ruling=e.objection_ruling,
            timestamp=e.timestamp,
            phase=e.phase.value if e.phase else None,
        )
        for e in testimony.examination
    ]

    if case.is_ai_examining:
        latest_witness_event = next(
            (
                event
                for event in reversed(case.courtroom_proceedings)
                if event.witness_id == party.id
                and event.type
                in {
                    CourtroomProceedingsEventType.WITNESS_EXAMINED_Q,
                    CourtroomProceedingsEventType.WITNESS_EXAMINED_A,
                }
            ),
            None,
        )

        if (
            latest_witness_event
            and latest_witness_event.type
            == CourtroomProceedingsEventType.WITNESS_EXAMINED_Q
        ):
            examination_history.append(
                ExaminationItemResponse(
                    id=latest_witness_event.id,
                    examiner=latest_witness_event.speaker_role or "opposition",
                    question=latest_witness_event.question
                    or latest_witness_event.content
                    or "",
                    answer="",
                    timestamp=latest_witness_event.timestamp,
                )
            )

    return CurrentWitnessResponse(
        has_witness=True,
        witness_id=party.id,
        witness_name=party.name,
        witness_role=party.role.value,
        called_by=testimony.called_by,
        examination_history=examination_history,
        is_ai_examining=case.is_ai_examining,
        phase=testimony.phase.value,
        next_examiner=testimony.examining_side(),
    )


@router.get("/{case_cnr}/witness/testimonies")
async def get_all_testimonies(
    case_cnr: str, current_user: User = Depends(get_current_user)
) -> AllTestimoniesResponse:
    """Get all witness testimonies for the case"""
    logger.debug(f"Getting all testimonies for case {case_cnr}")

    case = await get_owned_case(case_cnr, current_user)

    testimonies = []
    for t in case.witness_testimonies:
        examination = [
            ExaminationItemResponse(
                id=e.id,
                examiner=e.examiner,
                question=e.question,
                answer=e.answer,
                objection=e.objection,
                objection_ruling=e.objection_ruling,
                timestamp=e.timestamp,
            )
            for e in t.examination
        ]
        testimonies.append(
            WitnessTestimonyResponse(
                id=t.id,
                witness_id=t.witness_id,
                witness_name=t.witness_name,
                called_by=t.called_by,
                examination=examination,
                started_at=t.started_at,
                ended_at=t.ended_at,
            )
        )

    return AllTestimoniesResponse(testimonies=testimonies)


@router.post("/{case_cnr}/witness/ai-call", dependencies=[Depends(courtroom_control)])
async def ai_call_witness(
    case_cnr: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """AI lawyer strategically decides whether to call a witness"""
    logger.info(f"AI evaluating whether to call a witness for case {case_cnr}")

    case = await get_owned_case(case_cnr, current_user)

    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(
            status_code=400,
            detail="Can only call witnesses during an active courtroom session",
        )

    if case.is_ai_examining:
        raise HTTPException(status_code=409, detail="AI is already examining a witness")

    if case.current_witness_id:
        return {"should_call": False, "reason": "A witness is already on the stand"}

    arguments_since_witness = count_arguments_since_last_witness_activity(case)
    if arguments_since_witness < MIN_ARGUMENTS_BETWEEN_AI_WITNESS_CHECKS:
        return {
            "should_call": False,
            "reason": (
                "Skipping witness evaluation until more arguments are presented"
            ),
        }

    # Get AI role
    ai_role = case.ai_role.value if case.ai_role != Roles.NOT_STARTED else "defendant"

    # Get available witnesses
    testified_ids = {t.witness_id for t in case.witness_testimonies}
    available_witnesses = [
        {"id": p.id, "name": p.name, "role": p.role.value, "bio": p.bio or ""}
        for p in case.parties_involved
        if p.id not in testified_ids
    ]

    if not available_witnesses:
        return {"should_call": False, "reason": "No untestified witnesses available"}

    # Build arguments summary
    arguments_summary = ""
    for arg in case.plaintiff_arguments[-5:]:
        arguments_summary += f"Plaintiff: {arg.content[:200]}...\n"
    for arg in case.defendant_arguments[-5:]:
        arguments_summary += f"Defendant: {arg.content[:200]}...\n"

    # Ask AI if it should call a witness
    try:
        witness_id = await witness_service.should_ai_call_witness(
            ai_role=ai_role,
            case_details=case.details,
            arguments_history=arguments_summary,
            available_witnesses=available_witnesses,
            testimonies_given=list(testified_ids),
            rag_context=await retrieve_case_context(
                case,
                f"{ai_role} decide whether to call a witness",
                source_types=[
                    "ai_party_chat",
                    "case_details",
                    "evidence",
                    "party_bio",
                    "argument",
                    "proceeding",
                ],
            ),
        )

        if witness_id:
            # Find the witness name
            witness_name = None
            witness_role = None
            for w in available_witnesses:
                if w["id"] == witness_id:
                    witness_name = w["name"]
                    witness_role = w["role"]
                    break

            # Actually call the witness
            party = case.get_party(witness_id)
            if party:
                testimony = WitnessTestimony(
                    witness_id=party.id, witness_name=party.name, called_by=ai_role
                )
                case.witness_testimonies.append(testimony)
                case.current_witness_id = party.id
                case.courtroom_proceedings.append(
                    CourtroomProceedingsEvent(
                        type=CourtroomProceedingsEventType.WITNESS_CALLED,
                        content=f"{party.name} called to the witness stand by {ai_role}.",
                        speaker_role=ai_role,
                        speaker_name=party.name,
                        witness_id=party.id,
                        timestamp=get_current_datetime(),
                    )
                )

                # The AI called the witness, so it examines in chief first.
                case.is_ai_examining = True
                await case.save()

                background_tasks.add_task(process_ai_examination, case_cnr)

                logger.info(
                    f"AI called witness: {witness_name}, auto-starting AI examination"
                )
                return {
                    "should_call": True,
                    "witness_id": witness_id,
                    "witness_name": witness_name,
                    "witness_role": witness_role,
                    "called_by": ai_role,
                    "message": f"The {ai_role}'s lawyer calls {witness_name} to the witness stand.",
                }

        return {
            "should_call": False,
            "reason": "AI decided not to call a witness at this time",
        }
    except Exception:
        logger.exception("Error in AI witness decision")
        return {"should_call": False, "reason": "Error evaluating witness strategy"}
