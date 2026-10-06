# app/schemas/user.py
from datetime import date
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from app.models.user import AuthMethod, PartialScoring
from app.utils.datetime import get_current_datetime
from app.utils.llm_trace import is_developer

# Gender type definition
Gender = Literal["male", "female", "others", "prefer-not-to-say"]

# Case location preference type
CaseLocationPreference = Literal["user_location", "specific_state", "random"]


def validate_password_strength(value: str) -> str:
    """The password rules shown on the sign-up form; raises ValueError on the first miss."""
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not any(char.isdigit() for char in value):
        raise ValueError("Password must contain at least 1 digit")
    if not any(char.isalpha() for char in value):
        raise ValueError("Password must contain at least 1 letter")
    if not any(char in "@$!%*#?&" for char in value):
        raise ValueError("Password must contain at least 1 special character")
    return value


def is_adult(born: date) -> bool:
    today = get_current_datetime().date()
    age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    return age >= 18


class UserCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    # The sign-up form's "I'm 18 or older" box. Older app versions send a date
    # of birth instead, which is accepted in its place.
    confirm_adult: bool = False
    google_id: str | None = None  # Set by the server from google_signup_token
    google_signup_token: str | None = None  # From /auth/google for new users
    profile_photo_url: str | None = None  # Optional - from Google OAuth or user upload

    # Asked later (profile, seat of practice); still accepted from older apps.
    date_of_birth: date | None = None
    phone_number: str | None = None
    gender: Gender | None = None
    city: str | None = None
    state: str | None = None
    state_iso2: str | None = None
    country: str | None = None
    country_iso2: str | None = None
    phone_code: str | None = None

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, value: str) -> str:
        return value.lower()

    @field_validator("phone_number")
    def validate_phone_number(cls, value):
        if value is None:
            return None
        # Remove any non-digit characters
        digits = "".join(filter(str.isdigit, value))
        if len(digits) != 10:
            raise ValueError("Phone number must be exactly 10 digits")
        return digits

    @field_validator("date_of_birth")
    def validate_age(cls, value):
        if value is not None and not is_adult(value):
            raise ValueError("You must be at least 18 years old to register")
        return value

    @field_validator("password")
    def validate_password(cls, value):
        return validate_password_strength(value)

    @model_validator(mode="after")
    def require_adult(self):
        if not self.confirm_adult and self.date_of_birth is None:
            raise ValueError("You must be at least 18 years old to register")
        return self


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    first_name: str
    last_name: str
    date_of_birth: date | None = None
    phone_number: str | None = None
    email: EmailStr | None = None  # None for accounts made with a phone number
    # Read from User.sign_in_method, which infers it for older accounts.
    auth_method: AuthMethod = Field(validation_alias="sign_in_method")
    gender: Gender | None = (
        None  # Optional for backwards compatibility with existing users
    )
    profile_photo_url: str | None = None  # Cloudinary URL for profile photo (optional)
    nickname: str | None = None  # User's preferred display name

    # Location fields
    city: str | None = None
    state: str | None = None
    state_iso2: str | None = None
    country: str | None = None
    country_iso2: str | None = None
    phone_code: str | None = None

    # Case generation preferences
    case_location_preference: CaseLocationPreference | None = "random"
    preferred_case_state: str | None = None
    rag_enabled: bool = True
    partial_scoring: PartialScoring = "zero"

    @computed_field
    @property
    def is_developer(self) -> bool:
        """Whether this user may turn on developer mode (see DEV_MODE_EMAILS)."""
        return is_developer(self.email)


class CaseLocationPreferenceUpdate(BaseModel):
    """Schema for updating case location preference from settings."""

    case_location_preference: CaseLocationPreference
    preferred_case_state: str | None = (
        None  # Required when preference is "specific_state"
    )

    @model_validator(mode="after")
    def validate_preferred_state(self):
        """Validate that preferred_case_state is provided when preference is 'specific_state'."""
        if (
            self.case_location_preference == "specific_state"
            and not self.preferred_case_state
        ):
            raise ValueError(
                "preferred_case_state is required when preference is 'specific_state'"
            )
        return self


class RagPreferenceUpdate(BaseModel):
    """Schema for updating the user's RAG preference from settings."""

    rag_enabled: bool


class StatsPreferenceUpdate(BaseModel):
    """Schema for choosing how partly successful cases count toward the win rate."""

    partial_scoring: PartialScoring
