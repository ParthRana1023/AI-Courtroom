# app/routes/parties.py
import time
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from app.models.case import Case, CaseStatus, Roles
from app.models.party import PartyRole
from app.schemas.party import (
    PartyOut, ChatRequest, ChatResponse, ChatMessageOut, 
    PartiesListOut, ChatHistoryOut
)
from app.dependencies import get_current_user
from app.services.llm.parties_service import generate_party_details, chat_with_party
from app.models.user import User
from app.utils.datetime import get_current_datetime
from app.logging_config import get_logger
import uuid

logger = get_logger(__name__)

router = APIRouter(tags=["parties"])


def can_user_chat_with_party(user_role: Roles | None, party_role: PartyRole) -> bool:
    """
    Determine if a user can chat with a party based on roles.
    Plaintiff lawyers can chat with applicants.
    Defendant lawyers can chat with non-applicants.
    If user_role is None, user hasn't selected a role yet - they can't chat.
    """
    if user_role is None:
        return False
    if user_role == Roles.PLAINTIFF and party_role == PartyRole.APPLICANT:
        return True
    elif user_role == Roles.DEFENDANT and party_role == PartyRole.NON_APPLICANT:
        return True
    return False


def has_user_chatted(case: Case) -> bool:
    """Check if user has chatted with at least one party"""
    return bool(case.party_chats) and any(len(msgs) > 0 for msgs in case.party_chats.values())


@router.get("/{cnr}/parties", response_model=PartiesListOut)
async def get_case_parties(
    cnr: str,
    current_user: User = Depends(get_current_user)
):
    """Get all parties involved in a case with role-based chat access"""
    logger.debug(f"Fetching parties for case {cnr}")
    
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        logger.warning(f"Case not found: {cnr}")
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        logger.warning(f"Unauthorized parties access for case {cnr} by user: {current_user.email}")
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    user_role = case.user_role
    is_in_courtroom = case.status == CaseStatus.ACTIVE
    
    parties_out = []
    for party in case.parties_involved:
        can_chat = can_user_chat_with_party(user_role, party.role) and not is_in_courtroom
        
        parties_out.append(PartyOut(
            id=party.id,
            name=party.name,
            role=party.role,
            occupation=party.occupation,
            age=party.age,
            address=party.address,
            bio=party.bio,
            can_chat=can_chat
        ))
    
    can_access_courtroom = has_user_chatted(case)
    logger.debug(f"Returned {len(parties_out)} parties for case {cnr}")
    
    return PartiesListOut(
        parties=parties_out,
        user_role=user_role.value if user_role else "not_started",
        can_access_courtroom=can_access_courtroom,
        is_in_courtroom=is_in_courtroom,
        case_status=case.status.value if case.status else "not_started"
    )


