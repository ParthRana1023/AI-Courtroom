"""
Pydantic schemas for client-side logging.

The endpoint takes logs from signed-out visitors too, so every field is capped:
long text is cut short (one long stack trace shouldn't lose the whole batch)
and a batch has at most MAX_BATCH entries.
"""

import json
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

MAX_BATCH = 100
MAX_CONTEXT_CHARS = 4000
TEXT_LIMITS = {
    "category": 50,
    "message": 2000,
    "timestamp": 40,
    "session_id": 100,
    "user_id": 100,
    "url": 2000,
    "user_agent": 500,
    "error_name": 200,
    "error_stack": 8000,
    "component_stack": 8000,
}


class ClientLogEntry(BaseModel):
    """Single log entry from client."""

    level: Literal["debug", "info", "warn", "error"]
    category: str  # "api", "auth", "courtroom", etc.
    message: str
    timestamp: str  # ISO 8601 format
    session_id: str  # Browser session ID
    user_id: str | None = None  # If authenticated
    url: str  # Page URL where log occurred
    user_agent: str  # Browser info
    error_name: str | None = None  # Error name (for error logs)
    error_stack: str | None = None  # Error stack trace
    component_stack: str | None = None  # React component stack
    context: dict | None = None  # Arbitrary metadata
    duration_ms: float | None = None  # For performance logs

    @model_validator(mode="before")
    @classmethod
    def cap_sizes(cls, data: Any) -> Any:
        """Cut long text short and drop oversized metadata."""
        if not isinstance(data, dict):
            return data
        data = {
            key: (
                value[: TEXT_LIMITS[key]]
                if key in TEXT_LIMITS and isinstance(value, str)
                else value
            )
            for key, value in data.items()
        }
        context = data.get("context")
        if (
            isinstance(context, dict)
            and len(json.dumps(context, default=str)) > MAX_CONTEXT_CHARS
        ):
            data["context"] = {"truncated": True}
        return data


class ClientLogBatch(BaseModel):
    """Batch of log entries from client."""

    logs: list[ClientLogEntry] = Field(max_length=MAX_BATCH)
