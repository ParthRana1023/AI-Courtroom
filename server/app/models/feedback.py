from datetime import datetime

from beanie import Document
from pydantic import Field

from app.utils.datetime import get_current_datetime


class Feedback(Document):
    # Signed-in senders: their account. Guests: the name and email they typed.
    user_id: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    name: str | None = None
    email: str | None = None
    phone_number: str | None = None
    feedback_category: str
    message: str = ""
    # Account recovery: the email or phone on the deleted account, and when it went.
    account_identifier: str | None = None
    deleted_on: str | None = None  # YYYY-MM-DD
    ip: str | None = None
    created_at: datetime = Field(default_factory=get_current_datetime)

    class Settings:
        name = "feedback"
