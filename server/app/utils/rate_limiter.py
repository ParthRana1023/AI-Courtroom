# app/utils/rate_limiter.py
from fastapi import Depends, HTTPException
from starlette.requests import Request
from datetime import timedelta, datetime
from app.utils.datetime import get_current_datetime, get_timezone, get_start_of_next_day
from app.dependencies import get_current_user
from typing import Tuple, Optional
from app.models.user import User
from app.models.rate_limit import RateLimitEntry
import pytz
from app.config import settings
from app.logging_config import get_logger

logger = get_logger(__name__)

def ensure_ist_timezone(dt: datetime) -> datetime:
    """Ensure a datetime is in IST timezone.
    
    MongoDB stores timestamps in UTC internally. This function converts
    any datetime (whether naive, UTC, or other timezone) to IST.
    """
    ist = get_timezone()  # Asia/Kolkata
    
    if dt.tzinfo is None:
        # Naive datetime - assume it's UTC (as MongoDB returns UTC)
        dt = pytz.utc.localize(dt)
    
    # Convert to IST
    return dt.astimezone(ist)

class RateLimiter:
    def __init__(self, requests: int, window: int, rate_limiter_type: str):
        self.requests = requests
        self.window = window
        self.rate_limiter_type = rate_limiter_type

    async def get_remaining_attempts(self, user_id: str) -> Tuple[int, Optional[float]]:
        """Get remaining attempts and time until reset for a user
        
        Returns:
            Tuple containing (remaining_attempts, seconds_until_next_attempt)
            If seconds_until_next_attempt is None, user can submit immediately
        """
        now = get_current_datetime()
        
        # Remove expired timestamps from the database
        await RateLimitEntry.find(
            RateLimitEntry.user_id == user_id,
            RateLimitEntry.rate_limiter_type == self.rate_limiter_type,
            RateLimitEntry.expiration_time <= now
        ).delete()

        valid_entries = await RateLimitEntry.find(
            RateLimitEntry.user_id == user_id,
            RateLimitEntry.rate_limiter_type == self.rate_limiter_type
        ).to_list()
        
        remaining = max(0, self.requests - len(valid_entries))
        
        # If no attempts remaining, calculate time until next attempt is allowed
        if remaining == 0 and valid_entries:
            # Calculate time until reset based on the oldest entry's timestamp plus the window duration
            oldest_entry = min(valid_entries, key=lambda entry: entry.timestamp)
            # Ensure oldest_entry.timestamp is in IST timezone
            oldest_timestamp = ensure_ist_timezone(oldest_entry.timestamp)

            time_until_reset = (oldest_timestamp + timedelta(seconds=self.window) - now).total_seconds()

            logger.debug(f"Rate limit reached for user {user_id}, reset in {time_until_reset:.0f}s")
            return 0, time_until_reset
        
        return remaining, None

    async def check_only(self, request: Request, user: User = Depends(get_current_user)):
        """Check rate limit without registering usage - returns user for later registration"""
        now = get_current_datetime()
        user_id = str(user.id)
        
        # Remove expired timestamps from the database
        await RateLimitEntry.find(
            RateLimitEntry.user_id == user_id,
            RateLimitEntry.rate_limiter_type == self.rate_limiter_type,
            RateLimitEntry.expiration_time <= now
        ).delete()

        current_entries = await RateLimitEntry.find(
            RateLimitEntry.user_id == user_id,
            RateLimitEntry.rate_limiter_type == self.rate_limiter_type
        ).to_list()
        
        if len(current_entries) >= self.requests:
            # Calculate time until reset based on the oldest entry's timestamp plus the window duration
            oldest_entry = min(current_entries, key=lambda entry: entry.timestamp)
            # Ensure oldest_entry.timestamp is in IST timezone
            oldest_timestamp = ensure_ist_timezone(oldest_entry.timestamp)

            time_until_reset = (oldest_timestamp + timedelta(seconds=self.window) - now).total_seconds()
            
            hours, remainder = divmod(time_until_reset, 3600)
            minutes, seconds = divmod(remainder, 60)
            
            duration_str = ""
            if hours > 0:
                duration_str += f"{int(hours)} hours "
            if minutes > 0:
                duration_str += f"{int(minutes)} minutes "
            duration_str += f"{int(seconds)} seconds"
            
            logger.warning(f"Rate limit exceeded for user {user.email} ({self.rate_limiter_type})")
            raise HTTPException(
                status_code=429, 
                detail=f"Daily limit reached. You can submit again in {duration_str}."
            )
        
        logger.debug(f"Rate limit check passed for user {user.email}: {len(current_entries)}/{self.requests}")
        return user  # Return user for later registration

    async def register_usage(self, user_id: str):
        """Register rate limit usage after successful operation"""
        now = get_current_datetime()
        new_entry = RateLimitEntry(
            user_id=user_id,
            rate_limiter_type=self.rate_limiter_type,
            expiration_time=now + timedelta(seconds=self.window)
        )
        await new_entry.insert()
        logger.debug(f"Rate limit usage registered for user {user_id} ({self.rate_limiter_type})")

    async def __call__(self, request: Request, user: User = Depends(get_current_user)):
        """Original method - checks and registers immediately (for argument_rate_limiter)"""
        now = get_current_datetime()
        user_id = str(user.id)
        
        # Remove expired timestamps from the database
        await RateLimitEntry.find(
            RateLimitEntry.user_id == user_id,
            RateLimitEntry.rate_limiter_type == self.rate_limiter_type,
            RateLimitEntry.expiration_time <= now
        ).delete()

        current_entries = await RateLimitEntry.find(
            RateLimitEntry.user_id == user_id,
            RateLimitEntry.rate_limiter_type == self.rate_limiter_type
        ).to_list()
        
        if len(current_entries) >= self.requests:
            # Calculate time until reset based on the oldest entry's timestamp plus the window duration
            oldest_entry = min(current_entries, key=lambda entry: entry.timestamp)
            # Ensure oldest_entry.timestamp is in IST timezone
            oldest_timestamp = ensure_ist_timezone(oldest_entry.timestamp)

            time_until_reset = (oldest_timestamp + timedelta(seconds=self.window) - now).total_seconds()
            
            hours, remainder = divmod(time_until_reset, 3600)
            minutes, seconds = divmod(remainder, 60)
            
            duration_str = ""
            if hours > 0:
                duration_str += f"{int(hours)} hours "
            if minutes > 0:
                duration_str += f"{int(minutes)} minutes "
            duration_str += f"{int(seconds)} seconds"
            
            logger.warning(f"Rate limit exceeded for user {user.email} ({self.rate_limiter_type})")
            raise HTTPException(
                status_code=429, 
                detail=f"Daily argument limit reached. You can submit again in {duration_str}."
            )
        
        # Add new entry to the database
        new_entry = RateLimitEntry(
            user_id=user_id,
            rate_limiter_type=self.rate_limiter_type,
            expiration_time=now + timedelta(seconds=self.window)
        )
        await new_entry.insert()
        logger.debug(f"Rate limit usage registered for user {user.email} ({self.rate_limiter_type})")
        
        return None

argument_rate_limiter = RateLimiter(
    settings.argument_rate_limit,
    settings.argument_rate_window,
    "argument_rate_limiter"
)

case_generation_rate_limiter = RateLimiter(
    settings.case_generation_rate_limit,
    settings.case_generation_rate_window,
    "case_generation_rate_limiter"
)
