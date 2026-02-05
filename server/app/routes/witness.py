# app/routes/witness.py
"""
API routes for witness examination during courtroom sessions.
"""

import time
import random
import asyncio
from typing import Optional, List, Dict
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from app.models.case import (
    Case, CaseStatus, Roles, ExaminationItem, WitnessTestimony, 
    CourtroomProceedingsEvent, CourtroomProceedingsEventType
)
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.witness import (
    CallWitnessRequest,
    ExamineWitnessRequest,
    CallWitnessResponse,
    WitnessExaminationResponse,
    CurrentWitnessResponse,
    AvailableWitnessesResponse,
    WitnessInfo,
    AllTestimoniesResponse,
    WitnessTestimonyResponse,
    ExaminationItemResponse
)
from app.services.llm import witness_service
from app.utils.datetime import get_current_datetime
from app.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["witness"])


def get_party_by_id(case: Case, party_id: str):
    """Helper to find a party by ID"""
    for party in case.parties_involved:
        if party.id == party_id:
            return party
    return None


def get_current_testimony(case: Case) -> Optional[WitnessTestimony]:
    """Get the current active testimony session"""
    if not case.current_witness_id:
        return None
    for testimony in case.witness_testimonies:
        if testimony.witness_id == case.current_witness_id and testimony.ended_at is None:
            return testimony
    return None


@router.get("/{case_cnr}/witness/available")
async def get_available_witnesses(
    case_cnr: str,
    current_user: User = Depends(get_current_user)
) -> AvailableWitnessesResponse:
    """Get list of available witnesses (parties) for the case"""
    logger.info(f"Getting available witnesses for case {case_cnr}")
    
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You don't have permission to access this case")
    
    # Get IDs of witnesses who have already testified
    testified_ids = {t.witness_id for t in case.witness_testimonies}
    
    witnesses = []
    for party in case.parties_involved:
        witnesses.append(WitnessInfo(
            id=party.id,
            name=party.name,
            role=party.role.value,
            has_testified=party.id in testified_ids
        ))
    
    return AvailableWitnessesResponse(
        witnesses=witnesses,
        current_witness_id=case.current_witness_id
    )


@router.post("/{case_cnr}/witness/call")
async def call_witness(
    case_cnr: str,
    request: CallWitnessRequest,
    current_user: User = Depends(get_current_user)
) -> CallWitnessResponse:
    """Call a witness to the stand"""
    logger.info(f"Calling witness {request.witness_id} for case {case_cnr}")
    
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You don't have permission to access this case")
    
    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Can only call witnesses during an active courtroom session")
    
    if case.current_witness_id:
        raise HTTPException(status_code=400, detail="A witness is already on the stand. Dismiss them first.")
    
    # Find the party
    party = get_party_by_id(case, request.witness_id)
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    
    # Determine who is calling (user's role)
    caller_role = case.user_role.value if case.user_role != Roles.NOT_STARTED else "plaintiff"
    
    # Create new testimony session
    testimony = WitnessTestimony(
        witness_id=party.id,
        witness_name=party.name,
        called_by=caller_role
    )
    
    case.witness_testimonies.append(testimony)
    case.current_witness_id = party.id
    
    case.courtroom_proceedings.append(CourtroomProceedingsEvent(
        type=CourtroomProceedingsEventType.WITNESS_CALLED,
        content=f"{party.name} called to the witness stand by {caller_role}.",
        speaker_role=caller_role,
        speaker_name=party.name,
        witness_id=party.id,
        timestamp=get_current_datetime()
    ))
    
    try:
        await case.save()
        logger.info(f"Witness {party.name} called to the stand by {caller_role}")
    except Exception as e:
        logger.error(f"Error calling witness: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to call witness")
    
    return CallWitnessResponse(
        success=True,
        witness_id=party.id,
        witness_name=party.name,
        witness_role=party.role.value,
        message=f"{party.name} has been called to the witness stand."
    )


