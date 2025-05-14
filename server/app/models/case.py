# app/models/case.py
from typing import Dict, List, Optional, Union, Any
from beanie import Document, PydanticObjectId
from pydantic import Field, ConfigDict
from enum import Enum
from datetime import datetime, timezone
from typing import Optional, List

def get_current_datetime():
    return datetime.now(timezone.utc)
    
class CaseStatus(str, Enum):
    NOT_STARTED = "not started"
    ACTIVE = "active"
    RESOLVED = "resolved"

class Case(Document):
    cnr: str = Field(..., min_length=16, max_length=16)
    details: str
    title: str = ""
    created_at: datetime = Field(default_factory=get_current_datetime)
    status: CaseStatus = Field(default=CaseStatus.NOT_STARTED)
    user_id: PydanticObjectId = Field(..., description="ID of the user who owns this case")
    plaintiff_arguments: List[Dict[str, Union[str, PydanticObjectId, datetime]]] = Field(
        default_factory=list,
        description="Contains arguments with 'type', 'content', 'user_id', and 'timestamp'"
    )
    defendant_arguments: List[Dict[str, Union[str, PydanticObjectId, datetime]]] = Field(
        default_factory=list,
        description="Contains arguments with 'type', 'content', 'user_id', and 'timestamp'"
    )
    verdict: Optional[str] = None

    class Settings:
        name = "cases"