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
    timestamp: Optional[datetime] = None  # Add timestamp field to track when argument was submitted

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
    verdict: Optional[str] = None
    analysis: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)