@router.post("/{case_cnr}/witness/examine")
async def examine_witness(
    case_cnr: str,
    request: ExamineWitnessRequest,
    current_user: User = Depends(get_current_user)
) -> WitnessExaminationResponse:
    """Examine the current witness with a question"""
    logger.info(f"Examining witness for case {case_cnr}")
    
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You don't have permission to access this case")
    
    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Can only examine witnesses during an active courtroom session")
    
    if not case.current_witness_id:
        raise HTTPException(status_code=400, detail="No witness is currently on the stand")
    
    # Get current testimony
    testimony = get_current_testimony(case)
    if not testimony:
        raise HTTPException(status_code=400, detail="No active testimony session found")
    
    # Get the witness (party)
    party = get_party_by_id(case, case.current_witness_id)
    if not party:
        raise HTTPException(status_code=404, detail="Witness not found")
    
    # Determine examiner role
    examiner_role = case.user_role.value if case.user_role != Roles.NOT_STARTED else "plaintiff"
    
    # Build examination history for context
    exam_history = [
        {"examiner": e.examiner, "question": e.question, "answer": e.answer}
        for e in testimony.examination
    ]
    
    # Generate witness response
    start_time = time.perf_counter()
    try:
        answer = await witness_service.examine_witness(
            witness_name=party.name,
            witness_role=party.role.value,
            witness_bio=party.bio or "",
            examiner_role=examiner_role,
            question=request.question,
            case_details=case.details,
            examination_history=exam_history
        )
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"Witness response generated in {duration_ms:.2f}ms")
    except Exception as e:
        logger.error(f"Error generating witness response: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate witness response")
    
    # Create examination item
    exam_item = ExaminationItem(
        examiner=examiner_role,
        question=request.question,
        answer=answer
    )
    
    # Add to testimony - find the right testimony in the list
    for i, t in enumerate(case.witness_testimonies):
        if t.id == testimony.id:
            case.witness_testimonies[i].examination.append(exam_item)
            break
    
    # Add events to proceedings
    case.courtroom_proceedings.append(CourtroomProceedingsEvent(
        type=CourtroomProceedingsEventType.WITNESS_EXAMINED_Q,
        content=request.question,
        speaker_role=examiner_role,
        speaker_name=f"{current_user.first_name} {current_user.last_name}",
        witness_id=party.id,
        question=request.question,
        timestamp=get_current_datetime()
    ))

    case.courtroom_proceedings.append(CourtroomProceedingsEvent(
        type=CourtroomProceedingsEventType.WITNESS_EXAMINED_A,
        content=answer,
        speaker_role=party.role.value,
        speaker_name=party.name,
        witness_id=party.id,
        answer=answer,
        timestamp=get_current_datetime()
    ))
    
    try:
        await case.save()
    except Exception as e:
        logger.error(f"Error saving examination: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save examination")
    
    return WitnessExaminationResponse(
        witness_id=party.id,
        witness_name=party.name,
        question=request.question,
        answer=answer,
        examination_id=exam_item.id,
        timestamp=exam_item.timestamp
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
        case.is_ai_examining = False
        await case.save()
        return

    # Get the witness
    party = get_party_by_id(case, case.current_witness_id)
    if not party:
        case.is_ai_examining = False
        await case.save()
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
        questions_asked_count = 0

        # Initial delay to simulate AI reviewing the case
        logger.info("AI 'thinking' before starting examination...")
        await asyncio.sleep(3)

        initial_witness_id = case.current_witness_id

        for i in range(questions_to_ask):
            # Re-fetch case to check for interruptions and ensure we work on latest state
            case = await Case.find_one(Case.cnr == case_cnr)
            if not case or case.current_witness_id != initial_witness_id:
                logger.info("Witness changed or dismissed, stopping AI examination")
                break
                
            if not case.is_ai_examining:
                logger.info("AI examination flag cleared, stopping")
                break
            
            # 1. Build history
            exam_history = [
                {"examiner": e.examiner, "question": e.question, "answer": e.answer}
                for e in testimony.examination
            ]

            # 2. Check if should continue
            if questions_asked_count > 0: # Always ask at least one if triggered
                should_continue = await witness_service.should_continue_cross_examination(
                    witness_name=party.name,
                    witness_role=party.role.value,
                    ai_lawyer_role=ai_role,
                    case_details=case.details,
                    testimony_so_far=exam_history,
                    questions_asked=questions_asked_count,
                    max_questions=max_questions
                )
                if not should_continue:
                    logger.info("AI decided to stop questioning")
                    break

            # 3. Generate Question
            try:
                question = await witness_service.generate_cross_examination_questions(
                    witness_name=party.name,
                    witness_role=party.role.value,
                    ai_lawyer_role=ai_role,
                    case_details=case.details,
                    testimony_so_far=exam_history,
                    case_arguments=arguments_summary
                )
            except Exception as e:
                logger.error(f"Error generating question: {e}")
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
                question=question
            )
            case.courtroom_proceedings.append(q_event)
            await case.save()
            
            # Delay before answer
            logger.info("Waiting 3s for witness answer...")
            await asyncio.sleep(3) 

            try:
                answer = await witness_service.examine_witness(
                    witness_name=party.name,
                    witness_role=party.role.value,
                    witness_bio=party.bio or "",
                    examiner_role=ai_role,
                    question=question,
                    case_details=case.details,
                    examination_history=exam_history + [{"examiner": ai_role, "question": question, "answer": ""}]
                )
            except Exception as e:
                logger.error(f"Error generating answer: {e}")
                break

            # Save Answer Event and Examination Item
            exam_item = ExaminationItem(
                examiner=ai_role,
                question=question,
                answer=answer
            )
            
            # Add to testimony
            # Need to find testimony index again as case object might be stale if we didn't refresh?
            # We are modifying local 'case' object which we saved.
            # But 'testimony' ref might be stale if we want to be super safe. 
            # Since we are the only writer to testimony likely, it's ok.
            for t in case.witness_testimonies:
                if t.id == testimony.id:
                   t.examination.append(exam_item)
                   break

            a_event = CourtroomProceedingsEvent(
                type=CourtroomProceedingsEventType.WITNESS_EXAMINED_A,
                timestamp=get_current_datetime(),
                content=answer,
                speaker_role=party.role.value,
                speaker_name=party.name,
                witness_id=party.id,
                answer=answer
            )
            case.courtroom_proceedings.append(a_event)
            await case.save()
            
            questions_asked_count += 1
            
            # Delay before next question
            logger.info("Waiting 3s before next question...")
            await asyncio.sleep(3)
            
    except Exception as e:
        logger.error(f"Error in background examination: {e}", exc_info=True)
    finally:
        # Finished
        # Re-fetch case to set flag safely
        case = await Case.find_one(Case.cnr == case_cnr)
        if case:
            case.is_ai_examining = False
            # Add system message that examination is done?
            done_event = CourtroomProceedingsEvent(
                 type=CourtroomProceedingsEventType.SYSTEM_MESSAGE,
                 timestamp=get_current_datetime(),
                 content="Cross-examination completed."
            )
            case.courtroom_proceedings.append(done_event)
            await case.save()
        logger.info("Background examination finished")


