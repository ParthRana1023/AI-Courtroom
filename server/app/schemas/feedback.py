from enum import Enum

from pydantic import BaseModel, Field


class FeedbackCategory(str, Enum):
    GENERAL = "general"
    COURTROOM = "courtroom"
    CASE_GENERATION = "case_generation"
    USER_INTERFACE = "user_interface"
    PERFORMANCE = "performance"
    BUG_REPORT = "bug_report"
    FEATURE_REQUEST = "feature_request"
    ACCOUNT_SUPPORT = "account_support"
    LEGAL_INQUIRY = "legal_inquiry"
    OTHER = "other"


class FeedbackCreate(BaseModel):
    feedback_category: FeedbackCategory = Field(
        ..., description="Category of the feedback"
    )
    message: str = Field(..., min_length=10, max_length=2000)


class FeedbackOut(BaseModel):
    id: str = Field(..., alias="_id")
    user_id: str
    first_name: str
    last_name: str
    email: str
    phone_number: str
    feedback_category: str
    message: str
    created_at: str
