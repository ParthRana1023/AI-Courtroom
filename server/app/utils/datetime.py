"""Datetime and timezone utility functions for AI-Courtroom server"""

from datetime import datetime, timedelta
import pytz
from typing import Optional

# Default timezone for the application
DEFAULT_TIMEZONE = 'Asia/Kolkata'

def get_timezone():
    """Get the default timezone object"""
    return pytz.timezone(DEFAULT_TIMEZONE)

def get_current_datetime() -> datetime:
    """Get current datetime in Asia/Kolkata timezone"""
    return datetime.now(get_timezone())

def get_current_timestamp() -> datetime:
    """Alias for get_current_datetime for backward compatibility"""
    return get_current_datetime()

def create_expiry_time(minutes: int = 15) -> datetime:
    """Create expiry time for tokens/OTPs"""
    return get_current_datetime() + timedelta(minutes=minutes)

def create_jwt_expiry(expires_delta: Optional[timedelta] = None) -> datetime:
    """Create JWT token expiry time"""
    if expires_delta:
        return get_current_datetime() + expires_delta
    return get_current_datetime() + timedelta(minutes=15)

def is_expired(expiry_time: datetime) -> bool:
    """Check if a timestamp has expired"""
    return get_current_datetime() > expiry_time

def format_reset_time(timestamp: float) -> str:
    """Format timestamp for rate limiter reset time display"""
    return datetime.fromtimestamp(timestamp).strftime('%H:%M:%S')