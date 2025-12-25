from beanie import Document
from datetime import datetime
from pydantic import Field, EmailStr
from app.utils.datetime import get_current_datetime

class Feedback(Document):
    user_id: str
    first_name: str
    last_name: str
    email: EmailStr
    phone_number: str
    feedback_category: str
    message: str
    created_at: datetime = Field(default_factory=get_current_datetime)

    class Settings:
        name = "feedback"