@router.post("/{case_cnr}/witness/ai-cross-examine")
async def ai_cross_examine_witness(
    case_cnr: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """AI lawyer performs full cross-examination with multiple questions (Background Task)"""
    from app.schemas.witness import AICrossExaminationResponse
    
    logger.info(f"AI starting cross-examination for case {case_cnr}")
    
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You don't have permission to access this case")
    
    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Can only examine witnesses during an active courtroom session")
    
    if not case.current_witness_id:
        raise HTTPException(status_code=400, detail="No witness is currently on the stand")
    
    if case.is_ai_examining:
        raise HTTPException(status_code=400, detail="AI is already examining the witness")

    # Set flag and start background task
    case.is_ai_examining = True
    await case.save()
    
    background_tasks.add_task(process_ai_cross_examination, case_cnr, 5)
    
    # Return immediate response
    # We return an empty list of examinations because they will be generated in background
    # The frontend should see 'state'="ai_cross_examining" and start polling
    party = get_party_by_id(case, case.current_witness_id)
    
    return AICrossExaminationResponse(
        witness_id=party.id,
        witness_name=party.name,
        examinations=[], 
        total_questions=0,
        state="ai_cross_examining"
    )


@router.post("/{case_cnr}/witness/conclude")
async def conclude_witness(
    case_cnr: str,
    current_user: User = Depends(get_current_user)
):
    """User concludes their examination - witness is dismissed by the judge"""
    from app.schemas.witness import ConcludeWitnessResponse
    
    logger.info(f"Concluding witness examination for case {case_cnr}")
    
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You don't have permission to access this case")
    
    if not case.current_witness_id:
        raise HTTPException(status_code=400, detail="No witness is currently on the stand")
    
    # Get current testimony and count questions
    testimony = get_current_testimony(case)
    total_questions = len(testimony.examination) if testimony else 0
    
    # Get witness name
    witness_name = None
    for party in case.parties_involved:
        if party.id == case.current_witness_id:
            witness_name = party.name
            break
    
    # End the testimony
    for i, t in enumerate(case.witness_testimonies):
        if t.witness_id == case.current_witness_id and t.ended_at is None:
            case.witness_testimonies[i].ended_at = get_current_datetime()
            break
    
    witness_id = case.current_witness_id
    case.current_witness_id = None
    
    case.courtroom_proceedings.append(CourtroomProceedingsEvent(
        type=CourtroomProceedingsEventType.WITNESS_DISMISSED,
        content=f"{witness_name or 'Witness'} dismissed from the stand.",
        speaker_role="judge",
        speaker_name="Judge",
        witness_id=witness_id,
        timestamp=get_current_datetime()
    ))
    
    try:
        await case.save()
        logger.info(f"Witness {witness_name} examination concluded with {total_questions} questions")
    except Exception as e:
        logger.error(f"Error concluding witness: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to conclude witness examination")
    
    return ConcludeWitnessResponse(
        success=True,
        witness_id=witness_id,
        witness_name=witness_name or "Witness",
        total_questions_asked=total_questions,
        message=f"The court thanks {witness_name or 'the witness'} for their testimony. The witness is dismissed."
    )


@router.post("/{case_cnr}/witness/dismiss")
async def dismiss_witness(
    case_cnr: str,
    current_user: User = Depends(get_current_user)
):
    """Dismiss the current witness from the stand"""
    logger.info(f"Dismissing witness for case {case_cnr}")
    
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You don't have permission to access this case")
    
    if not case.current_witness_id:
        raise HTTPException(status_code=400, detail="No witness is currently on the stand")
    
    # Get current testimony and mark it as ended
    for i, t in enumerate(case.witness_testimonies):
        if t.witness_id == case.current_witness_id and t.ended_at is None:
            case.witness_testimonies[i].ended_at = get_current_datetime()
            break
    
    witness_name = None
    witness_id_val = None
    for party in case.parties_involved:
        if party.id == case.current_witness_id:
            witness_name = party.name
            witness_id_val = party.id
            break
    
    case.current_witness_id = None
    case.is_ai_examining = False
    
    case.courtroom_proceedings.append(CourtroomProceedingsEvent(
        type=CourtroomProceedingsEventType.WITNESS_DISMISSED,
        content=f"{witness_name or 'Witness'} dismissed from the stand.",
        speaker_role="judge",
        speaker_name="Judge",
        witness_id=witness_id_val,
        timestamp=get_current_datetime()
    ))
    
    try:
        await case.save()
        logger.info(f"Witness {witness_name} dismissed from the stand")
    except Exception as e:
        logger.error(f"Error dismissing witness: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to dismiss witness")
    
    return {
        "success": True,
        "message": f"{witness_name or 'Witness'} has been dismissed from the stand."
    }


@router.get("/{case_cnr}/witness/current")
async def get_current_witness(
    case_cnr: str,
    current_user: User = Depends(get_current_user)
) -> CurrentWitnessResponse:
    """Get the current witness examination state"""
    logger.debug(f"Getting current witness for case {case_cnr}")
    
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You don't have permission to access this case")
    
    if not case.current_witness_id:
        return CurrentWitnessResponse(
            has_witness=False,
            is_ai_examining=case.is_ai_examining
        )
    
    party = get_party_by_id(case, case.current_witness_id)
    testimony = get_current_testimony(case)
    
    if not party or not testimony:
        return CurrentWitnessResponse(
            has_witness=False,
            is_ai_examining=case.is_ai_examining
        )
    
    examination_history = [
        ExaminationItemResponse(
            id=e.id,
            examiner=e.examiner,
            question=e.question,
            answer=e.answer,
            objection=e.objection,
            objection_ruling=e.objection_ruling,
            timestamp=e.timestamp
        )
        for e in testimony.examination
    ]
    
    return CurrentWitnessResponse(
        has_witness=True,
        witness_id=party.id,
        witness_name=party.name,
        witness_role=party.role.value,
        called_by=testimony.called_by,
        examination_history=examination_history,
        is_ai_examining=case.is_ai_examining
    )


@router.get("/{case_cnr}/witness/testimonies")
async def get_all_testimonies(
    case_cnr: str,
    current_user: User = Depends(get_current_user)
) -> AllTestimoniesResponse:
    """Get all witness testimonies for the case"""
    logger.debug(f"Getting all testimonies for case {case_cnr}")
    
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You don't have permission to access this case")
    
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
                timestamp=e.timestamp
            )
            for e in t.examination
        ]
        testimonies.append(WitnessTestimonyResponse(
            id=t.id,
            witness_id=t.witness_id,
            witness_name=t.witness_name,
            called_by=t.called_by,
            examination=examination,
            started_at=t.started_at,
            ended_at=t.ended_at
        ))
    
    return AllTestimoniesResponse(testimonies=testimonies)


