import re
from datetime import date, timedelta
from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator

from app.utils.datetime import get_current_datetime

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
PHONE_RE = re.compile(r"^\+?[\d\s()-]{8,}$")


class FeedbackCategory(str, Enum):
    GENERAL = "general"
    COURTROOM = "courtroom"
    CASE_GENERATION = "case_generation"
    USER_INTERFACE = "user_interface"
    PERFORMANCE = "performance"
    BUG_REPORT = "bug_report"
    FEATURE_REQUEST = "feature_request"
    ACCOUNT_SUPPORT = "account_support"
    ACCOUNT_RECOVERY = "account_recovery"
    LEGAL_INQUIRY = "legal_inquiry"
    OTHER = "other"


class FeedbackCreate(BaseModel):
    feedback_category: FeedbackCategory = Field(
        ..., description="Category of the feedback"
    )
    # Optional only for account recovery; otherwise at least 10 characters.
    message: str = Field("", max_length=2000)
    # Guests must give both, so we can reply; signed-in senders' come from the account.
    name: str | None = Field(None, max_length=100)
    email: str | None = Field(None, max_length=254)
    # Account recovery only.
    account_identifier: str | None = Field(None, max_length=254)
    deleted_on: date | None = None

    @field_validator("message", "name", "email", "account_identifier")
    @classmethod
    def strip(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else v

    @field_validator("email")
    @classmethod
    def valid_email(cls, v: str | None) -> str | None:
        if v and not EMAIL_RE.match(v):
            raise ValueError("Enter a valid email address")
        return v.lower() if v else None

    @model_validator(mode="after")
    def check_category(self) -> "FeedbackCreate":
        recovery = self.feedback_category == FeedbackCategory.ACCOUNT_RECOVERY
        if not recovery and not self.message:
            raise ValueError("Message is required")
        if self.message and len(self.message) < 10:
            raise ValueError("Message must be at least 10 characters")
        if not recovery:
            self.account_identifier = self.deleted_on = None
            return self
        account = self.account_identifier or ""
        if not account:
            raise ValueError("Tell us the email or phone number on the account")
        if not (EMAIL_RE.match(account) or PHONE_RE.match(account)):
            raise ValueError("Enter an email address or a phone number")
        if self.deleted_on:
            # A day either side, for senders in other time zones.
            today = get_current_datetime().date()
            if (
                not today - timedelta(days=31)
                <= self.deleted_on
                <= today + timedelta(days=1)
            ):
                raise ValueError("Deleted accounts are kept for 30 days")
        return self


class FeedbackOut(BaseModel):
    id: str
    feedback_category: str
    created_at: str
