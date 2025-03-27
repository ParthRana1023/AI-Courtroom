# app/models/case.py
from typing import Dict, List, Optional, Union
from beanie import Document, PydanticObjectId
from pydantic import Field, ConfigDict
from enum import Enum

class CaseStatus(str, Enum):
    NOT_STARTED = "not started"
    ACTIVE = "active"
    RESOLVED = "resolved"

class Case(Document):
    cnr: str = Field(..., min_length=16, max_length=16)
    details: str
    status: CaseStatus = Field(default=CaseStatus.NOT_STARTED)
    plaintiff_arguments: List[Dict[str, Union[str, PydanticObjectId]]] = Field(
        default_factory=list,
        description="Contains arguments with 'type', 'content', and 'user_id'"
    )
    defendant_arguments: List[Dict[str, Union[str, PydanticObjectId]]] = Field(
        default_factory=list,
        description="Contains arguments with 'type', 'content', and 'user_id'"
    )
    verdict: Optional[str] = None

    class Settings:
        name = "cases"