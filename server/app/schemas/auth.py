# app/schemas/auth.py
"""Authentication-related Pydantic schemas."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, EmailStr, field_validator, model_validator

from app.schemas.user import is_adult, validate_password_strength

Gender = Literal["male", "female", "others", "prefer-not-to-say"]


class GoogleLoginRequest(BaseModel):
    """Request body for Google OAuth login."""

    credential: str | None = None  # ID token (native Google sign-in)
    code: str | None = None  # Auth Code from authorization code flow
    state: str | None = None  # State parameter for CSRF protection
    remember_me: bool = False


class ProfileUpdateRequest(BaseModel):
    """Edit profile. Only the fields sent are changed; an optional field sent
    empty (or null) is cleared. First and last name can't be cleared."""

    first_name: str | None = None
    last_name: str | None = None
    nickname: str | None = None
    gender: Gender | None = None
    date_of_birth: date | None = None
    email: EmailStr | None = None  # editable for phone accounts only
    phone_code: str | None = None
    phone_number: str | None = None  # locked for phone accounts
    city: str | None = None
    state: str | None = None
    state_iso2: str | None = None
    country: str | None = None
    country_iso2: str | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def name_required(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("First and last name are required")
        return value.strip() if value else value

    @field_validator("email", mode="before")
    @classmethod
    def email_blank_is_none(cls, value):
        value = value.strip() if isinstance(value, str) else value
        return value.lower() if value else None

    @field_validator("date_of_birth", mode="before")
    @classmethod
    def birth_blank_is_none(cls, value):
        return value or None

    @field_validator("date_of_birth")
    @classmethod
    def plausible_birth(cls, value: date | None) -> date | None:
        if value is None:
            return None
        if value.year < 1900:
            raise ValueError("Enter a year from 1900 on")
        if not is_adult(value):
            raise ValueError("You must be at least 18 years old")
        return value

    @model_validator(mode="after")
    def check_phone(self):
        if self.phone_number:
            self.phone_code, self.phone_number = normalize_phone(
                self.phone_code or "91", self.phone_number
            )
        elif "phone_number" in self.model_fields_set:
            self.phone_number = None
        return self


class EmailCodeRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, value: str) -> str:
        return value.strip().lower()


class CodeRequest(BaseModel):
    code: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return validate_password_strength(value)


class DeleteAccountRequest(BaseModel):
    """Confirm with the password, or with an emailed code when there is none."""

    password: str | None = None
    code: str | None = None
    confirm: str  # the user types DELETE

    @model_validator(mode="after")
    def check(self):
        if self.confirm != "DELETE":
            raise ValueError("Type DELETE to confirm")
        if not self.password and not self.code:
            raise ValueError("Enter your password or the emailed code")
        return self


class GoogleLinkRequest(BaseModel):
    """Connect a Google account. Like GoogleLoginRequest, either an ID token or
    an authorization code with its state."""

    credential: str | None = None
    code: str | None = None
    state: str | None = None
    # From an earlier reply that asked which email to keep (a Google code works once).
    link_token: str | None = None
    # When the Google email differs: True makes it the account email. Left out,
    # the reply asks the user to choose.
    use_google_email: bool | None = None


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
