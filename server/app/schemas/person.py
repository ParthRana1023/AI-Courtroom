# app/schemas/person.py
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime
from app.models.person import PersonRole


class PersonOut(BaseModel):
    """Response schema for a person involved in a case"""
    id: str
    name: str
    role: PersonRole
    occupation: Optional[str] = None
    age: Optional[int] = None
    address: Optional[str] = None
    bio: Optional[str] = None
    can_chat: bool = False  # Whether user can chat with this person based on their role

    model_config = ConfigDict(from_attributes=True)


class ChatMessageOut(BaseModel):
    """Response schema for a chat message"""
    id: str
    sender: str  # 'user' or 'person'
    content: str
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatRequest(BaseModel):
    """Request schema for sending a chat message"""
    message: str


class ChatResponse(BaseModel):
    """Response schema for a chat interaction"""
    user_message: ChatMessageOut
    person_response: ChatMessageOut


class PeopleListOut(BaseModel):
    """Response schema for listing people in a case"""
    people: List[PersonOut]
    user_role: str  # The user's role in the case (plaintiff/defendant)
    can_access_courtroom: bool = False  # Whether user has chatted enough to access courtroom
    is_in_courtroom: bool = False  # Whether user is currently in an active courtroom session


class ChatHistoryOut(BaseModel):
    """Response schema for chat history"""
    person_id: str
    person_name: str
    messages: List[ChatMessageOut]
