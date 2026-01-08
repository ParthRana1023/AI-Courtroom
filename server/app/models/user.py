# app/models/user.py
from beanie import Document
from pydantic import BaseModel, ConfigDict, EmailStr
from datetime import date
from typing import Optional, Literal

# Gender type definition
Gender = Literal["male", "female", "others", "prefer-not-to-say"]

class User(Document):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    
    first_name: str
    last_name: str
    date_of_birth: date  # Changed to date type
    phone_number: str
    email: EmailStr
    password_hash: Optional[str] = None  # Optional for Google OAuth users
    google_id: Optional[str] = None  # Google user ID for OAuth users
    gender: Optional[Gender] = None  # User's gender preference
    profile_photo_url: Optional[str] = None  # Cloudinary URL for profile photo
    nickname: Optional[str] = None  # User's preferred nickname

    class Settings:
        name = "users"

class TokenResponse(BaseModel):
    access_token: str
    token_type: str


class GoogleTokenResponse(BaseModel):
    access_token: str
    token_type: str
    is_new_user: bool = False