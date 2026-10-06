# app/models/user_session.py
from datetime import datetime
from typing import ClassVar

from beanie import Document, PydanticObjectId
from pymongo import IndexModel


class UserSession(Document):
    """One signed-in device: created at sign-in, its id travels in the JWT as ``sid``.

    Revoking a session signs that device out on its next request.
    """

    sid: str
    user_id: PydanticObjectId
    created_at: datetime
    last_active: datetime
    expires_at: datetime
    user_agent: str | None = None
    ip: str | None = None
    revoked: bool = False

    class Settings:
        name = "user_sessions"
        indexes: ClassVar[list[IndexModel]] = [
            IndexModel([("sid", 1)], unique=True),
            IndexModel([("user_id", 1)]),
            # MongoDB drops each record once its token can no longer be used.
            IndexModel([("expires_at", 1)], expireAfterSeconds=0),
        ]
