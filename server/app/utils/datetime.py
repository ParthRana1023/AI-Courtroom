"""Datetime and timezone utility functions for AI-Courtroom server"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# Default timezone for the application
DEFAULT_TIMEZONE = "Asia/Kolkata"


def get_timezone():
    """Get the default timezone object"""
    return ZoneInfo(DEFAULT_TIMEZONE)


def get_current_datetime() -> datetime:
    """Get current datetime in Asia/Kolkata timezone"""
    return datetime.now(get_timezone())


def create_expiry_time(minutes: int = 15) -> datetime:
    """Create expiry time for tokens/OTPs"""
    return get_current_datetime() + timedelta(minutes=minutes)


def create_jwt_expiry(expires_delta: timedelta | None = None) -> datetime:
    """Create JWT token expiry time"""
    if expires_delta:
        return get_current_datetime() + expires_delta
    return get_current_datetime() + timedelta(minutes=15)
