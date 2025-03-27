# app/utils/rate_limiter.py
from fastapi import Depends, HTTPException
from starlette.requests import Request
from datetime import datetime, timedelta
from app.dependencies import get_current_user
from typing import Dict, List
import time
from app.models.user import User

class RateLimiter:
    def __init__(self, requests: int, window: int):
        self.requests = requests
        self.window = window
        self.history: Dict[str, List[float]] = {}

    def reset(self):
        self.history = {}

    async def __call__(self, request: Request, user: User = Depends(get_current_user)):
        now = time.time()
        user_id = str(user.id)
        
        if user_id not in self.history:
            self.history[user_id] = []
        
        # Remove expired timestamps
        self.history[user_id] = [t for t in self.history[user_id] if t > now - self.window]
        
        if len(self.history[user_id]) >= self.requests:
            raise HTTPException(
                status_code=429, 
                detail="Too many requests. Please try again later."
            )
        
        self.history[user_id].append(now)
        return None