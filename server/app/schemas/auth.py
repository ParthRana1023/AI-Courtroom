# app/schemas/auth.py
"""Authentication-related Pydantic schemas."""

from typing import Literal

from pydantic import BaseModel

Gender = Literal["male", "female", "others", "prefer-not-to-say"]


class GoogleLoginRequest(BaseModel):
    """Request body for Google OAuth login."""

    credential: str | None = None  # ID token (native Google sign-in)
    code: str | None = None  # Auth Code from authorization code flow
    state: str | None = None  # State parameter for CSRF protection
    remember_me: bool = False


class ProfileUpdateRequest(BaseModel):
    """Request body for updating user profile."""

    # Required fields for existing update functionality
    phone_number: str | None = None
    date_of_birth: str | None = None  # Will be parsed as date
    # New editable fields
    first_name: str | None = None
    last_name: str | None = None
    nickname: str | None = None  # User's preferred display name
    gender: Gender | None = None  # male, female, others, prefer-not-to-say
    # Location fields
    city: str | None = None
    state: str | None = None
    state_iso2: str | None = None
    country: str | None = None
    country_iso2: str | None = None
    phone_code: str | None = None
