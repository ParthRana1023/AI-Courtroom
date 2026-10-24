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
from app.dependencies import controls_hearing, get_current_user, get_owned_case
from app.logging_config import get_logger
from app.models.case import (
    Case,
    CaseStatus,
    CourtroomProceedingsEvent,
    CourtroomProceedingsEventType,
    ExaminationItem,
    PendingLeave,
    Roles,
    WitnessPhase,
    WitnessTestimony,
)
from app.models.user import User
from app.routes.arguments import cited_exhibits, exhibit_note, refs_in
from app.routes.courtroom import (
    AI_SPEAKER,
    ai_may_object,
    ai_objects_now,
    check_grounds,
    drop,
    objection_events,
    record_lines,
    ruling_memory,
    show_ai_objection,
)
from app.schemas.witness import (
    AICrossExaminationResponse,
    CallWitnessRequest,
    CallWitnessResponse,
    ConcludeWitnessResponse,
    CurrentWitnessResponse,
    ExaminationItemResponse,
    ExamineWitnessRequest,
    LeaveResponseRequest,
    WitnessExaminationResponse,
)
from app.services.evidence_service import (
    extract_evidence_from_text,
    format_evidence_context,
    index_evidence_item,
    next_exhibit_ref,
    tender_exhibits,
)
from app.services.llm import judge, lawyer, witness_service
from app.services.rag import retrieve_case_context, upsert_memory_item
from app.utils.datetime import get_current_datetime
from app.utils.llm import LLMGenerationError, pick_case_context
from app.utils.rate_limiter import (
    witness_question_limiter_for,
    witness_question_rate_limiter,
)

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


@router.post("/{case_cnr}/witness/call", dependencies=[controls_hearing])
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

    if case.pending_leave:
        raise HTTPException(status_code=409, detail=messages.LEAVE_PENDING)

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


