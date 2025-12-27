# app/routes/people.py
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from app.models.case import Case, CaseStatus, Roles
from app.models.person import PersonRole
from app.schemas.person import (
    PersonOut, ChatRequest, ChatResponse, ChatMessageOut, 
    PeopleListOut, ChatHistoryOut
)
from app.dependencies import get_current_user
from app.services.llm.people_service import generate_person_details, chat_with_person
from app.models.user import User
from app.utils.datetime import get_current_datetime
import uuid

router = APIRouter(tags=["people"])


def can_user_chat_with_person(user_role: Roles | None, person_role: PersonRole) -> bool:
    """
    Determine if a user can chat with a person based on roles.
    Plaintiff lawyers can chat with applicants.
    Defendant lawyers can chat with non-applicants.
    If user_role is None, user hasn't selected a role yet - they can't chat.
    """
    if user_role is None:
        return False
    if user_role == Roles.PLAINTIFF and person_role == PersonRole.APPLICANT:
        return True
    elif user_role == Roles.DEFENDANT and person_role == PersonRole.NON_APPLICANT:
        return True
    return False


def has_user_chatted(case: Case) -> bool:
    """Check if user has chatted with at least one person"""
    return bool(case.person_chats) and any(len(msgs) > 0 for msgs in case.person_chats.values())


@router.get("/{cnr}/people", response_model=PeopleListOut)
async def get_case_people(
    cnr: str,
    current_user: User = Depends(get_current_user)
):
    """Get all people involved in a case with role-based chat access"""
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    user_role = case.user_role
    
    # Check if user is in active courtroom session
    is_in_courtroom = case.status == CaseStatus.ACTIVE
    
    people_out = []
    for person in case.people_involved:
        # Can only chat with own side, and not during courtroom session
        can_chat = can_user_chat_with_person(user_role, person.role) and not is_in_courtroom
        
        people_out.append(PersonOut(
            id=person.id,
            name=person.name,
            role=person.role,
            occupation=person.occupation,
            age=person.age,
            address=person.address,
            bio=person.bio,
            can_chat=can_chat
        ))
    
    # Check if user has chatted enough to access courtroom
    can_access_courtroom = has_user_chatted(case)
    
    return PeopleListOut(
        people=people_out,
        user_role=user_role.value if user_role else "not_started",
        can_access_courtroom=can_access_courtroom,
        is_in_courtroom=is_in_courtroom
    )


@router.get("/{cnr}/people/{person_id}", response_model=PersonOut)
async def get_person_details(
    cnr: str,
    person_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get detailed information about a person involved in the case"""
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    # Find the person
    person = None
    person_index = None
    for i, p in enumerate(case.people_involved):
        if p.id == person_id:
            person = p
            person_index = i
            break
    
    if not person:
        raise HTTPException(status_code=404, detail="Person not found in this case")
    
    # Generate bio if not already generated
    if not person.bio:
        updated_person = await generate_person_details(
            person.name,
            case.details
        )
        case.people_involved[person_index].bio = updated_person.bio
        await case.save()
        person = case.people_involved[person_index]
    
    # Check if user can chat with this person
    is_in_courtroom = case.status == CaseStatus.ACTIVE
    can_chat = can_user_chat_with_person(case.user_role, person.role) and not is_in_courtroom
    
    return PersonOut(
        id=person.id,
        name=person.name,
        role=person.role,
        occupation=person.occupation,
        age=person.age,
        address=person.address,
        bio=person.bio,
        can_chat=can_chat
    )


@router.post("/{cnr}/people/{person_id}/chat", response_model=ChatResponse)
async def chat_with_case_person(
    cnr: str,
    person_id: str,
    chat_request: ChatRequest,
    current_user: User = Depends(get_current_user)
):
    """Chat with a person involved in the case (role-based access control)"""
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    # Check if in active courtroom session
    if case.status == CaseStatus.ACTIVE:
        raise HTTPException(
            status_code=403,
            detail="Cannot chat with people during an active courtroom session. Please continue in the courtroom or resolve the case first."
        )
    
    # Find the person
    person = None
    person_index = None
    for i, p in enumerate(case.people_involved):
        if p.id == person_id:
            person = p
            person_index = i
            break
    
    if not person:
        raise HTTPException(status_code=404, detail="Person not found in this case")
    
    # Check if user can chat with this person based on their role
    if not can_user_chat_with_person(case.user_role, person.role):
        raise HTTPException(
            status_code=403,
            detail=f"As a {case.user_role.value} lawyer, you can only chat with {'applicants' if case.user_role == Roles.PLAINTIFF else 'non-applicants'}"
        )
    
    # Generate bio if not already generated
    if not person.bio:
        updated_person = await generate_person_details(
            person.name,
            case.details
        )
        case.people_involved[person_index].bio = updated_person.bio
        await case.save()
        person = case.people_involved[person_index]
    
    # Get existing chat history for this person
    chat_history = case.person_chats.get(person_id, [])
    
    # Create user message
    user_message_id = str(uuid.uuid4())
    user_timestamp = get_current_datetime()
    user_message = {
        "id": user_message_id,
        "sender": "user",
        "content": chat_request.message,
        "timestamp": user_timestamp.isoformat()
    }
    
    # Generate person's response
    response_content = await chat_with_person(
        person.name,
        person.role.value,
        person.bio or "",
        case.details,
        chat_history,
        chat_request.message
    )
    
    # Create person's response message
    person_message_id = str(uuid.uuid4())
    person_timestamp = get_current_datetime()
    person_message = {
        "id": person_message_id,
        "sender": "person",
        "content": response_content,
        "timestamp": person_timestamp.isoformat()
    }
    
    # Update chat history in database
    if person_id not in case.person_chats:
        case.person_chats[person_id] = []
    case.person_chats[person_id].append(user_message)
    case.person_chats[person_id].append(person_message)
    await case.save()
    
    return ChatResponse(
        user_message=ChatMessageOut(
            id=user_message_id,
            sender="user",
            content=chat_request.message,
            timestamp=user_timestamp
        ),
        person_response=ChatMessageOut(
            id=person_message_id,
            sender="person",
            content=response_content,
            timestamp=person_timestamp
        )
    )


@router.get("/{cnr}/people/{person_id}/chat-history", response_model=ChatHistoryOut)
async def get_person_chat_history(
    cnr: str,
    person_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get chat history with a person"""
    case = await Case.find_one(Case.cnr == cnr)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if str(case.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=403, 
            detail="You don't have permission to access this case"
        )
    
    # Find the person
    person = None
    for p in case.people_involved:
        if p.id == person_id:
            person = p
            break
    
    if not person:
        raise HTTPException(status_code=404, detail="Person not found in this case")
    
    # Get chat history
    chat_history = case.person_chats.get(person_id, [])
    
    # Convert to ChatMessageOut format
    messages = [
        ChatMessageOut(
            id=msg.get("id", str(uuid.uuid4())),
            sender=msg.get("sender", "person"),
            content=msg.get("content", ""),
            timestamp=msg.get("timestamp", get_current_datetime().isoformat())
        )
        for msg in chat_history
    ]
    
    return ChatHistoryOut(
        person_id=person_id,
        person_name=person.name,
        messages=messages
    )
