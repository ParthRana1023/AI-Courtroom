"""
Pydantic schemas for client-side logging.
"""

from pydantic import BaseModel
from typing import Optional, List


class ClientLogEntry(BaseModel):
    """Single log entry from client."""
    level: str  # "debug", "info", "warn", "error"
    category: str  # "api", "auth", "courtroom", etc.
    message: str
    timestamp: str  # ISO 8601 format
    session_id: str  # Browser session ID
    user_id: Optional[str] = None  # If authenticated
    url: str  # Page URL where log occurred
    user_agent: str  # Browser info
    error_name: Optional[str] = None  # Error name (for error logs)
    error_stack: Optional[str] = None  # Error stack trace
    component_stack: Optional[str] = None  # React component stack
    context: Optional[dict] = None  # Arbitrary metadata
    duration_ms: Optional[float] = None  # For performance logs


class ClientLogBatch(BaseModel):
    """Batch of log entries from client."""
    logs: List[ClientLogEntry]


class ClientLogStats(BaseModel):
    """Response schema for client log statistics."""
    period: str
    counts: dict
    total: int
