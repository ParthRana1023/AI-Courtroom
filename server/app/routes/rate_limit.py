# app/routes/rate_limit.py
from fastapi import APIRouter, Depends
from app.dependencies import get_current_user
from app.models.user import User
from app.utils.rate_limiter import argument_rate_limiter, case_generation_rate_limiter

router = APIRouter(tags=["rate_limit"])

@router.get("/argument")

async def get_argument_rate_limit(current_user: User = Depends(get_current_user)):
    """Get the remaining argument submissions and time until reset for the current user"""
    user_id = str(current_user.id)
    remaining, seconds_until_next = argument_rate_limiter.get_remaining_attempts(user_id)
    
    return {
        "remaining_attempts": remaining,
        "max_attempts": rate_limiter.requests,
        "seconds_until_next": seconds_until_next
    }

@router.get("/case-generation")
async def get_case_generation_rate_limit(current_user: User = Depends(get_current_user)):
    """Get the remaining case generation submissions and time until reset for the current user"""
    user_id = str(current_user.id)
    remaining, seconds_until_next = case_generation_rate_limiter.get_remaining_attempts(user_id)
    
    return {
        "remaining_attempts": remaining,
        "max_attempts": case_generation_rate_limiter.requests,
        "seconds_until_next": seconds_until_next
    }