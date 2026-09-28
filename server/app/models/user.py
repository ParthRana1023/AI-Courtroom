# app/models/user.py
from datetime import date
from typing import Annotated, Literal

from beanie import Document, Indexed
from pydantic import BaseModel, ConfigDict, EmailStr

# Gender type definition
Gender = Literal["male", "female", "others", "prefer-not-to-say"]

# Case location preference type
CaseLocationPreference = Literal["user_location", "specific_state", "random"]


class User(Document):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    first_name: str
    last_name: str
    date_of_birth: date  # Changed to date type
    phone_number: str
    email: Annotated[EmailStr, Indexed(unique=True)]  # stored lowercase
    password_hash: str | None = None  # Optional for Google OAuth users
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

    class Settings:
        name = "users"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
