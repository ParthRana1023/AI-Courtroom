# app/schemas/user.py
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
from datetime import date
from typing import Optional, Literal

# Gender type definition
Gender = Literal["male", "female", "others", "prefer-not-to-say"]

class UserCreate(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: date
    phone_number: str
    email: EmailStr
    password: str
    google_id: Optional[str] = None  # For Google OAuth registrations
    gender: Gender  # Required - user must select one of the 4 options
    profile_photo_url: Optional[str] = None  # Optional - from Google OAuth or user upload

    @field_validator('phone_number')
    def validate_phone_number(cls, value):
        # Remove any non-digit characters
        digits = ''.join(filter(str.isdigit, value))
        if len(digits) != 10:
            raise ValueError("Phone number must be exactly 10 digits")
        return digits

    @field_validator('date_of_birth')
    def validate_age(cls, value):
        today = date.today()
        # Calculate age
        age = today.year - value.year - ((today.month, today.day) < (value.month, value.day))
        if age < 18:
            raise ValueError("You must be at least 18 years old to register")
        return value

    @field_validator('password')
    def validate_password(cls, value):
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(char.isdigit() for char in value):
            raise ValueError("Password must contain at least 1 digit")
        if not any(char.isalpha() for char in value):
            raise ValueError("Password must contain at least 1 letter")
        if not any(char in "@$!%*#?&" for char in value):
            raise ValueError("Password must contain at least 1 special character")
        return value

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    first_name: str
    last_name: str
    date_of_birth: date
    phone_number: str
    email: EmailStr
    gender: Optional[Gender] = None  # Optional for backwards compatibility with existing users
    profile_photo_url: Optional[str] = None  # Cloudinary URL for profile photo (optional)
    nickname: Optional[str] = None  # User's preferred display name
