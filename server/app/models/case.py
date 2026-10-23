import uuid
from datetime import UTC, date, datetime, timedelta
from enum import Enum
from typing import ClassVar, Literal

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
    SETTLED = "settled"  # the parties compromised and the court recorded it


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
    exhibit_refs: list[str] = Field(default_factory=list)


class CourtroomProceedingsEventType(str, Enum):
    ARGUMENT = "user_argument"
    AI_ARGUMENT = "ai_argument"
    OPENING_STATEMENT = "opening_statement"
    WITNESS_CALLED = "witness_called"
    WITNESS_EXAMINED_Q = "witness_examined_q"  # Question
    WITNESS_EXAMINED_A = "witness_examined_a"  # Answer
    WITNESS_DISMISSED = "witness_dismissed"
    SYSTEM_MESSAGE = "system_message"
    CLOSING_STATEMENT = "closing_statement"
    LEAVE_REQUEST = "leave_request"  # a side asks the court's leave to call a witness
    OBJECTION = "objection"
    RULING = "ruling"  # the judge rules on an objection
    SETTLEMENT = "settlement"  # the court rules on a compromise put before it


class Objection(BaseModel):
    """What an objection was raised against, and why."""

    target_id: str  # the courtroom event objected to
    grounds: str
    details: str = ""


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

    # Exhibits the speaker relied on (EvidenceItem.exhibit_ref values)
    exhibit_refs: list[str] = Field(default_factory=list)
    objection: Objection | None = None  # on OBJECTION events
    # On RULING events; on SETTLEMENT events, whether the court granted the request.
    sustained: bool | None = None
    # On SETTLEMENT events: a short label beside the speaker (the State's stand, the
    # court's ruling, a complainant who is unsure).
    tag: str | None = None
    # Set by a sustained objection: "struck" from the record, or question "withdrawn"
    struck: Literal["struck", "withdrawn"] | None = None


class PendingLeave(BaseModel):
    """The AI has asked leave to call a witness; the hearing waits for the user."""

    event_id: str  # the LEAVE_REQUEST event
    witness_id: str
    witness_name: str
    called_by: str


class SettlementStatus(str, Enum):
    NEGOTIATING = "negotiating"  # offers going back and forth
    AGREED = "agreed"  # both sides agree; the deed is drafted
    SIGNED = "signed"  # every signatory has signed the deed
    FILED = "filed"  # the deed is filed and the hearing listed
    ADJOURNED = "adjourned"  # the court put the hearing off to another date
    RECORDED = "recorded"  # the court accepted it; the case is over
    REFUSED = "refused"  # the court refused it; the hearing goes on
    REJECTED = "rejected"  # the other side walked away
    WITHDRAWN = "withdrawn"  # the user called it off


# How the case can be settled, which depends on its offences and stage:
# quash = s.528 BNSS in the High Court, compound = s.359 BNSS before the trial court,
# plea = plea bargaining, ss.289-295 BNSS, before the trial court; none = no route open.
SettlementRoute = Literal["quash", "compound", "plea", "none"]
INSTALMENTS = (1, 2, 3, 4, 6)
MONTHS = (3, 6, 9, 12, 18)


class RouteItem(BaseModel):
    """One line of the route card: a section, what it is, and why it matters here."""

    section: str  # "§ 318(4)"
    title: str
    note: str


class SettlementCondition(BaseModel):
    """A term beyond money that fits this case, which either side can put in an offer."""

    key: str
    label: str  # the offer toggle: "First instalment deposited in court"
    short: str  # in the negotiation log: "Deposit in court"
    clause: str  # the clause in the deed
    favours: Literal["accused", "complainants"]


class SettlementProfile(BaseModel):
    """The settlement route for a case, worked out once from the case file."""

    route: SettlementRoute
    title: str = ""  # "Quashing on compromise"
    court: str = ""  # "§ 528 BNSS · High Court of Delhi"
    offences: list[RouteItem] = Field(default_factory=list)
    must: str = ""  # the rule in bold: "All eleven complainants must sign."
    must_detail: str = ""
    footnote: str = ""
    closed: list[RouteItem] = Field(default_factory=list)  # why each route is shut
    conditions: list[SettlementCondition] = Field(default_factory=list)
    accused: str = ""
    accused_side: Literal["plaintiff", "defendant"] = "plaintiff"
    complainants: list[str] = Field(default_factory=list)  # the lead first
    claim: int = 0  # the sum in dispute, in rupees
    # Plea bargaining only: they take part in the disposition meeting and sign its report.
    prosecutor: str = ""
    officer: str = ""


