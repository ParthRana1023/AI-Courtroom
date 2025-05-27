from beanie import Document
from datetime import datetime
from pydantic import Field, EmailStr

class Feedback(Document):
    first_name: str
    last_name: str
    email: EmailStr
    phone_number: str
    message: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "feedback"