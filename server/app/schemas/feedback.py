from pydantic import BaseModel, EmailStr, Field
from beanie.odm.fields import PydanticObjectId as ObjectId
from datetime import datetime

class FeedbackCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone_number: str = Field(..., min_length=5, max_length=20)
    message: str = Field(..., min_length=10, max_length=2000)

class FeedbackOut(FeedbackCreate):
    id: str = Field(..., alias="_id")
    created_at: str

    class Config:
        from_attributes = True
        populate_by_name = True
        json_encoders = {
            ObjectId: str,
            datetime: lambda dt: dt.isoformat()
        }