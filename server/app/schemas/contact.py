from pydantic import BaseModel, EmailStr, Field

class ContactRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone_number: str = Field(..., min_length=5, max_length=20)
    message: str = Field(..., min_length=10, max_length=2000)