# app/models/otp.py
from datetime import datetime
from typing import ClassVar

from beanie import Document
from pydantic import BaseModel, EmailStr, field_validator
from pymongo import IndexModel

from app.schemas.user import UserCreate


class OTP(Document):
    email: str
    otp: str
    expiry: datetime
    is_registration: bool = True
    attempts: int = 0  # verification tries so far, right or wrong

    class Settings:
        name = "otp"
        indexes: ClassVar[list[IndexModel]] = [
            IndexModel([("email", 1)]),
            # MongoDB deletes each code once its expiry passes.
            IndexModel([("expiry", 1)], expireAfterSeconds=0),
        ]


class RegistrationVerifyRequest(BaseModel):
    user_data: UserCreate
    otp: str
    remember_me: bool = False


class LoginVerifyRequest(BaseModel):
    email: EmailStr
    otp: str
    remember_me: bool = False

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, value: str) -> str:
        return value.lower()
