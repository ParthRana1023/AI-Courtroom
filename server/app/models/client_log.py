from datetime import datetime
from typing import ClassVar

from beanie import Document
from pydantic import Field
from pymongo import IndexModel

from app.utils.datetime import get_current_datetime


class ClientLog(Document):
    """Client-side log entry stored in MongoDB."""

    # Log metadata
    timestamp: datetime = Field(default_factory=get_current_datetime)
    level: str  # "debug", "info", "warn", "error"
    category: str  # "api", "auth", "courtroom", etc.
    message: str

    # Context
    session_id: str  # Browser session ID
    user_id: str | None = None  # If authenticated
    url: str  # Page URL where log occurred
    user_agent: str  # Browser info

    # Error details (for error logs)
    error_name: str | None = None
    error_stack: str | None = None
    component_stack: str | None = None  # React component stack

    # Additional context
    context: dict | None = None  # Arbitrary metadata
    duration_ms: float | None = None  # For performance logs

    # Request correlation
    request_id: str | None = None

    class Settings:
        name = "client_logs"
        indexes: ClassVar[list[IndexModel]] = [
            # Keep 30 days of client logs.
            IndexModel([("timestamp", 1)], expireAfterSeconds=30 * 24 * 3600),
        ]
