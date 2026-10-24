# app/utils/rate_limiter.py
import asyncio
import contextlib
import math
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException

from app import messages
from app.config import settings
from app.dependencies import get_current_user
from app.logging_config import get_logger
from app.models.rate_limit import RateLimitEntry
from app.models.user import User
from app.utils.datetime import get_current_datetime, get_timezone
from app.utils.llm_trace import is_developer

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


# One lock per (limit, user): see RateLimiter.hold.
_held: defaultdict[tuple[str, str], asyncio.Lock] = defaultdict(asyncio.Lock)


class _KeyLocks:
    """One asyncio lock per key, dropped once nobody holds or awaits it: the keys
    of limits before sign-in (emails, IPs) come from anyone, so they mustn't pile up."""

    def __init__(self) -> None:
        self._locks: dict[tuple[str, str], asyncio.Lock] = {}
        self._users: dict[tuple[str, str], int] = {}

    @contextlib.asynccontextmanager
    async def hold(self, key: tuple[str, str]):
        lock = self._locks.setdefault(key, asyncio.Lock())
        self._users[key] = self._users.get(key, 0) + 1
        try:
            async with lock:
                yield
        finally:
            self._users[key] -= 1
            if not self._users[key]:
                del self._users[key], self._locks[key]


_reserving = _KeyLocks()


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
        # Not the key: it can be an email, a phone number or an IP.
        logger.warning(f"Rate limit reached ({self.rate_limiter_type})")
        raise HTTPException(status_code=429, detail=message.format(minutes=minutes))

    async def reserve(self, key: str, message: str) -> RateLimitEntry:
        """Take an attempt before the work rather than after: checking first and
        recording later lets parallel requests all pass the check. Checked and
        recorded under a lock for (limit, key), so of parallel attempts exactly
        the limit get through; the rest are refused (429). ``release`` it if the
        attempt shouldn't count. The lock is per process, like hold: one worker
        serves the API. (Ordering by insert instead isn't exact on a real server:
        an earlier insert can still be in flight when a later one counts.)"""
        async with _reserving.hold((self.rate_limiter_type, key)):
            remaining, seconds = await self.get_remaining_attempts(key)
            if not remaining and seconds is not None:
                logger.warning(f"Rate limit reached ({self.rate_limiter_type})")
                minutes = max(1, math.ceil(seconds / 60))
                raise HTTPException(
                    status_code=429, detail=message.format(minutes=minutes)
                )
            return await RateLimitEntry(
                user_id=key,
                rate_limiter_type=self.rate_limiter_type,
                expiration_time=get_current_datetime() + timedelta(seconds=self.window),
            ).insert()

    @staticmethod
    async def release(entry: RateLimitEntry) -> None:
        """Take back a reserved attempt that turned out not to count."""
        await entry.delete()

    async def hold(self, user: User = Depends(get_current_user)):
        """FastAPI dependency (with scope="function"): the current user, holding
        their lock for this limit until the route returns.

        Limits here are checked before the work and used up after it, so without
        the lock parallel requests (one per case, say) would all pass the check.
        One worker serves the API, so a process lock is enough.
        """
        async with _held[(self.rate_limiter_type, str(user.id))]:
            yield user

    async def check_alone(self, user: User = Depends(get_current_user)):
        """check_only while holding the user's lock for this limit (see hold)."""
        async with _held[(self.rate_limiter_type, str(user.id))]:
            yield await self.check_only(user)

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
        logger.debug(f"Rate limit usage registered ({self.rate_limiter_type})")


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
# Per address alone, one client could mail every address it likes and spend the
# day's email quota, which every sign-in needs.
otp_ip_rate_limiter = RateLimiter(
    settings.otp_ip_limit, settings.otp_ip_window, "otp_ip"
)

# Only wrong passwords are recorded. Per email stops guessing one account; per IP
# stops one client trying many accounts.
login_failure_email_limiter = RateLimiter(
    settings.login_failure_limit, settings.login_failure_window, "login_failure_email"
)
login_failure_ip_limiter = RateLimiter(
    settings.login_failure_ip_limit, settings.login_failure_window, "login_failure_ip"
)

# Client logs arrive from signed-out visitors too, so they are keyed by IP.
client_log_rate_limiter = RateLimiter(
    settings.client_log_rate_limit, settings.client_log_rate_window, "client_log"
)

# Contact messages come from guests too: keyed by sender (user id or guest email)
# and by IP. No captcha, so these are the only brake on spam.
contact_sender_limiter = RateLimiter(
    settings.contact_rate_limit, settings.contact_rate_window, "contact_sender"
)
contact_ip_limiter = RateLimiter(
    settings.contact_ip_rate_limit, settings.contact_rate_window, "contact_ip"
)

# Both share one counter ("witness_question"); developers just get a higher cap.
witness_question_rate_limiter = RateLimiter(
    settings.witness_question_rate_limit,
    settings.witness_question_rate_window,
    "witness_question",
    messages.WITNESS_QUESTION_LIMIT,
)
witness_question_dev_rate_limiter = RateLimiter(
    settings.witness_question_dev_rate_limit,
    settings.witness_question_rate_window,
    "witness_question",
    messages.WITNESS_QUESTION_LIMIT,
)


def witness_question_limiter_for(user: User) -> RateLimiter:
    if is_developer(user.email):
        return witness_question_dev_rate_limiter
    return witness_question_rate_limiter


# Silent burst guard: normal chatting never hits it; scripted spam does.
party_chat_rate_limiter = RateLimiter(
    settings.party_chat_rate_limit, settings.party_chat_rate_window, "party_chat"
)
