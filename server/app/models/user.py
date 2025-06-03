# app/models/user.py
from beanie import Document
from pydantic import BaseModel, ConfigDict, EmailStr
from datetime import date

class User(Document):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    
    first_name: str
    last_name: str
    date_of_birth: date  # Changed to date type
    phone_number: str
    email: EmailStr
    password_hash: str

    class Settings:
        name = "users"

class TokenResponse(BaseModel):
    access_token: str
    token_type: str