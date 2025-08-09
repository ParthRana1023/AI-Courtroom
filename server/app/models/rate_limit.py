from datetime import datetime
from typing import Optional
from beanie import Document, Indexed
from pydantic import Field
from app.utils.datetime import get_current_datetime

class RateLimitEntry(Document):
    user_id: Indexed(str)
    timestamp: datetime = Field(default_factory=get_current_datetime)
    rate_limiter_type: str
    expiration_time: Optional[datetime] = None

    class Settings:
        name = "rate_limit_entries"