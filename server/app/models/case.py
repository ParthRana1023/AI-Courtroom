import uuid
from datetime import UTC, datetime
from enum import Enum
from typing import ClassVar

from beanie import Document
from pydantic import BaseModel, Field, field_validator
from pydantic_mongo import PydanticObjectId
from pymongo import IndexModel

from app.models.party import PartyInvolved
from app.utils.datetime import get_current_datetime
from app.utils.locks import case_lock


class CaseStatus(str, Enum):
    NOT_STARTED = "not started"
    ACTIVE = "active"
    ADJOURNED = "adjourned"  # Court session paused/on break - can resume
    RESOLVED = "resolved"


class Roles(str, Enum):
    PLAINTIFF = "plaintiff"
    DEFENDANT = "defendant"
    NOT_STARTED = "not_started"


class CaseOutcome(str, Enum):
    """How the verdict went for the user, decided once after the verdict."""

    WON = "won"
    LOST = "lost"
    PARTIAL = "partial"


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
    # The party message or courtroom event this was extracted from, so the same
    # one can't be extracted twice.
    origin_id: str | None = None


def party_message_id(message: dict, index: int) -> str:
    """A party-chat message's id; old messages saved without one use msg-<index>."""
    return message.get("id") or f"msg-{index}"


# Witness examination models
class WitnessPhase(str, Enum):
    """Order of examination (BSA s.143): the side that called the witness examines
    in chief, the other side cross-examines, then the calling side may re-examine
    on matters raised in cross. After that the witness is discharged."""

    CHIEF = "chief"
    CROSS = "cross"
    RE_EXAM = "re_exam"


