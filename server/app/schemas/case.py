# app/schemas/case.py
from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Any
from datetime import datetime
from app.models.case import CaseStatus, Roles


class CaseCreate(BaseModel):
    sections_involved: int
    section_numbers: list[int]


class ArgumentOut(BaseModel):
    type: str
    content: str
    user_id: Optional[Any] = None  # Use Any to accept any type of value
    role: Roles = Roles.NOT_STARTED
    timestamp: Optional[datetime] = (
        None  # Add timestamp field to track when argument was submitted
    )


class CourtroomProceedingsEventOut(BaseModel):
    id: str
    type: str
    timestamp: datetime
    content: Optional[str] = None
    speaker_role: Optional[str] = None
    speaker_name: Optional[str] = None
    witness_id: Optional[str] = None
    question: Optional[str] = None
    answer: Optional[str] = None


class EvidenceOut(BaseModel):
    id: str
    exhibit_ref: str
    title: str
    evidence_type: str
    description: str
    source: Optional[str] = None
    relevance: Optional[str] = None
    supports_side: str = "unknown"
    ipc_sections: List[str] = []
    image_prompt: Optional[str] = None
    image_url: Optional[str] = None
    image_public_id: Optional[str] = None
    media_status: str = "not_requested"

    model_config = ConfigDict(from_attributes=True)


class CaseOut(BaseModel):
    id: str
    cnr: str
    title: str = ""  # Title field directly in the schema
    status: CaseStatus
    user_id: str
    user_role: Roles = Roles.NOT_STARTED
    ai_role: Roles = Roles.NOT_STARTED
    plaintiff_arguments: List[ArgumentOut] = []
    defendant_arguments: List[ArgumentOut] = []
    courtroom_proceedings: List[CourtroomProceedingsEventOut] = []  # Added field
    is_ai_examining: bool = False  # Added field
    verdict: Optional[str] = None
    analysis: Optional[str] = None
    current_witness_id: Optional[str] = None
    evidence: List[EvidenceOut] = []

    model_config = ConfigDict(from_attributes=True)
