# app/routes/rate_limit.py
from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.logging_config import get_logger
from app.models.user import User
from app.utils.rate_limiter import (
    RateLimiter,
    argument_rate_limiter,
    case_generation_rate_limiter,
)

logger = get_logger(__name__)

router = APIRouter(tags=["rate_limit"])


async def limit_status(limiter: RateLimiter, user: User) -> dict:
    """Remaining submissions and seconds until the next one frees up."""
    try:
        remaining, seconds_until_next = await limiter.get_remaining_attempts(
            str(user.id)
        )
    except Exception:
        logger.exception(
            f"Error getting {limiter.rate_limiter_type} status for {user.email}"
        )
        raise HTTPException(
            status_code=500, detail="Failed to get rate limit status. Please try again."
        )
    return {
        "remaining_attempts": remaining,
        "max_attempts": limiter.requests,
        "seconds_until_next": seconds_until_next,
    }


@router.get("/argument")
async def get_argument_rate_limit(current_user: User = Depends(get_current_user)):
    return await limit_status(argument_rate_limiter, current_user)


@router.get("/case-generation")
async def get_case_generation_rate_limit(
    current_user: User = Depends(get_current_user),
):
    return await limit_status(case_generation_rate_limiter, current_user)
