from typing import List, Optional
from pydantic import Field, BaseModel
from pydantic_mongo import PydanticObjectId
from datetime import datetime
from enum import Enum
from beanie import Document
from app.utils.datetime import get_current_datetime

class CaseStatus(str, Enum):
    NOT_STARTED = "not started"
    ACTIVE = "active"
    RESOLVED = "resolved"

# Define a model for the items within the argument lists
class ArgumentItem(BaseModel):
    type: str
    content: str
    user_id: Optional[PydanticObjectId] = Field(None, description="ID of the user who added this argument, optional")
    timestamp: datetime = Field(default_factory=get_current_datetime)

class Case(Document):
    cnr: str = Field(..., min_length=16, max_length=16)
    details: str
    title: str = ""
    created_at: datetime = Field(default_factory=get_current_datetime)
    status: CaseStatus = Field(default=CaseStatus.NOT_STARTED)
    user_id: PydanticObjectId = Field(..., description="ID of the user who owns this case")
    plaintiff_arguments: List[ArgumentItem] = Field(
        default_factory=list,
        description="Contains arguments with 'type', 'content', 'user_id', and 'timestamp'"
    )
    defendant_arguments: List[ArgumentItem] = Field(
        default_factory=list,
        description="Contains arguments with 'type', 'content', 'user_id', and 'timestamp'"
    )
    verdict: Optional[str] = None

    class Settings:
        name = "cases"