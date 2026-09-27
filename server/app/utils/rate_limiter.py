# app/utils/rate_limiter.py
import math
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException

from app import messages
from app.config import settings
from app.dependencies import get_current_user
from app.logging_config import get_logger
from app.models.rate_limit import RateLimitEntry
from app.models.user import User
from app.utils.datetime import get_current_datetime, get_timezone

logger = get_logger(__name__)


def ensure_ist_timezone(dt: datetime) -> datetime:
    """Ensure a datetime is in IST timezone.

    MongoDB stores timestamps in UTC internally. This function converts
    any datetime (whether naive, UTC, or other timezone) to IST.
    """
    ist = get_timezone()  # Asia/Kolkata

    if dt.tzinfo is None:
        # Naive datetime - assume it's UTC (as MongoDB returns UTC)
        dt = dt.replace(tzinfo=UTC)

    # Convert to IST
    return dt.astimezone(ist)


def format_wait(seconds: float) -> str:
    """Wait time in hours and minutes, e.g. "3 hours and 5 minutes" or "1 minute".

    Rounded up to the next minute, so the user is never told to come back early.
    """
    hours, minutes = divmod(max(1, math.ceil(seconds / 60)), 60)
    parts = []
    if hours:
        parts.append(f"{hours} hour{'s' if hours != 1 else ''}")
    if minutes:
        parts.append(f"{minutes} minute{'s' if minutes != 1 else ''}")
    return " and ".join(parts)


class RateLimiter:
    def __init__(
        self,
        requests: int,
        window: int,
        rate_limiter_type: str,
        limit_message: str = messages.ARGUMENT_LIMIT,
    ):
        self.requests = requests
        self.window = window
        self.rate_limiter_type = rate_limiter_type
        # Shown by check_only; {wait} becomes the time until the next free slot.
        self.limit_message = limit_message

    async def get_remaining_attempts(self, user_id: str) -> tuple[int, float | None]:
        """Remaining attempts and seconds until the next one frees up.

        Seconds is None when the user can submit right now.
        """
        now = get_current_datetime()
        await RateLimitEntry.find(
            RateLimitEntry.user_id == user_id,
            RateLimitEntry.rate_limiter_type == self.rate_limiter_type,
            RateLimitEntry.expiration_time <= now,
        ).delete()
        entries = await RateLimitEntry.find(
            RateLimitEntry.user_id == user_id,
            RateLimitEntry.rate_limiter_type == self.rate_limiter_type,
        ).to_list()

        remaining = max(0, self.requests - len(entries))
        if remaining:
            return remaining, None
        oldest = ensure_ist_timezone(min(entry.timestamp for entry in entries))
        return 0, (oldest + timedelta(seconds=self.window) - now).total_seconds()

    async def ensure_available(self, key: str, message: str) -> None:
        """Raise 429 if ``key`` is out of attempts.

        ``message`` is the error shown to the user; ``{minutes}`` in it is
        replaced with the wait time.
        """
        remaining, seconds = await self.get_remaining_attempts(key)
        if remaining or seconds is None:
            return
        minutes = max(1, math.ceil(seconds / 60))
        logger.warning(f"Rate limit reached for {key} ({self.rate_limiter_type})")
        raise HTTPException(status_code=429, detail=message.format(minutes=minutes))

    async def check_only(self, user: User = Depends(get_current_user)) -> User:
        """FastAPI dependency: 429 if the limit is reached, else the current user.

        Usage is recorded separately with register_usage() once the work succeeds.
        """
        remaining, seconds = await self.get_remaining_attempts(str(user.id))
        if remaining or seconds is None:
            return user

        logger.warning(
            f"Rate limit exceeded for user {user.email} ({self.rate_limiter_type})"
        )
        raise HTTPException(
            status_code=429,
            detail=self.limit_message.format(wait=format_wait(seconds)),
        )

    async def register_usage(self, user_id: str):
        """Register rate limit usage after successful operation"""
        now = get_current_datetime()
        await RateLimitEntry(
            user_id=user_id,
            rate_limiter_type=self.rate_limiter_type,
            expiration_time=now + timedelta(seconds=self.window),
        ).insert()
        logger.debug(
            f"Rate limit usage registered for user {user_id} ({self.rate_limiter_type})"
        )


argument_rate_limiter = RateLimiter(
    settings.argument_rate_limit, settings.argument_rate_window, "argument_rate_limiter"
)

case_generation_rate_limiter = RateLimiter(
    settings.case_generation_rate_limit,
    settings.case_generation_rate_window,
    "case_generation_rate_limiter",
    messages.CASE_GENERATION_LIMIT,
)

# The limiters below run before login, so they are keyed by email or IP, not user id.
otp_send_rate_limiter = RateLimiter(
    settings.otp_send_limit, settings.otp_send_window, "otp_send_rate_limiter"
)

# Only wrong passwords are recorded. Per email stops guessing one account; per IP
# stops one client trying many accounts.
login_failure_email_limiter = RateLimiter(
    settings.login_failure_limit, settings.login_failure_window, "login_failure_email"
)
login_failure_ip_limiter = RateLimiter(
    settings.login_failure_ip_limit, settings.login_failure_window, "login_failure_ip"
)

# Silent burst guard: normal chatting never hits it; scripted spam does.
party_chat_rate_limiter = RateLimiter(
    settings.party_chat_rate_limit, settings.party_chat_rate_window, "party_chat"
)
