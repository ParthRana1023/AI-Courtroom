from datetime import datetime
from typing import Annotated, ClassVar

from beanie import Document, Indexed
from pydantic import Field
from pymongo import IndexModel

from app.utils.datetime import get_current_datetime


class RateLimitEntry(Document):
    user_id: Annotated[str, Indexed()]
    timestamp: datetime = Field(default_factory=get_current_datetime)
    rate_limiter_type: str
    expiration_time: datetime

    class Settings:
        name = "rate_limit_entries"
        indexes: ClassVar[list[IndexModel]] = [
            IndexModel([("user_id", 1), ("rate_limiter_type", 1)]),
            # MongoDB deletes each entry once its window has passed.
            IndexModel([("expiration_time", 1)], expireAfterSeconds=0),
        ]
