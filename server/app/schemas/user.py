# app/schemas/user.py
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
from datetime import date
from typing import Optional

class UserCreate(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: date
    phone_number: str
    email: EmailStr
    password: str
    google_id: Optional[str] = None  # For Google OAuth registrations

    @field_validator('phone_number')
    def validate_phone_number(cls, value):
        # Remove any non-digit characters
        digits = ''.join(filter(str.isdigit, value))
        if len(digits) != 10:
            raise ValueError("Phone number must be exactly 10 digits")
        return digits

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
