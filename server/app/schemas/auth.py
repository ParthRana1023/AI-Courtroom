# app/schemas/auth.py
"""Authentication-related Pydantic schemas."""

from typing import Literal

from pydantic import BaseModel, EmailStr, field_validator, model_validator

from app.schemas.user import validate_password_strength

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


def normalize_phone(code: str, number: str) -> tuple[str, str]:
    """Digits-only country code and number, checked like the sign-up form does.

    Spaces, brackets and dashes are dropped; +91 numbers need 10 digits, others 6–14.
    """
    code = code.strip().lstrip("+")
    digits = "".join(ch for ch in number if ch not in " ()-")
    if not code.isdigit() or not 1 <= len(code) <= 4:
        raise ValueError("Choose a country code")
    if not digits:
        raise ValueError("Mobile number is required")
    if not digits.isdigit():
        raise ValueError("Use digits only")
    if code == "91" and len(digits) != 10:
        raise ValueError("Enter a 10-digit mobile number")
    if not 6 <= len(digits) <= 14:
        raise ValueError("Enter a valid mobile number")
    return code, digits


class PhoneOtpRequest(BaseModel):
    """Ask for a sign-in or sign-up code by SMS."""

    phone_code: str
    phone_number: str
    purpose: Literal["login", "register"]
    # Sign-up only
    first_name: str | None = None
    last_name: str | None = None
    confirm_adult: bool = False

    @model_validator(mode="after")
    def check(self):
        self.phone_code, self.phone_number = normalize_phone(
            self.phone_code, self.phone_number
        )
        if self.purpose == "register":
            if (
                not (self.first_name or "").strip()
                or not (self.last_name or "").strip()
            ):
                raise ValueError("First and last name are required")
            if not self.confirm_adult:
                raise ValueError("You must be at least 18 years old to register")
        return self

    @property
    def e164(self) -> str:
        return f"+{self.phone_code}{self.phone_number}"


class PhoneVerifyRequest(PhoneOtpRequest):
    otp: str
    remember_me: bool = False


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, value: str) -> str:
        return value.lower()


class ResetPasswordRequest(BaseModel):
    token: str
    password: str

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return validate_password_strength(value)
