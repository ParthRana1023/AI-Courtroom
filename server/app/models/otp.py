# app/models/otp.py
from datetime import datetime
from beanie import Document
from pydantic import BaseModel, EmailStr
from app.schemas.user import UserCreate

class OTP(Document):
    email: str
    otp: str
    expiry: datetime
    is_registration: bool = True

    class Settings:
        name = "otp"

class RegistrationVerifyRequest(BaseModel):
    user_data: UserCreate
    otp: str

class LoginVerifyRequest(BaseModel):
    email: EmailStr
    otp: str
    remember_me: bool = False