@router.post("/{case_cnr}/witness/examine", dependencies=[controls_hearing])
async def examine_witness(
    case_cnr: str,
    request: ExamineWitnessRequest,
    # Both question limiters share one counter, so one lock covers developers too.
    current_user: User = Depends(witness_question_rate_limiter.hold, scope="function"),
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
    exhibit_refs, _ = cited_exhibits(case, request.exhibit_refs)
    exhibit_refs, tendered = tender_exhibits(case, exhibit_refs, examiner_role)
    cites = exhibit_note(case, exhibit_refs)

    # Build examination history for context
    exam_history = [
        {"examiner": e.examiner, "question": e.question, "answer": e.answer}
        for e in testimony.examination
    ]

    question = CourtroomProceedingsEvent(
        type=CourtroomProceedingsEventType.WITNESS_EXAMINED_Q,
        content=request.question,
        speaker_role=examiner_role,
        speaker_name=f"{current_user.first_name} {current_user.last_name}",
        witness_id=party.id,
        question=request.question,
        timestamp=get_current_datetime(),
        exhibit_refs=exhibit_refs,
    )

    async def witness_answer() -> str:
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
                question=request.question + cites,
                case_details=case.details,
                examination_history=exam_history[-settings.witness_history_limit :],
                rag_context=rag_context,
                evidence_context=format_evidence_context(case.evidence),
            )
        except LLMGenerationError:
            raise
        except Exception:
            logger.exception("Error generating witness response")
            raise HTTPException(
                status_code=500, detail="Failed to generate witness response"
            )
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"Witness response generated in {duration_ms:.2f}ms")
        return answer

    # ponytail: the witness answers while AI counsel decides whether to object (and
    # the court rules), and the answer is dropped if the objection is sustained.
    replying = asyncio.create_task(witness_answer())
    decision = objection = None
    try:
        decision = await ai_may_object(case, "question", question)
        case.courtroom_proceedings.append(question)
        if decision:
            objection = await ai_objects_now(case, "question", question, decision)
        withdrawn = bool(objection and objection["sustained"])
        answer = "" if withdrawn else await replying
    finally:
        await drop(replying)
        if decision:
            await show_ai_objection(case.cnr, None)
    memories: list[tuple] = (
        [ruling_memory(*case.courtroom_proceedings[-2:])] if objection else []
    )

    exam_item = None
    if not withdrawn:
        exam_item = ExaminationItem(
            examiner=examiner_role,
            question=request.question,
            answer=answer,
            phase=testimony.phase,
        )
        for t in case.witness_testimonies:
            if t.id == testimony.id:
                t.examination.append(exam_item)
                break
        answered = CourtroomProceedingsEvent(
            type=CourtroomProceedingsEventType.WITNESS_EXAMINED_A,
            content=answer,
            speaker_role=party.role.value,
            speaker_name=party.name,
            witness_id=party.id,
            answer=answer,
            timestamp=get_current_datetime(),
        )
        case.courtroom_proceedings.append(answered)
        memories += [
            (
                "witness_testimony",
                exam_item.id,
                f"Q: {request.question}\nA: {answer}",
                {
                    "witness_id": party.id,
                    "witness_name": party.name,
                    "examiner": examiner_role,
                },
            ),
            (
                "proceeding",
                question.id,
                request.question,
                {
                    "event_type": "witness_examined_q",
                    "speaker_role": examiner_role,
                    "witness_id": party.id,
                },
            ),
            (
                "proceeding",
                answered.id,
                answer,
                {
                    "event_type": "witness_examined_a",
                    "speaker_role": party.role.value,
                    "witness_id": party.id,
                },
            ),
        ]

    try:
        await case.save()
        for item in tendered:
            await index_evidence_item(case, item)
        for memory in memories:
            await upsert_memory_item(case, *memory)
    except Exception:
        logger.exception("Error saving examination")
        raise HTTPException(status_code=500, detail="Failed to save examination")

    await limiter.register_usage(str(current_user.id))

    return WitnessExaminationResponse(
        witness_id=party.id,
        witness_name=party.name,
        question=request.question,
        answer=None if withdrawn else answer,
        examination_id=exam_item.id if exam_item else None,
        timestamp=exam_item.timestamp if exam_item else question.timestamp,
        ai_objection=objection,
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


SIDE_NAME = {"plaintiff": "the Plaintiff", "defendant": "the Defence"}
LOG_CANDIDATES = 6


async def ai_logs_testimony(case_cnr: str, witness_id: str, ai_role: str) -> None:
    """At the end of its turn the AI lawyer may log one of the witness's answers
    as an exhibit, as the user can with Extract as evidence."""
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        return
    logged = {item.origin_id for item in case.evidence}
    answers = [
        e
        for e in case.courtroom_proceedings
        if e.type == CourtroomProceedingsEventType.WITNESS_EXAMINED_A
        and e.witness_id == witness_id
        and e.content
        and not e.struck
        and e.id not in logged
    ][-LOG_CANDIDATES:]
    if not answers:
        return
    pick = await lawyer.choose_testimony_to_log(
        ai_role,
        pick_case_context(None, case.details),
        [a.content or "" for a in answers],
    )
    if pick is None:
        return
    answer = answers[pick]
    name = answer.speaker_name or "the witness"
    item = await extract_evidence_from_text(
        answer.content or "",
        source=f"{name} testimony",
        exhibit_ref=next_exhibit_ref(case),
    )
    item.origin_id = answer.id
    item.extracted_by = ai_role
    note = CourtroomProceedingsEvent(
        type=CourtroomProceedingsEventType.SYSTEM_MESSAGE,
        content=f"Counsel for {SIDE_NAME[ai_role]} logs {name}'s answer as {item.exhibit_ref}",
        timestamp=get_current_datetime(),
    )
    # ponytail: exhibit numbering can clash if the user extracts at this same
    # moment; a unique index on exhibit refs would close that.
    await Case.find_one(Case.cnr == case_cnr).update_one(
        {"$push": {"evidence": item, "courtroom_proceedings": note}}
    )
    await index_evidence_item(case, item)


def objection_window(question: str) -> float:
    """Seconds from the AI's question to the witness's answer: time for it to type
    out on the user's screen and be read, so they can object before the answer."""
    return min(20.0, 5 + len(question) / 15)


async def wait_for_ruling(case_cnr: str) -> Case | None:
    """The case once no objection is pending: the AI examiner waits for the court.

    ponytail: polls once a second; a hold lapses by itself (Case.OBJECTION_HOLD),
    so one left behind can't stall the examination for good.
    """
    for _ in range(int(Case.OBJECTION_HOLD.total_seconds())):
        case = await Case.find_one(Case.cnr == case_cnr)
        if not case or not case.objection_pending:
            return case
        await asyncio.sleep(1)
    return await Case.find_one(Case.cnr == case_cnr)


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
        asked = 0  # questions put to the witness so far
        while asked < max_questions:
            case = await wait_for_ruling(case_cnr)
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
                evidence_context=format_evidence_context(case.evidence),
            )
            if not question:
                logger.info(f"AI ended {phase.value} after {asked} question(s)")
                break

            # Exhibits the AI names are put to the witness, as the user's are.
            q_refs = refs_in(case, question)
            q_event = CourtroomProceedingsEvent(
                type=CourtroomProceedingsEventType.WITNESS_EXAMINED_Q,
                timestamp=get_current_datetime(),
                content=question,
                speaker_role=ai_role,
                speaker_name="AI Lawyer",
                witness_id=party.id,
                question=question,
                exhibit_refs=q_refs,
            )
            # Posted only while no objection is live: the user may click Object
            # while this question was being drafted. Then the court rules first
            # and the AI drafts afresh in light of the ruling.
            lapsed = get_current_datetime() - Case.OBJECTION_HOLD
            no_objection = {
                "$or": [
                    {"objection_pending_at": None},
                    {"objection_pending_at": {"$lt": lapsed}},
                ]
            }
            result = await Case.find_one(
                {**still_examining, **no_objection}
            ).update_one({"$push": {"courtroom_proceedings": q_event}})
            if not isinstance(result, UpdateResult) or not result.modified_count:
                if await Case.find_one(still_examining):
                    logger.info(
                        "Objection raised while drafting: waiting, then redrafting"
                    )
                    continue
                logger.info("AI examination was stopped meanwhile, discarding question")
                break
            asked += 1
            posted = time.monotonic()
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
                    question=question + exhibit_note(case, q_refs),
                    case_details=case.details,
                    examination_history=(
                        exam_history[-settings.witness_history_limit :]
                        + [{"examiner": ai_role, "question": question, "answer": ""}]
                    ),
                    rag_context=answer_context,
                    evidence_context=format_evidence_context(case.evidence),
                )
            except Exception:
                logger.exception("Error generating answer")
                break

            # The answer is drafted at once but given only after the objection
            # window, counted from when the question went on the record.
            await asyncio.sleep(
                max(0.0, objection_window(question) - (time.monotonic() - posted))
            )
            # If the user objected to the question, the witness waits for the
            # ruling, and doesn't answer a question the court made withdrawn.
            case = await wait_for_ruling(case_cnr)
            if not case:
                break
            asked_q = next(
                (e for e in case.courtroom_proceedings if e.id == q_event.id), None
            )
            if not asked_q:
                break
            if asked_q.struck:
                continue

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
        try:
            await ai_logs_testimony(case_cnr, initial_witness_id, ai_role)
        except Exception:
            logger.exception("AI lawyer couldn't log testimony as evidence")
        await finish_ai_turn(case_cnr, initial_witness_id, testimony_id)
        logger.info("Background examination finished")


