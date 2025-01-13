from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional

# User registration model
class User(BaseModel):
    username: str  # Do not normalize username
    email: EmailStr
    password: str

# Login model for login requests
class LoginUser(BaseModel):
    username_or_email: str  # Accepts either username or email
    password: str

    @field_validator("username_or_email")
    def validate_username_or_email(cls, value):
        if "@" in value:  # Check if it's likely an email
            if not "@" in value or "." not in value.split("@")[-1]:
                raise ValueError("Invalid email address format")
        return value  # Do not normalize to lowercase

# Chat Message schema
class ChatMessage(BaseModel):
    user_id: str
    message: str
    response: str
    timestamp: str
