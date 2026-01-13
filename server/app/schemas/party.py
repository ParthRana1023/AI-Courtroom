# app/schemas/party.py
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime
from app.models.party import PartyRole


class PartyOut(BaseModel):
    """Response schema for a party involved in a case"""
    id: str
    name: str
    role: PartyRole
    occupation: Optional[str] = None
    age: Optional[int] = None
    address: Optional[str] = None
    bio: Optional[str] = None
    can_chat: bool = False  # Whether user can chat with this party based on their role

    model_config = ConfigDict(from_attributes=True)


class ChatMessageOut(BaseModel):
    """Response schema for a chat message"""
    id: str
    sender: str  # 'user' or 'party'
    content: str
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatRequest(BaseModel):
    """Request schema for sending a chat message"""
    message: str


class ChatResponse(BaseModel):
    """Response schema for a chat interaction"""
    user_message: ChatMessageOut
    party_response: ChatMessageOut


class PartiesListOut(BaseModel):
    """Response schema for listing parties in a case"""
    parties: List[PartyOut]
    user_role: str  # The user's role in the case (plaintiff/defendant)
    can_access_courtroom: bool = False  # Whether user has chatted enough to access courtroom
    is_in_courtroom: bool = False  # Whether user is currently in an active courtroom session
    case_status: str = "not_started"  # The current case status (not_started, active, adjourned, resolved)


class ChatHistoryOut(BaseModel):
    """Response schema for chat history"""
    party_id: str
    party_name: str
    messages: List[ChatMessageOut]
