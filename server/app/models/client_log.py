"""
MongoDB model for storing client-side logs.
Provides structured storage with automatic TTL-based cleanup.
"""

from datetime import datetime
from typing import Optional
from beanie import Document
from pydantic import Field
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
    user_id: Optional[str] = None  # If authenticated
    url: str  # Page URL where log occurred
    user_agent: str  # Browser info
    
    # Error details (for error logs)
    error_name: Optional[str] = None
    error_stack: Optional[str] = None
    component_stack: Optional[str] = None  # React component stack
    
    # Additional context
    context: Optional[dict] = None  # Arbitrary metadata
    duration_ms: Optional[float] = None  # For performance logs
    
    # Request correlation
    request_id: Optional[str] = None
    
    class Settings:
        name = "client_logs"
