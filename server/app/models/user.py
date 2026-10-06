# app/models/user.py
from datetime import date
from typing import ClassVar, Literal

from beanie import Document
from pydantic import BaseModel, ConfigDict, EmailStr
from pymongo import IndexModel

# Gender type definition
Gender = Literal["male", "female", "others", "prefer-not-to-say"]

# Case location preference type
CaseLocationPreference = Literal["user_location", "specific_state", "random"]

# How a partly successful case counts toward the win rate
PartialScoring = Literal["zero", "half", "exclude"]

# How the account was created; it decides which sign-in details are locked
AuthMethod = Literal["email", "phone", "google"]


class User(Document):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    first_name: str
    last_name: str
    date_of_birth: date | None = None
    phone_number: str | None = None
    email: EmailStr | None = None  # stored lowercase; None for phone sign-ups
    password_hash: str | None = None  # None for Google and phone accounts
    # Set for accounts created since sign-in methods were tracked; use sign_in_method.
    auth_method: AuthMethod | None = None
    google_id: str | None = None  # Google user ID for OAuth users
    gender: Gender | None = None  # User's gender preference
    profile_photo_url: str | None = None  # Cloudinary URL for profile photo
    nickname: str | None = None  # User's preferred nickname

    # Location fields
    city: str | None = None
    state: str | None = None
    state_iso2: str | None = None  # ISO2 code for state (e.g., "MH")
    country: str | None = None
    country_iso2: str | None = None  # ISO2 code for country (e.g., "IN")
    phone_code: str | None = None  # Country phone code (e.g., "91")

    # Case generation preferences
    case_location_preference: CaseLocationPreference = "random"  # Default to random
    preferred_case_state: str | None = (
        None  # ISO2 code when preference is "specific_state"
    )
    rag_enabled: bool = True
    partial_scoring: PartialScoring = "zero"

    @property
    def sign_in_method(self) -> AuthMethod:
        """How the account was created; older accounts are inferred."""
        return self.auth_method or ("google" if self.google_id else "email")

    class Settings:
        name = "users"
        # Unset fields are left out of the document rather than stored as null, so
        # phone accounts have no email at all and the sparse index below skips them.
        keep_nulls = False
        indexes: ClassVar[list[IndexModel]] = [
            # Unique among accounts that have an email.
            IndexModel([("email", 1)], name="email_unique", unique=True, sparse=True),
            IndexModel([("phone_code", 1), ("phone_number", 1)], name="phone"),
        ]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
