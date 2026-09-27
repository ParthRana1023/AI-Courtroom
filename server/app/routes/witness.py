# app/routes/witness.py
"""
API routes for witness examination during courtroom sessions.
"""

import asyncio
import random
import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pymongo.results import UpdateResult

from app.config import settings
from app.dependencies import get_current_user, get_owned_case
from app.logging_config import get_logger
from app.models.case import (
    Case,
    CaseStatus,
    CourtroomProceedingsEvent,
    CourtroomProceedingsEventType,
    ExaminationItem,
    Roles,
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


@router.post("/{case_cnr}/witness/call")
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
        raise HTTPException(status_code=404, detail="Party not found")

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


@router.post("/{case_cnr}/witness/examine")
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
                "case_details",
                "evidence",
                "party_bio",
                "party_chat",
                "argument",
                "proceeding",
                "witness_testimony",
            ],
        )
        answer = await witness_service.examine_witness(
            witness_name=party.name,
            witness_role=party.role.value,
            witness_bio=party.bio or "",
            examiner_role=examiner_role,
            question=request.question,
            case_details=case.details,
            examination_history=exam_history if not settings.rag_enabled else None,
            rag_context=rag_context,
        )
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"Witness response generated in {duration_ms:.2f}ms")
    except Exception:
        logger.exception("Error generating witness response")
        raise HTTPException(
            status_code=500, detail="Failed to generate witness response"
        )

    # Create examination item
    exam_item = ExaminationItem(
        examiner=examiner_role, question=request.question, answer=answer
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

    return WitnessExaminationResponse(
        witness_id=party.id,
        witness_name=party.name,
        question=request.question,
        answer=answer,
        examination_id=exam_item.id,
        timestamp=exam_item.timestamp,
    )


async def process_ai_cross_examination(case_cnr: str, max_questions: int = 5):
    """
    Background task to run AI cross-examination sequentially with delays.
    Updates the database with new questions/answers and timeline events.
    """
    logger.info(f"Starting background AI cross-examination for case {case_cnr}")

    # Needs to re-fetch case inside background task to ensure fresh state
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        logger.error(f"Case {case_cnr} not found during background task")
        return

    if not case.current_witness_id:
        logger.info("No witness on stand, stopping background examination")
        await Case.find_one(Case.cnr == case_cnr).update_one(
            {"$set": {"is_ai_examining": False}}
        )
        return

    # Get the witness
    party = case.get_party(case.current_witness_id)
    if not party:
        await Case.find_one(Case.cnr == case_cnr).update_one(
            {"$set": {"is_ai_examining": False}}
        )
        return

    # AI role is opposite of user role unless specified
    ai_role = case.ai_role.value if case.ai_role != Roles.NOT_STARTED else "defendant"

    # Build arguments summary once
    arguments_summary = ""
    for arg in case.plaintiff_arguments[-3:]:
        arguments_summary += f"Plaintiff: {arg.content[:200]}...\n"
    for arg in case.defendant_arguments[-3:]:
        arguments_summary += f"Defendant: {arg.content[:200]}...\n"

    try:
        # Get current testimony
        testimony = get_current_testimony(case)
        if not testimony:
            # Should create one if missing? Or assume existing?
            # It should exist if current_witness_id is set.
            logger.error("No active testimony found")
            return

        # Determine how many questions AI has already asked in this session?
        # Typically we just ask 5 more or up to 5 total?
        # Requirement: "ask multiple questions sequentially... up to a maximum of 5 questions"
        # We'll treat this as a batch of 5 questions.

        # Randomize max questions to avoid predictability (e.g. 3-5)
        # Ensure at least 1 question
        questions_to_ask = random.randint(max(2, max_questions - 2), max_questions)

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

        for questions_asked_count in range(questions_to_ask):
            # Re-fetch case to check for interruptions and ensure we work on latest state
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

            # 1. Build history
            exam_history = [
                {"examiner": e.examiner, "question": e.question, "answer": e.answer}
                for e in testimony.examination
            ]

            # 2. Check if should continue
            if questions_asked_count > 0:  # Always ask at least one if triggered
                continue_context = await retrieve_case_context(
                    case,
                    f"continue cross examination of {party.name}",
                    source_types=[
                        "case_details",
                        "evidence",
                        "argument",
                        "witness_testimony",
                        "proceeding",
                    ],
                )
                should_continue = (
                    await witness_service.should_continue_cross_examination(
                        witness_name=party.name,
                        witness_role=party.role.value,
                        ai_lawyer_role=ai_role,
                        case_details=case.details,
                        testimony_so_far=exam_history,
                        questions_asked=questions_asked_count,
                        max_questions=max_questions,
                        rag_context=continue_context,
                    )
                )
                if not should_continue:
                    logger.info("AI decided to stop questioning")
                    break

            # 3. Generate Question
            try:
                question_context = await retrieve_case_context(
                    case,
                    f"{ai_role} cross examination question for {party.name}",
                    source_types=[
                        "case_details",
                        "evidence",
                        "party_bio",
                        "argument",
                        "witness_testimony",
                        "proceeding",
                    ],
                )
                question = await witness_service.generate_cross_examination_questions(
                    witness_name=party.name,
                    witness_role=party.role.value,
                    ai_lawyer_role=ai_role,
                    case_details=case.details,
                    testimony_so_far=exam_history,
                    case_arguments=arguments_summary,
                    rag_context=question_context,
                )
            except Exception:
                logger.exception("Error generating question")
                break

            # 4. Generate Answer (Simulate witness thinking)
            # Add delay BEFORE answer? Or before question?
            # User wants "delay in ai lawyer asking questions AND witness responses"
            # "add a 3 second delay between each question and response"

            # Step A: Post Question to Timeline?
            # Ideally: AI asks (Event) -> Delay -> Witness Answers (Event) -> Delay -> Next Q

            # Save Question Event
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
                    f"witness {party.name} answer cross examination: {question}",
                    source_types=[
                        "case_details",
                        "evidence",
                        "party_bio",
                        "party_chat",
                        "argument",
                        "witness_testimony",
                        "proceeding",
                    ],
                )
                answer = await witness_service.examine_witness(
                    witness_name=party.name,
                    witness_role=party.role.value,
                    witness_bio=party.bio or "",
                    examiner_role=ai_role,
                    question=question,
                    case_details=case.details,
                    examination_history=(
                        exam_history
                        + [{"examiner": ai_role, "question": question, "answer": ""}]
                        if not settings.rag_enabled
                        else None
                    ),
                    rag_context=answer_context,
                )
            except Exception:
                logger.exception("Error generating answer")
                break

            # The answer is generated immediately, but only becomes visible after
            # the court-style pause requested by the user.
            await asyncio.sleep(3)

            # Save Answer Event and Examination Item
            exam_item = ExaminationItem(
                examiner=ai_role, question=question, answer=answer
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
        done_event = CourtroomProceedingsEvent(
            type=CourtroomProceedingsEventType.SYSTEM_MESSAGE,
            timestamp=get_current_datetime(),
            content="Cross-examination completed.",
        )
        await Case.find_one(Case.cnr == case_cnr).update_one(
            {
                "$set": {"is_ai_examining": False},
                "$push": {"courtroom_proceedings": done_event},
            }
        )
        logger.info("Background examination finished")


@router.post("/{case_cnr}/witness/ai-cross-examine")
async def ai_cross_examine_witness(
    case_cnr: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """AI lawyer performs full cross-examination with multiple questions (Background Task)"""
    logger.info(f"AI starting cross-examination for case {case_cnr}")

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

    # Set flag and start background task
    case.is_ai_examining = True
    await case.save()

    background_tasks.add_task(process_ai_cross_examination, case_cnr, 5)

    # Return immediate response
    # We return an empty list of examinations because they will be generated in background
    # The frontend should see 'state'="ai_cross_examining" and refresh witness state
    party = case.get_party(case.current_witness_id)
    if not party:
        raise HTTPException(status_code=404, detail="Current witness not found")

    return AICrossExaminationResponse(
        witness_id=party.id,
        witness_name=party.name,
        examinations=[],
        total_questions=0,
        state="ai_cross_examining",
    )


@router.post("/{case_cnr}/witness/conclude")
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


@router.post("/{case_cnr}/witness/dismiss")
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


@router.post("/{case_cnr}/witness/ai-call")
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
                    "case_details",
                    "evidence",
                    "party_bio",
                    "argument",
                    "proceeding",
                    "party_chat",
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

                # Auto-start AI examination so it questions the witness first
                case.is_ai_examining = True
                await case.save()

                background_tasks.add_task(process_ai_cross_examination, case_cnr, 5)

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