@router.post("/{case_cnr}/witness/ai-cross-examine", dependencies=[controls_hearing])
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


@router.post("/{case_cnr}/witness/conclude", dependencies=[controls_hearing])
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


@router.post("/{case_cnr}/witness/ai-call", dependencies=[controls_hearing])
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

    if case.pending_leave:
        return {"should_call": False, "reason": "Waiting for the court's leave"}

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
        if p.id not in testified_ids and p.id not in case.refused_witness_ids
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

        party = case.get_party(witness_id) if witness_id else None
        if party:
            # The AI asks the court's leave; the user may object before it's granted.
            side = "the Plaintiff" if ai_role == "plaintiff" else "the Defence"
            request = CourtroomProceedingsEvent(
                type=CourtroomProceedingsEventType.LEAVE_REQUEST,
                content=f"Your Honour, {side} seeks leave to call {party.name} to the stand.",
                speaker_role=ai_role,
                speaker_name=AI_SPEAKER[ai_role],
                witness_id=party.id,
                timestamp=get_current_datetime(),
            )
            case.courtroom_proceedings.append(request)
            case.pending_leave = PendingLeave(
                event_id=request.id,
                witness_id=party.id,
                witness_name=party.name,
                called_by=ai_role,
            )
            await case.save()
            logger.info(f"AI seeks leave to call witness: {party.name}")
            return {
                "should_call": True,
                "pending_leave": True,
                "witness_id": party.id,
                "witness_name": party.name,
                "witness_role": party.role.value,
                "called_by": ai_role,
                "message": request.content,
            }

        return {
            "should_call": False,
            "reason": "AI decided not to call a witness at this time",
        }
    except Exception:
        logger.exception("Error in AI witness decision")
        return {"should_call": False, "reason": "Error evaluating witness strategy"}