class ExaminationItem(BaseModel):
    """A single Q&A exchange during witness examination"""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    examiner: str  # 'plaintiff', 'defendant', or 'judge'
    question: str
    answer: str
    phase: WitnessPhase | None = None  # None on questions asked before phases
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
    phase: WitnessPhase = WitnessPhase.CHIEF

    def examining_side(self) -> str:
        """Whose turn it is: the caller in chief and re-examination, else the other side."""
        if self.phase == WitnessPhase.CROSS:
            return "defendant" if self.called_by == "plaintiff" else "plaintiff"
        return self.called_by

    def phase_after_this_turn(self) -> "WitnessPhase | None":
        """The next phase once the current examiner finishes; None = discharge."""
        if self.phase == WitnessPhase.CHIEF:
            return WitnessPhase.CROSS
        if self.phase == WitnessPhase.CROSS:
            # Re-examination is only on matters raised in cross; no cross, nothing to re-examine.
            cross_asked = any(e.phase == WitnessPhase.CROSS for e in self.examination)
            return WitnessPhase.RE_EXAM if cross_asked else None
        return None


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
    analyzed_at: datetime | None = None
    # Set once by the outcome classifier after the verdict; never changed after.
    outcome: CaseOutcome | None = None
    outcome_reason: str | None = None
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
    # Set when the court was adjourned because the user's session ended (logout
    # or expiry). Party chat stays closed until the user resumes the hearing.
    adjourned_by_session_end: bool = False
    # Rolling summary of the oldest proceedings, used when the full record is
    # too long to send to the AI; covers the first N transcript lines.
    proceedings_summary: str | None = None
    proceedings_summary_covers: int = 0
    # The login session running the hearing, so logging out on one device
    # doesn't adjourn a hearing another device is using.
    active_session_id: str | None = None
    active_session_expires_at: datetime | None = None
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

    def get_party_message(self, party_id: str, message_id: str) -> dict | None:
        for index, message in enumerate(self.party_chats.get(party_id) or []):
            if party_message_id(message, index) == message_id:
                return message
        return None

    def adjourn(self, by_session_end: bool = False) -> None:
        """Stop the hearing: end any AI examination and send the witness home."""
        self.is_ai_examining = False
        if self.current_witness_id:
            self.dismiss_current_witness(" because the court was adjourned")
        self.status = CaseStatus.ADJOURNED
        self.adjourned_by_session_end = by_session_end
        self.active_session_id = None
        self.active_session_expires_at = None

    def claim_session(self, session_id: str | None, expires_at: datetime) -> None:
        """Record the login session now running this hearing."""
        self.active_session_id = session_id
        self.active_session_expires_at = expires_at

    def session_expired(self) -> bool:
        expires_at = self.active_session_expires_at
        if expires_at is None:
            return False
        if expires_at.tzinfo is None:  # MongoDB returns naive UTC datetimes
            expires_at = expires_at.replace(tzinfo=UTC)
        return expires_at <= datetime.now(UTC)

    # The AI lawyer's private conferences live in the case document under this
    # key, but are deliberately NOT a model field: normal loads never read them,
    # they are never serialised to the user, and save() ($set of model fields
    # only) leaves them untouched. Read/write them through the two helpers.
    AI_PARTY_CHATS: ClassVar[str] = "ai_party_chats"

    @classmethod
    async def load_ai_party_chats(
        cls, case_id, party_id: str | None = None
    ) -> dict[str, list[dict]]:
        """{party_id: [messages]} for the case (or just one party's)."""
        field = f"{cls.AI_PARTY_CHATS}.{party_id}" if party_id else cls.AI_PARTY_CHATS
        doc = await cls.get_pymongo_collection().find_one({"_id": case_id}, {field: 1})
        return (doc or {}).get(cls.AI_PARTY_CHATS) or {}

    @classmethod
    async def append_ai_party_chat(
        cls, case_id, party_id: str, messages: list[dict]
    ) -> None:
        await cls.get_pymongo_collection().update_one(
            {"_id": case_id},
            {"$push": {f"{cls.AI_PARTY_CHATS}.{party_id}": {"$each": messages}}},
        )

    # When the AI lawyer's post-adjournment conferences must finish by. Hidden
    # like AI_PARTY_CHATS so a stale save of the case can't reset it.
    COUNSEL_RECESS_UNTIL: ClassVar[str] = "counsel_recess_until"

    @classmethod
    async def get_counsel_recess(cls, case_id) -> datetime | None:
        doc = await cls.get_pymongo_collection().find_one(
            {"_id": case_id}, {cls.COUNSEL_RECESS_UNTIL: 1}
        )
        until = (doc or {}).get(cls.COUNSEL_RECESS_UNTIL)
        if until is not None and until.tzinfo is None:  # MongoDB returns naive UTC
            until = until.replace(tzinfo=UTC)
        return until

    @classmethod
    async def set_counsel_recess(cls, case_id, until: datetime | None) -> None:
        await cls.get_pymongo_collection().update_one(
            {"_id": case_id}, {"$set": {cls.COUNSEL_RECESS_UNTIL: until}}
        )

    @classmethod
    async def _adjourn_running(cls, user_id, should_adjourn) -> int:
        cases = await cls.find(
            cls.user_id == user_id,
            cls.status == CaseStatus.ACTIVE,
            cls.is_deleted != True,
        ).to_list()
        adjourned = 0
        for case in cases:
            async with case_lock(case.cnr):
                fresh = await cls.get(case.id)  # may have changed while we waited
                if (
                    fresh
                    and fresh.status == CaseStatus.ACTIVE
                    and should_adjourn(fresh)
                ):
                    fresh.adjourn(by_session_end=True)
                    await fresh.save()
                    adjourned += 1
        return adjourned

    @classmethod
    async def adjourn_session_cases(cls, user_id, session_id: str | None) -> int:
        """On logout: adjourn hearings run by this session (or by no known session)."""
        return await cls._adjourn_running(
            user_id,
            lambda case: (
                session_id is None or case.active_session_id in (session_id, None)
            ),
        )

    @classmethod
    async def adjourn_abandoned_cases(cls, user_id) -> int:
        """On login: adjourn hearings whose session expired or is unknown."""
        return await cls._adjourn_running(
            user_id,
            lambda case: case.active_session_id is None or case.session_expired(),
        )

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
        indexes: ClassVar[list[IndexModel]] = [
            IndexModel([("cnr", 1)], unique=True),
            IndexModel([("user_id", 1), ("status", 1)]),
        ]
