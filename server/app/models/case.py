import uuid
from datetime import datetime
from enum import Enum

from beanie import Document
from pydantic import BaseModel, Field, field_validator
from pydantic_mongo import PydanticObjectId

from app.models.party import PartyInvolved
from app.utils.datetime import get_current_datetime


class CaseStatus(str, Enum):
    NOT_STARTED = "not started"
    ACTIVE = "active"
    ADJOURNED = "adjourned"  # Court session paused/on break - can resume
    RESOLVED = "resolved"


class Roles(str, Enum):
    PLAINTIFF = "plaintiff"
    DEFENDANT = "defendant"
    NOT_STARTED = "not_started"


class EvidenceMediaStatus(str, Enum):
    NOT_REQUESTED = "not_requested"
    PENDING = "pending"
    GENERATED = "generated"
    FAILED = "failed"


# Define a model for the items within the argument lists
class ArgumentItem(BaseModel):
    type: str
    content: str
    user_id: PydanticObjectId | None = Field(
        None, description="ID of the user who added this argument, optional"
    )
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
    content: str | None = None  # For arguments, messages, etc.
    speaker_role: str | None = (
        None  # Who performed the action (plaintiff/defendant/judge/witness)
    )
    speaker_name: str | None = None  # Name of speaker (e.g. Witness Name)

    # Witness specific fields
    witness_id: str | None = None
    question: str | None = None
    answer: str | None = None


class EvidenceItem(BaseModel):
    """Structured textual evidence for a case, with future image metadata."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    exhibit_ref: str
    title: str
    evidence_type: str
    description: str
    source: str | None = None
    image_prompt: str | None = None
    image_url: str | None = None
    image_public_id: str | None = None
    media_status: EvidenceMediaStatus = Field(default=EvidenceMediaStatus.NOT_REQUESTED)


# Witness examination models
class ExaminationItem(BaseModel):
    """A single Q&A exchange during witness examination"""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    examiner: str  # 'plaintiff', 'defendant', or 'judge'
    question: str
    answer: str
    objection: str | None = None
    objection_ruling: str | None = None
    timestamp: datetime = Field(default_factory=get_current_datetime)


class WitnessTestimony(BaseModel):
    """Complete testimony from a witness examination session"""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    witness_id: str  # Party ID
    witness_name: str
    called_by: str  # 'plaintiff', 'defendant', or 'judge'
    examination: list[ExaminationItem] = Field(default_factory=list)
    started_at: datetime = Field(default_factory=get_current_datetime)
    ended_at: datetime | None = None


class Case(Document):
    cnr: str = Field(..., min_length=16, max_length=16)
    details: str
    title: str = ""
    created_at: datetime = Field(default_factory=get_current_datetime)
    status: CaseStatus = Field(default=CaseStatus.NOT_STARTED)
    user_id: PydanticObjectId = Field(
        ..., description="ID of the user who owns this case"
    )
    user_role: Roles = Field(default=Roles.NOT_STARTED)  # Default role is not started
    ai_role: Roles = Field(default=Roles.NOT_STARTED)  # Default role is not started
    plaintiff_arguments: list[ArgumentItem] = Field(
        default_factory=list,
        description="Contains arguments with 'type', 'content', 'user_id', and 'timestamp'",
    )
    defendant_arguments: list[ArgumentItem] = Field(
        default_factory=list,
        description="Contains arguments with 'type', 'content', 'user_id', and 'timestamp'",
    )

    # Unified timeline of events
    courtroom_proceedings: list[CourtroomProceedingsEvent] = Field(
        default_factory=list,
        description="Ordered list of all courtroom events including arguments and witness interactions",
    )

    is_ai_examining: bool = Field(
        default=False,
        description="Flag indicating if AI is currently running a background cross-examination",
    )

    verdict: str | None = None
    analysis: str | None = Field(default=None)
    # Track user arguments at session start (for per-session end session validation)
    session_args_at_start: int = Field(
        default=0,
        description="Number of user arguments when courtroom session became ACTIVE. Used to ensure user submits 2 args per session.",
    )
    # Parties involved in the case (applicants and non-applicants)
    parties_involved: list[PartyInvolved] = Field(
        default_factory=list,
        description="List of parties involved in the case with their roles",
    )
    evidence: list[EvidenceItem] = Field(
        default_factory=list,
        description="Structured evidence and exhibit metadata for the case",
    )
    # Chat history with parties involved (keyed by party_id (same as person_id historically))
    party_chats: dict = Field(
        default_factory=dict,
        description="Chat history per party: {party_id: [PartyChatMessage, ...]}",
    )
    # Witness examination fields
    witness_testimonies: list[WitnessTestimony] = Field(
        default_factory=list,
        description="List of witness testimonies given during the case",
    )
    current_witness_id: str | None = Field(
        default=None,
        description="ID of the witness currently on the stand (None if no active examination)",
    )
    # Soft delete fields
    is_deleted: bool = Field(
        default=False, description="Whether the case is soft-deleted"
    )
    deleted_at: datetime | None = Field(
        default=None, description="Timestamp when the case was soft-deleted"
    )

    @field_validator(
        "plaintiff_arguments",
        "defendant_arguments",
        "courtroom_proceedings",
        "parties_involved",
        "evidence",
        "witness_testimonies",
        mode="before",
    )
    @classmethod
    def normalize_legacy_null_lists(cls, value):
        return [] if value is None else value

    def get_party(self, party_id: str | None) -> PartyInvolved | None:
        return next((p for p in self.parties_involved if p.id == party_id), None)

    def dismiss_current_witness(self, reason: str = "") -> tuple[str | None, str, int]:
        """End the open testimony, clear the stand and log the dismissal.

        Returns (witness_id, witness_name, questions_asked).
        """
        witness_id = self.current_witness_id
        testimony = next(
            (
                t
                for t in self.witness_testimonies
                if t.witness_id == witness_id and t.ended_at is None
            ),
            None,
        )
        party = self.get_party(witness_id)
        name = (
            (testimony.witness_name if testimony else None)
            or (party.name if party else None)
            or "Witness"
        )
        if testimony:
            testimony.ended_at = get_current_datetime()
        self.current_witness_id = None
        self.is_ai_examining = False
        self.courtroom_proceedings.append(
            CourtroomProceedingsEvent(
                type=CourtroomProceedingsEventType.WITNESS_DISMISSED,
                content=f"{name} dismissed from the stand{reason}.",
                speaker_role="judge",
                speaker_name="Judge",
                witness_id=witness_id,
                timestamp=get_current_datetime(),
            )
        )
        return witness_id, name, len(testimony.examination) if testimony else 0

    class Settings:
        name = "cases"