def seat_ai_witness(case: Case, background_tasks: BackgroundTasks) -> str:
    """Leave granted: the AI's witness takes the stand and the AI examines in chief."""
    leave = case.pending_leave
    assert leave is not None
    case.pending_leave = None
    case.witness_testimonies.append(
        WitnessTestimony(
            witness_id=leave.witness_id,
            witness_name=leave.witness_name,
            called_by=leave.called_by,
        )
    )
    case.current_witness_id = leave.witness_id
    case.courtroom_proceedings.append(
        CourtroomProceedingsEvent(
            type=CourtroomProceedingsEventType.WITNESS_CALLED,
            content=f"{leave.witness_name} called to the witness stand by {leave.called_by}.",
            speaker_role=leave.called_by,
            speaker_name=leave.witness_name,
            witness_id=leave.witness_id,
            timestamp=get_current_datetime(),
        )
    )
    case.is_ai_examining = True
    background_tasks.add_task(process_ai_examination, case.cnr)
    return leave.witness_name


@router.post("/{case_cnr}/witness/leave/respond", dependencies=[controls_hearing])
async def respond_to_leave(
    case_cnr: str,
    request: LeaveResponseRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Answer the other side's request to call a witness: no objection, or object.

    An objection is ruled on by the judge; sustained refuses leave (that witness
    won't be asked for again), overruled grants it.
    """
    case = await get_owned_case(case_cnr, current_user)
    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(status_code=409, detail=messages.COURT_NOT_IN_SESSION)
    leave = case.pending_leave
    if leave is None:
        raise HTTPException(
            status_code=409, detail="No one is asking to call a witness."
        )

    if request.objection is None:
        case.courtroom_proceedings.append(
            CourtroomProceedingsEvent(
                type=CourtroomProceedingsEventType.SYSTEM_MESSAGE,
                content="No objection · Leave granted",
                timestamp=get_current_datetime(),
            )
        )
        name = seat_ai_witness(case, background_tasks)
        await case.save()
        return {"granted": True, "witness_name": name}

    grounds = request.objection.grounds
    details = request.objection.details.strip()
    check_grounds("leave", grounds)
    party = case.get_party(leave.witness_id)
    user_side = (
        case.user_role.value if case.user_role != Roles.NOT_STARTED else "plaintiff"
    )
    testified = ", ".join(t.witness_name for t in case.witness_testimonies) or "no one"
    sustained, ruling = await judge.rule_on_objection(
        kind="leave",
        grounds=grounds,
        details=details,
        target_text=(
            f"Leave to call {leave.witness_name}"
            f" ({party.role.value if party else 'not a party'}). "
            f"{(party.bio if party and party.bio else '')} "
            f"Witnesses already heard: {testified}."
        ),
        objector_role=user_side,
        case_context=pick_case_context(None, case.details),
        record=record_lines(case),
    )
    case.courtroom_proceedings.extend(
        objection_events(
            user_side,
            f"{current_user.first_name} {current_user.last_name}",
            leave.event_id,
            grounds,
            details,
            sustained,
            ruling,
        )
    )
    if sustained:
        case.pending_leave = None
        case.refused_witness_ids.append(leave.witness_id)
        await case.save()
        return {"granted": False, "sustained": True, "ruling": ruling}
    name = seat_ai_witness(case, background_tasks)
    await case.save()
    return {"granted": True, "sustained": False, "ruling": ruling, "witness_name": name}
