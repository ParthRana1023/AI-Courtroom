# app/schemas/case.py
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models.case import CaseStatus, Roles


class CaseCreate(BaseModel):
    sections_involved: int
    section_numbers: list[int]


class ArgumentOut(BaseModel):
    type: str
    content: str
    user_id: Any | None = None  # Use Any to accept any type of value
    role: Roles = Roles.NOT_STARTED
    timestamp: datetime | None = (
        None  # Add timestamp field to track when argument was submitted
    )


class CourtroomProceedingsEventOut(BaseModel):
    id: str
    type: str
    timestamp: datetime
    content: str | None = None
    speaker_role: str | None = None
    speaker_name: str | None = None
    witness_id: str | None = None
    question: str | None = None
    answer: str | None = None


class EvidenceOut(BaseModel):
    id: str
    exhibit_ref: str
    title: str
    evidence_type: str
    description: str
    source: str | None = None
    image_prompt: str | None = None
    image_url: str | None = None
    image_public_id: str | None = None
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
    plaintiff_arguments: list[ArgumentOut] = []
    defendant_arguments: list[ArgumentOut] = []
    courtroom_proceedings: list[CourtroomProceedingsEventOut] = []  # Added field
    is_ai_examining: bool = False  # Added field
    verdict: str | None = None
    analysis: str | None = None
    current_witness_id: str | None = None
    evidence: list[EvidenceOut] = []

    model_config = ConfigDict(from_attributes=True)
