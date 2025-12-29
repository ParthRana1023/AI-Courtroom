from typing import List, Optional
from pydantic import Field, BaseModel
from pydantic_mongo import PydanticObjectId
from datetime import datetime
from enum import Enum
from beanie import Document
from app.utils.datetime import get_current_datetime
from app.models.person import PersonRole, PersonInvolved, PersonChatMessage

class CaseStatus(str, Enum):
    NOT_STARTED = "not started"
    ACTIVE = "active"
    ADJOURNED = "adjourned"  # Court session paused/on break - can resume
    RESOLVED = "resolved"

class Roles(str, Enum):
    PLAINTIFF = "plaintiff"
    DEFENDANT = "defendant"
    NOT_STARTED = "not_started"

class Sides(BaseModel):
    user_role: Roles = Field(default=Roles.NOT_STARTED)
    ai_role: Roles = Field(default=Roles.NOT_STARTED)

# Define a model for the items within the argument lists
class ArgumentItem(BaseModel):
    type: str
    content: str
    user_id: Optional[PydanticObjectId] = Field(None, description="ID of the user who added this argument, optional")
    role: Roles = Field(default=Roles.NOT_STARTED)
    timestamp: datetime = Field(default_factory=get_current_datetime)

class Case(Document):
    cnr: str = Field(..., min_length=16, max_length=16)
    details: str
    title: str = ""
    created_at: datetime = Field(default_factory=get_current_datetime)
    status: CaseStatus = Field(default=CaseStatus.NOT_STARTED)
    user_id: PydanticObjectId = Field(..., description="ID of the user who owns this case")
    user_role: Roles = Field(default=Roles.NOT_STARTED)  # Default role is not started
    ai_role: Roles = Field(default=Roles.NOT_STARTED)  # Default role is not started
    plaintiff_arguments: List[ArgumentItem] = Field(
        default_factory=list,
        description="Contains arguments with 'type', 'content', 'user_id', and 'timestamp'"
    )
    defendant_arguments: List[ArgumentItem] = Field(
        default_factory=list,
        description="Contains arguments with 'type', 'content', 'user_id', and 'timestamp'"
    )
    verdict: Optional[str] = None
    analysis: Optional[str] = Field(default=None)
    # Track user arguments at session start (for per-session end session validation)
    session_args_at_start: int = Field(
        default=0,
        description="Number of user arguments when courtroom session became ACTIVE. Used to ensure user submits 2 args per session."
    )
    # People involved in the case (applicants and non-applicants)
    people_involved: List[PersonInvolved] = Field(
        default_factory=list,
        description="List of people involved in the case with their roles"
    )
    # Chat history with people involved (keyed by person_id)
    person_chats: dict = Field(
        default_factory=dict,
        description="Chat history per person: {person_id: [PersonChatMessage, ...]}"
    )
    # Soft delete fields
    is_deleted: bool = Field(default=False, description="Whether the case is soft-deleted")
    deleted_at: Optional[datetime] = Field(default=None, description="Timestamp when the case was soft-deleted")

    class Settings:
        name = "cases"