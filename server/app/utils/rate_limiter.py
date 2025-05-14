# app/utils/rate_limiter.py
from fastapi import Depends, HTTPException
from starlette.requests import Request
from datetime import datetime, timedelta
from app.dependencies import get_current_user
from typing import Dict, List, Tuple, Optional
import time
from app.models.user import User

class RateLimiter:
    def __init__(self, requests: int, window: int):
        self.requests = requests
        self.window = window
        self.history: Dict[str, List[float]] = {}

    def reset(self):
        self.history = {}
    
    def get_remaining_attempts(self, user_id: str) -> Tuple[int, Optional[float]]:
        """Get remaining attempts and time until reset for a user
        
        Returns:
            Tuple containing (remaining_attempts, seconds_until_next_attempt)
            If seconds_until_next_attempt is None, user can submit immediately
        """
        now = time.time()
        if user_id not in self.history:
            return self.requests, None
        
        # Remove expired timestamps
        valid_timestamps = [t for t in self.history[user_id] if t > now - self.window]
        self.history[user_id] = valid_timestamps
        
        remaining = max(0, self.requests - len(valid_timestamps))
        
        # If no attempts remaining, calculate time until next attempt is allowed
        if remaining == 0 and valid_timestamps:
            oldest_timestamp = min(valid_timestamps)
            time_until_reset = (oldest_timestamp + self.window) - now
            return 0, time_until_reset
        
        return remaining, None

    async def __call__(self, request: Request, user: User = Depends(get_current_user)):
        now = time.time()
        user_id = str(user.id)
        
        if user_id not in self.history:
            self.history[user_id] = []
        
        # Remove expired timestamps
        self.history[user_id] = [t for t in self.history[user_id] if t > now - self.window]
        
        if len(self.history[user_id]) >= self.requests:
            oldest_timestamp = min(self.history[user_id])
            time_until_reset = (oldest_timestamp + self.window) - now
            reset_time = datetime.fromtimestamp(now + time_until_reset).strftime('%H:%M:%S')
            
            raise HTTPException(
                status_code=429, 
                detail=f"Daily argument limit reached. You can submit again in {int(time_until_reset)} seconds (at {reset_time})."
            )
        
        self.history[user_id].append(now)
        return None

# Create a global instance for daily argument rate limiting
# 10 arguments per day (86400 seconds)
rate_limiter = RateLimiter(10, 86400)