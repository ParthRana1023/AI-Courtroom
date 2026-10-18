from datetime import datetime

from beanie import Document, PydanticObjectId
from pydantic import Field

from app.utils.datetime import get_current_datetime


class Announcement(Document):
    """A product-update email to everyone who opted in (POST /admin/announcements).

    Recipients are walked in user-id order and ``last_user_id`` records how far the
    sending got, so a crash or the daily send limit resumes where it stopped.
    """

    subject: str
    body_html: str  # rendered from the markdown the developer posted
    created_by: PydanticObjectId
    created_at: datetime = Field(default_factory=get_current_datetime)
    last_user_id: PydanticObjectId | None = None
    sent: int = 0
    failed: int = 0
    finished_at: datetime | None = None

    class Settings:
        name = "announcements"
