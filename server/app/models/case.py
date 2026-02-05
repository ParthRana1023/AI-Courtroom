from typing import List, Optional
from pydantic import Field, BaseModel
from pydantic_mongo import PydanticObjectId
from datetime import datetime
from enum import Enum
from beanie import Document
from app.utils.datetime import get_current_datetime
from app.models.party import PartyRole, PartyInvolved, PartyChatMessage
import uuid

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

class CourtroomProceedingsEventType(str, Enum):
    ARGUMENT = "user_argument"
    AI_ARGUMENT = "ai_argument"
    OPENING_STATEMENT = "opening_statement"
    WITNESS_CALLED = "witness_called"
    WITNESS_EXAMINED_Q = "witness_examined_q"  # Question
    WITNESS_EXAMINED_A = "witness_examined_a"  # Answer
    WITNESS_DISMISSED = "witness_dismissed"
    SYSTEM_MESSAGE = "system_message"

class CourtroomProceedingsEvent(BaseModel):
    """A single event in the ordered courtroom proceedings"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: CourtroomProceedingsEventType
    timestamp: datetime = Field(default_factory=get_current_datetime)
    
    # Content fields - populated based on type
    content: Optional[str] = None  # For arguments, messages, etc.
    speaker_role: Optional[str] = None  # Who performed the action (plaintiff/defendant/judge/witness)
    speaker_name: Optional[str] = None  # Name of speaker (e.g. Witness Name)
    
    # Witness specific fields
    witness_id: Optional[str] = None
    question: Optional[str] = None
    answer: Optional[str] = None

# Witness examination models
class ExaminationItem(BaseModel):
    """A single Q&A exchange during witness examination"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    examiner: str  # 'plaintiff', 'defendant', or 'judge'
    question: str
    answer: str
    objection: Optional[str] = None
    objection_ruling: Optional[str] = None
    timestamp: datetime = Field(default_factory=get_current_datetime)


class WitnessTestimony(BaseModel):
    """Complete testimony from a witness examination session"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    witness_id: str  # Party ID
    witness_name: str
    called_by: str  # 'plaintiff', 'defendant', or 'judge'
    examination: List[ExaminationItem] = Field(default_factory=list)
    started_at: datetime = Field(default_factory=get_current_datetime)
    ended_at: Optional[datetime] = None


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
    
    # Unified timeline of events
    courtroom_proceedings: List[CourtroomProceedingsEvent] = Field(
        default_factory=list,
        description="Ordered list of all courtroom events including arguments and witness interactions"
    )
    
    is_ai_examining: bool = Field(
        default=False,
        description="Flag indicating if AI is currently running a background cross-examination"
    )

    verdict: Optional[str] = None
    analysis: Optional[str] = Field(default=None)
    # Track user arguments at session start (for per-session end session validation)
    session_args_at_start: int = Field(
        default=0,
        description="Number of user arguments when courtroom session became ACTIVE. Used to ensure user submits 2 args per session."
    )
    # Parties involved in the case (applicants and non-applicants)
    parties_involved: List[PartyInvolved] = Field(
        default_factory=list,
        description="List of parties involved in the case with their roles"
    )
    # Chat history with parties involved (keyed by party_id (same as person_id historically))
    party_chats: dict = Field(
        default_factory=dict,
        description="Chat history per party: {party_id: [PartyChatMessage, ...]}"
    )
    # Witness examination fields
    witness_testimonies: List[WitnessTestimony] = Field(
        default_factory=list,
        description="List of witness testimonies given during the case"
    )
    current_witness_id: Optional[str] = Field(
        default=None,
        description="ID of the witness currently on the stand (None if no active examination)"
    )
    # Soft delete fields
    is_deleted: bool = Field(default=False, description="Whether the case is soft-deleted")
    deleted_at: Optional[datetime] = Field(default=None, description="Timestamp when the case was soft-deleted")

    class Settings:
        name = "cases"
