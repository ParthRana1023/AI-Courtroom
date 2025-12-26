# app/schemas/auth.py
"""Authentication-related Pydantic schemas."""
from pydantic import BaseModel
from typing import Optional


class GoogleLoginRequest(BaseModel):
    """Request body for Google OAuth login."""
    credential: Optional[str] = None  # ID Token from Google Login component
    access_token: Optional[str] = None # Access Token from useGoogleLogin hook
    remember_me: bool = False


class GoogleLoginResponse(BaseModel):
    """Response for Google OAuth login - may include user data for new users."""
    access_token: Optional[str] = None
    token_type: str = "bearer"
    is_new_user: bool = False
    # Google user data for new users to pre-fill registration form
    google_user_data: Optional[dict] = None


class ProfileUpdateRequest(BaseModel):
    """Request body for updating user profile."""
    phone_number: str
    date_of_birth: str  # Will be parsed as date