@router.get("/{cnr}/parties/{party_id}", response_model=PartyOut)
async def get_party_details_route(
    cnr: str,
    party_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get detailed information about a party involved in the case"""
    logger.debug(f"Fetching party {party_id} details for case {cnr}")
    
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        logger.warning(f"Case not found: {cnr}")
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        logger.warning(f"Unauthorized party details access for case {cnr} by user: {current_user.email}")
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    # Find the party
    party = None
    party_index = None
    for i, p in enumerate(case.parties_involved):
        if p.id == party_id:
            party = p
            party_index = i
            break
    
    if not party:
        logger.warning(f"Party {party_id} not found in case {cnr}")
        raise HTTPException(status_code=404, detail="Party not found in this case")
    
    # Generate bio if not already generated
    if not party.bio:
        logger.info(f"Generating bio for party {party.name} in case {cnr}")
        start_time = time.perf_counter()
        
        try:
            updated_party = await generate_party_details(
                party.name,
                case.details
            )
            case.parties_involved[party_index].bio = updated_party.bio
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info(f"Party bio generated for {party.name} in {duration_ms:.2f}ms")
        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"Error generating party details for {party.name} after {duration_ms:.2f}ms: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to generate party details. Please try again.")
        
        try:
            await case.save()
        except Exception as e:
            logger.error(f"Error saving party details for case {cnr}: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to save party details. Please try again.")
        party = case.parties_involved[party_index]
    
    is_in_courtroom = case.status == CaseStatus.ACTIVE
    can_chat = can_user_chat_with_party(case.user_role, party.role) and not is_in_courtroom
    
    return PartyOut(
        id=party.id,
        name=party.name,
        role=party.role,
        occupation=party.occupation,
        age=party.age,
        address=party.address,
        bio=party.bio,
        can_chat=can_chat
    )


@router.post("/{cnr}/parties/{party_id}/chat", response_model=ChatResponse)
async def chat_with_case_party(
    cnr: str,
    party_id: str,
    chat_request: ChatRequest,
    current_user: User = Depends(get_current_user)
):
    """Chat with a party involved in the case (role-based access control)"""
    logger.info(f"Chat request for party {party_id} in case {cnr}")
    
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        logger.warning(f"Case not found: {cnr}")
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        logger.warning(f"Unauthorized chat attempt for case {cnr} by user: {current_user.email}")
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    # Check if in active courtroom session
    if case.status == CaseStatus.ACTIVE:
        logger.warning(f"Chat blocked - courtroom active for case {cnr}")
        raise HTTPException(
            status_code=403,
            detail="Cannot chat with parties during an active courtroom session. Please continue in the courtroom or resolve the case first."
        )
    
    # Check if case is resolved
    if case.status == CaseStatus.RESOLVED:
        logger.warning(f"Chat blocked - case {cnr} is resolved")
        raise HTTPException(
            status_code=403,
            detail="Cannot chat with parties after the case has been resolved. The case has concluded."
        )
    
    # Find the party
    party = None
    party_index = None
    for i, p in enumerate(case.parties_involved):
        if p.id == party_id:
            party = p
            party_index = i
            break
    
    if not party:
        logger.warning(f"Party {party_id} not found in case {cnr}")
        raise HTTPException(status_code=404, detail="Party not found in this case")
    
    # Check if user can chat with this party based on their role
    if not can_user_chat_with_party(case.user_role, party.role):
        logger.warning(f"User {current_user.email} cannot chat with party {party.name} - role mismatch")
        raise HTTPException(
            status_code=403,
            detail=f"As a {case.user_role.value} lawyer, you can only chat with {'applicants' if case.user_role == Roles.PLAINTIFF else 'non-applicants'}"
        )
    
    # Generate bio if not already generated
    if not party.bio:
        logger.info(f"Generating bio for party {party.name} before chat")
        start_time = time.perf_counter()
        
        try:
            updated_party = await generate_party_details(
                party.name,
                case.details
            )
            case.parties_involved[party_index].bio = updated_party.bio
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info(f"Party bio generated for {party.name} in {duration_ms:.2f}ms")
        except Exception as e:
            logger.error(f"Error generating party details: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to generate party details. Please try again.")
        
        try:
            await case.save()
        except Exception as e:
            logger.error(f"Error saving party details: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to save party details. Please try again.")
        party = case.parties_involved[party_index]
    
    # Get existing chat history for this party
    chat_history = case.party_chats.get(party_id, [])
    
    # Create user message
    user_message_id = str(uuid.uuid4())
    user_timestamp = get_current_datetime()
    user_message = {
        "id": user_message_id,
        "sender": "user",
        "content": chat_request.message,
        "timestamp": user_timestamp.isoformat()
    }
    
    # Generate party's response
    start_time = time.perf_counter()
    try:
        response_content = await chat_with_party(
            party.name,
            party.role.value,
            party.bio or "",
            case.details,
            chat_history,
            chat_request.message
        )
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"Chat response generated for party {party.name} in {duration_ms:.2f}ms")
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(f"Error in chat with party {party.name} after {duration_ms:.2f}ms: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate chat response. Please try again.")
    
    # Create party's response message
    party_message_id = str(uuid.uuid4())
    party_timestamp = get_current_datetime()
    party_message = {
        "id": party_message_id,
        "sender": "party",
        "content": response_content,
        "timestamp": party_timestamp.isoformat()
    }
    
    # Update chat history in database
    if party_id not in case.party_chats:
        case.party_chats[party_id] = []
    case.party_chats[party_id].append(user_message)
    case.party_chats[party_id].append(party_message)
    
    try:
        await case.save()
        logger.debug(f"Chat history saved for party {party_id} in case {cnr}")
    except Exception as e:
        logger.error(f"Error saving chat history for case {cnr}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save chat history. Please try again.")
    
    return ChatResponse(
        user_message=ChatMessageOut(
            id=user_message_id,
            sender="user",
            content=chat_request.message,
            timestamp=user_timestamp
        ),
        party_response=ChatMessageOut(
            id=party_message_id,
            sender="party",
            content=response_content,
            timestamp=party_timestamp
        )
    )


@router.get("/{cnr}/parties/{party_id}/chat-history", response_model=ChatHistoryOut)
async def get_party_chat_history(
    cnr: str,
    party_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get chat history with a party"""
    logger.debug(f"Fetching chat history for party {party_id} in case {cnr}")
    
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        logger.warning(f"Case not found: {cnr}")
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        logger.warning(f"Unauthorized chat history access for case {cnr} by user: {current_user.email}")
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    # Find the party
    party = None
    for p in case.parties_involved:
        if p.id == party_id:
            party = p
            break
    
    if not party:
        logger.warning(f"Party {party_id} not found in case {cnr}")
        raise HTTPException(status_code=404, detail="Party not found in this case")
    
    # Get chat history
    chat_history = case.party_chats.get(party_id, [])
    logger.debug(f"Returning {len(chat_history)} messages for party {party_id}")
    
    # Convert to ChatMessageOut format
    messages = [
        ChatMessageOut(
            id=msg.get("id", str(uuid.uuid4())),
            sender=msg.get("sender", "party"),
            content=msg.get("content", ""),
            timestamp=msg.get("timestamp", get_current_datetime().isoformat())
        )
        for msg in chat_history
    ]
    
    return ChatHistoryOut(
        party_id=party_id,
        party_name=party.name,
        messages=messages
    )