@router.post("/{case_cnr}/witness/ai-call")
async def ai_call_witness(
    case_cnr: str,
    current_user: User = Depends(get_current_user)
):
    """AI lawyer strategically decides whether to call a witness"""
    logger.info(f"AI evaluating whether to call a witness for case {case_cnr}")
    
    case = await Case.find_one(Case.cnr == case_cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You don't have permission to access this case")
    
    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Can only call witnesses during an active courtroom session")
    
    if case.current_witness_id:
        return {"should_call": False, "reason": "A witness is already on the stand"}
    
    # Get AI role
    ai_role = case.ai_role.value if case.ai_role != Roles.NOT_STARTED else "defendant"
    
    # Get available witnesses
    testified_ids = {t.witness_id for t in case.witness_testimonies}
    available_witnesses = [
        {
            "id": p.id,
            "name": p.name,
            "role": p.role.value,
            "bio": p.bio or ""
        }
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
            testimonies_given=list(testified_ids)
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
            party = get_party_by_id(case, witness_id)
            if party:
                testimony = WitnessTestimony(
                    witness_id=party.id,
                    witness_name=party.name,
                    called_by=ai_role
                )
                case.witness_testimonies.append(testimony)
                case.current_witness_id = party.id
                await case.save()
                
                logger.info(f"AI called witness: {witness_name}")
                return {
                    "should_call": True,
                    "witness_id": witness_id,
                    "witness_name": witness_name,
                    "witness_role": witness_role,
                    "called_by": ai_role,
                    "message": f"The {ai_role}'s lawyer calls {witness_name} to the witness stand."
                }
        
        return {"should_call": False, "reason": "AI decided not to call a witness at this time"}
    except Exception as e:
        logger.error(f"Error in AI witness decision: {str(e)}", exc_info=True)
        return {"should_call": False, "reason": "Error evaluating witness strategy"}
