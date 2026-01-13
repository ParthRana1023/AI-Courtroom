# app/routes/rate_limit.py
from fastapi import APIRouter, Depends, HTTPException
from app.dependencies import get_current_user
from app.models.user import User
from app.utils.rate_limiter import argument_rate_limiter, case_generation_rate_limiter
from app.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["rate_limit"])

@router.get("/argument")
async def get_argument_rate_limit(current_user: User = Depends(get_current_user)):
    """Get the remaining argument submissions and time until reset for the current user"""
    user_id = str(current_user.id)
    logger.debug(f"Checking argument rate limit for user: {current_user.email}")
    
    try:
        remaining, seconds_until_next = await argument_rate_limiter.get_remaining_attempts(user_id)
    except Exception as e:
        logger.error(f"Error getting argument rate limit for {current_user.email}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get rate limit status. Please try again.")
    
    return {
        "remaining_attempts": remaining,
        "max_attempts": argument_rate_limiter.requests,
        "seconds_until_next": seconds_until_next
    }

@router.get("/case-generation")
async def get_case_generation_rate_limit(current_user: User = Depends(get_current_user)):
    """Get the remaining case generation submissions and time until reset for the current user"""
    user_id = str(current_user.id)
    logger.debug(f"Checking case generation rate limit for user: {current_user.email}")
    
    try:
        remaining, seconds_until_next = await case_generation_rate_limiter.get_remaining_attempts(user_id)
    except Exception as e:
        logger.error(f"Error getting case generation rate limit for {current_user.email}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get rate limit status. Please try again.")
    
    return {
        "remaining_attempts": remaining,
        "max_attempts": case_generation_rate_limiter.requests,
        "seconds_until_next": seconds_until_next
    }