class SettlementTerms(BaseModel):
    amount: int = Field(ge=0, le=10_000_000_000)  # rupees
    instalments: Literal[1, 2, 3, 4, 6]
    months: Literal[3, 6, 9, 12, 18]
    interest: float = Field(ge=0, le=18)  # per cent a year
    conditions: list[str] = Field(default_factory=list)  # SettlementCondition keys


class SettlementEntry(BaseModel):
    """One move across the table: an offer, a counter, an answer, or the end of talks."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    by: Literal["user", "ai"]
    kind: Literal["offer", "counter", "accept", "refuse", "ended"]
    terms: SettlementTerms | None = None  # on offers and counters
    note: str = ""  # what counsel said with it
    at: datetime = Field(default_factory=get_current_datetime)


class HearingLine(BaseModel):
    """A line of the settlement hearing's record after counsel's submission."""

    kind: Literal["speech", "question", "answer", "system"]
    role: Literal["court", "other", "state", "complainant", "accused", "system"] = (
        "system"
    )
    who: str = ""
    tag: str = ""  # the State's stand: "No objection", "Opposes", "Agrees"
    unsure: bool = False  # an answer that leaves the court in doubt
    text: str


class HearingCheck(BaseModel):
    """One thing the court must be satisfied of before it acts on the compromise."""

    label: str
    state: Literal["ok", "unsure", "fail"]
    text: str


class SettlementHearing(BaseModel):
    submission: str  # what the user told the court
    lines: list[HearingLine] = Field(default_factory=list)
    checks: list[HearingCheck] = Field(default_factory=list)
    outcome: Literal["granted", "refused", "adjourned"]
    judge: str
    order: list[str] = Field(default_factory=list)  # numbered paragraphs
    next_date: date | None = None  # refused or adjourned: when the case is next listed
    held_at: datetime = Field(default_factory=get_current_datetime)


class Payment(BaseModel):
    """An instalment owed under the order. Whether it is paid, due or missed is worked
    out when it is read (settlement_payments.status)."""

    amount: int  # rupees, interest included on the last
    due: date
    paid_at: datetime | None = None
    remedy: Literal["recall", "notice", "recover"] | None = None
    remedy_at: datetime | None = None


class ScoreFactor(BaseModel):
    key: Literal["terms", "closed", "offers", "conditions"]
    label: str
    weight: int  # per cent of the score
    value: int  # 0-100
    text: str


class CoachNote(BaseModel):
    kind: Literal["worked", "improve"]
    text: str


class NegotiationAnalysis(BaseModel):
    """How the user negotiated, judged once the case is decided: the score, the best
    deal the other side would likely have taken, and whether settling was right."""

    score: int  # 0-100, the factors weighted
    tier: str
    factors: list[ScoreFactor]
    best: SettlementTerms | None = None  # the best terms the other side would take
    best_text: str = ""
    call: Literal["right", "mixed", "wrong"]  # settling rather than fighting it out
    call_text: str
    notes: list[CoachNote] = Field(default_factory=list)
    review: str  # Markdown
    analyzed_at: datetime = Field(default_factory=get_current_datetime)


class Settlement(BaseModel):
    """One attempt to settle the case out of court. Without prejudice: the court
    deciding the merits never sees it."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: SettlementStatus = SettlementStatus.NEGOTIATING
    entries: list[SettlementEntry] = Field(default_factory=list)
    agreed: SettlementTerms | None = None
    signatures: dict[str, datetime] = Field(default_factory=dict)  # signer -> signed at
    filed_at: datetime | None = None
    hearing_date: date | None = None  # the hearing listed on filing
    hearing: SettlementHearing | None = None
    ruling: str | None = None  # the court's ruling as said in court
    court_order: str | None = (
        None  # the order in Markdown, the case's verdict if granted
    )
    payments: list[Payment] = Field(default_factory=list)
    # The instalment the AI side won't pay, drawn once when the order is passed. Never
    # sent to the client.
    defaults_on: int | None = None
    started_at: datetime = Field(default_factory=get_current_datetime)
    ended_at: datetime | None = None

    @property
    def is_open(self) -> bool:
        return self.status in (
            SettlementStatus.NEGOTIATING,
            SettlementStatus.AGREED,
            SettlementStatus.SIGNED,
            SettlementStatus.FILED,
            SettlementStatus.ADJOURNED,
        )

    def user_offers(self) -> int:
        return sum(e.by == "user" and e.terms is not None for e in self.entries)

    def last_terms(self, by: Literal["user", "ai"]) -> SettlementTerms | None:
        return next(
            (e.terms for e in reversed(self.entries) if e.by == by and e.terms), None
        )


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
    # When the image was queued: one pending far longer was lost to a restart.
    image_requested_at: datetime | None = None
    # The party message or courtroom event this was extracted from, so the same
    # one can't be extracted twice.
    origin_id: str | None = None
    # The side whose AI counsel logged it in court; None when the user did.
    extracted_by: str | None = None
    # Drawn from the user's own interviews in Case Prep: privileged (BSA s.132),
    # so only the user sees it until they rely on it in court.
    private: bool = False


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
    pending_leave: PendingLeave | None = None
    # Witnesses the court refused the AI leave to call; it won't ask again.
    refused_witness_ids: list[str] = Field(default_factory=list)
    # Set from the moment the user starts an objection until the court rules;
    # the AI's examination waits meanwhile (see objection_pending).
    objection_pending_at: datetime | None = None
    # AI counsel's objection to the user's turn while that turn is heard: {kind, grounds} as
    # raised, then with {sustained, ruling} once the court rules; None once the turn is over.
    # The client polls it to show the objection and the ruling as they happen.
    ai_objection_live: dict | None = None
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
    # The hearing reminder for the current adjournment went out (one per adjournment).
    reminder_sent_at: datetime | None = None
    # Attempts to settle out of court, oldest first.
    settlements: list[Settlement] = Field(default_factory=list)
    # The settlement route, worked out from the case file the first time it's asked for.
    settlement_profile: SettlementProfile | None = None
    # How a settled case ended: FIR quashed, offences compounded, or a plea bargain.
    settlement_result: Literal["quashed", "compounded", "plea"] | None = None
    # How the user negotiated, generated once the case is decided.
    negotiation: NegotiationAnalysis | None = None
    # Times counsel asked the court in session for an adjournment to settle.
    settlement_adjourn_asks: int = 0

    @field_validator(
        "plaintiff_arguments",
        "defendant_arguments",
        "courtroom_proceedings",
        "parties_involved",
        "evidence",
        "witness_testimonies",
        "settlements",
        mode="before",
    )
    @classmethod
    def normalize_legacy_null_lists(cls, value):
        return [] if value is None else value

    @field_validator("settlements", mode="before")
    @classmethod
    def drop_free_text_settlements(cls, value):
        # Attempts saved before terms were structured ("offers" of free text) came
        # from testing before the settlement desk shipped; nothing reads them.
        return [s for s in value or [] if not (isinstance(s, dict) and "offers" in s)]

    # What the simulation draws and judges by, kept on the server: pass to model_dump
    # wherever a whole case (or its settlements) goes out.
    HIDDEN: ClassVar[dict] = {
        "parties_involved": {"__all__": {"reliability"}},
        "settlements": {"__all__": {"defaults_on"}},
    }

    def open_settlement(self) -> Settlement | None:
        """The attempt still under negotiation or agreed, if any."""
        last = self.settlements[-1] if self.settlements else None
        return last if last and last.is_open else None

    def get_party(self, party_id: str | None) -> PartyInvolved | None:
        return next((p for p in self.parties_involved if p.id == party_id), None)

    def get_party_message(self, party_id: str, message_id: str) -> dict | None:
        for index, message in enumerate(self.party_chats.get(party_id) or []):
            if party_message_id(message, index) == message_id:
                return message
        return None

    def adjourn(
        self, by_session_end: bool = False, note: str = "Court adjourned"
    ) -> None:
        """Stop the hearing: end any AI examination and send the witness home."""
        self.is_ai_examining = False
        self.pending_leave = None
        if self.current_witness_id:
            self.dismiss_current_witness(" because the court was adjourned")
        self.log(note)
        self.status = CaseStatus.ADJOURNED
        self.adjourned_by_session_end = by_session_end
        self.active_session_id = None
        self.active_session_expires_at = None

    def log(self, note: str) -> None:
        """A line from the court in the record (session opened, adjourned...)."""
        self.courtroom_proceedings.append(
            CourtroomProceedingsEvent(
                type=CourtroomProceedingsEventType.SYSTEM_MESSAGE,
                content=note,
                timestamp=get_current_datetime(),
            )
        )

    def open_court(self) -> None:
        """The court sits for the first time. An opening the AI prepared during
        case prep is delivered once the court is in session, not before it."""
        prepared = self.courtroom_proceedings
        self.courtroom_proceedings = []
        self.log("Court is in session")
        for event in prepared:
            event.timestamp = get_current_datetime()
            self.courtroom_proceedings.append(event)

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

    # An objection left open (the user walked away from the dialog) stops
    # holding up the AI's examination after this long.
    OBJECTION_HOLD: ClassVar[timedelta] = timedelta(minutes=5)

    @property
    def objection_pending(self) -> bool:
        """The user is objecting or the court is ruling: the AI examiner waits."""
        at = self.objection_pending_at
        if at is None:
            return False
        if at.tzinfo is None:  # MongoDB returns naive UTC datetimes
            at = at.replace(tzinfo=UTC)
        return datetime.now(UTC) - at < self.OBJECTION_HOLD

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
