from datetime import datetime
from typing import ClassVar, Literal

from beanie import Document
from pydantic import Field
from pydantic_mongo import PydanticObjectId
from pymongo import IndexModel

from app.utils.datetime import get_current_datetime

ReportReason = Literal["law", "facts", "harm", "role", "other"]


class Report(Document):
    """A user's report of a bad AI response in the courtroom, for the maker to review."""

    user_id: PydanticObjectId
    cnr: str
    entry_id: str  # courtroom event id, or "verdict"
    reason: ReportReason
    details: str = ""
    excerpt: str = ""  # the reported text, as it stood
    created_at: datetime = Field(default_factory=get_current_datetime)

    class Settings:
        name = "reports"
        indexes: ClassVar[list[IndexModel]] = [
            IndexModel([("user_id", 1), ("cnr", 1), ("entry_id", 1)], unique=True),
        ]
