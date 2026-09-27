"""
Pydantic schemas for client-side logging.
"""

from pydantic import BaseModel


class ClientLogEntry(BaseModel):
    """Single log entry from client."""

    level: str  # "debug", "info", "warn", "error"
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


class ClientLogBatch(BaseModel):
    """Batch of log entries from client."""

    logs: list[ClientLogEntry]
