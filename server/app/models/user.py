# app/models/user.py
from beanie import Document
from pydantic import ConfigDict, EmailStr
from datetime import date  # Change from datetime

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