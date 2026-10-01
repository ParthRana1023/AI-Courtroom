from datetime import datetime
from typing import ClassVar

from beanie import Document
from pydantic import Field
from pydantic_mongo import PydanticObjectId
from pymongo import IndexModel

from app.models.case import CaseOutcome, Roles
from app.utils.datetime import get_current_datetime


class CaseOutcomeRecord(Document):
    """One decided case, kept for the user's stats.

    Stored apart from the case so the stats survive the case being deleted.
    """

    user_id: PydanticObjectId
    case_id: PydanticObjectId
    cnr: str
    title: str = ""
    role: Roles
    outcome: CaseOutcome
    reason: str = ""
    decided_at: datetime = Field(default_factory=get_current_datetime)

    # What the user did in the case, counted when the outcome was decided
    arguments_count: int = 0
    witnesses_examined: int = 0
    conferences_held: int = 0
    evidence_count: int = 0

    class Settings:
        name = "case_outcomes"
        indexes: ClassVar[list[IndexModel]] = [
            IndexModel([("case_id", 1)], unique=True),
            IndexModel([("user_id", 1), ("decided_at", 1)]),
        ]
