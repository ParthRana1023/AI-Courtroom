from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime

class User(BaseModel):
    username: str
    email: EmailStr
    password: str

class LoginUser(BaseModel):
    username_or_email: str
    password: str

    @field_validator("username_or_email")
    def validate_username_or_email(cls, value):
        if "@" in value:
            if not "@" in value or "." not in value.split("@")[-1]:
                raise ValueError("Invalid email address format")
        return value
    
    @field_validator("password")
    def validate_password(cls, value):
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not any(char.isdigit() for char in value):
            raise ValueError("Password must contain at least one number")
        if not any(char in "!@#$%^&*" for char in value):
            raise ValueError("Password must contain at least one special character")
        return value

class ChatMessage(BaseModel):
    user_id: str
    message: str
    response: str
    timestamp: datetime

class Argument(BaseModel):
    case_id: str
    user_id: str
    user_argument: str
    role: str  # Either "defense" or "accusation"

# Case schema
class Case(BaseModel):
    case_id: str
    title: str
    description: Optional[str]
    details: str
